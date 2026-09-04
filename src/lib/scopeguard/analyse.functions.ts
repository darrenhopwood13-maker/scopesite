import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectDeferrals, isAnnotationOnly, type DeferralPattern } from "./pipeline";
import { allocate, type CodePrefix, type InterfaceRule, type TradeCue } from "./allocate";

import { DRAWING_STATUS, ITEM_TYPE } from "./vocab";

export const analyseDrawing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { drawingId: string }) => {
    if (!input?.drawingId) throw new Error("drawingId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: drawing, error: drawingError } = await supabase
      .from("drawings")
      .select("id, project_id, owner_id, storage_path, file_hash")
      .eq("id", data.drawingId)
      .single();

    if (drawingError || !drawing) throw new Error("Drawing not found");

    // Every child row is stamped from the parent drawing record.
    const stamp = { drawing_id: drawing.id, project_id: drawing.project_id, owner_id: drawing.owner_id };

    const fail = async (message: string) => {
      await supabase
        .from("drawings")
        .update({ status: DRAWING_STATUS.failed, error_message: message.slice(0, 500), analysed_at: new Date().toISOString() })
        .eq("id", drawing.id);
      return { status: DRAWING_STATUS.failed, error: message, items: 0 };
    };

    // Replacement is the LAST step. Existing findings stay untouched until a
    // complete new set has been built, so a failed read never wipes good data.
    const replaceItems = async (rows: Array<Record<string, unknown>>) => {
      const { error: delError } = await supabase.from("drawing_items").delete().eq("drawing_id", drawing.id);
      if (delError) throw new Error(`Could not clear the previous findings: ${delError.message}`);
      if (!rows.length) return;
      const { error } = await supabase.from("drawing_items").insert(rows as never);
      if (error) throw new Error(`Could not record findings: ${error.message}`);
    };

    try {
      await supabase.from("drawings").update({ status: DRAWING_STATUS.reading, error_message: null }).eq("id", drawing.id);


      // Same fingerprint already read in this project: clone, never re-read.
      const { data: twin } = await supabase
        .from("drawings")
        .select("id, triage_class, text_span_count, body_text_count, path_count, layers_present, page_width, page_height, page_rotation, coordinate_frame_ok, notes_strip_source, drawing_number, revision, drawing_date, drawing_scale, title, drawing_client, originator, issue_status, drawing_type, discipline_code")
        .eq("project_id", drawing.project_id)
        .eq("file_hash", drawing.file_hash)
        .eq("status", DRAWING_STATUS.complete)
        .neq("id", drawing.id)
        .limit(1)
        .maybeSingle();

      if (twin) {
        const { data: twinItemRows } = await supabase
          .from("drawing_items")
          .select(
            "item_type, raw_text, region, page_number, bbox, colour, font_size, is_red, deferral_category, deferred_to, severity, commercial_risk, recommended_action, method, confidence, allocated_trade_code, allocation_status, system_code, candidate_trades, interface_rule_id, interface_guidance, allocation_method, bbox_frame",
          )
          .eq("drawing_id", twin.id);
        const twinItems = (twinItemRows ?? []) as unknown as Array<Record<string, unknown>>;

        // Rows are built first; only then does the previous set get replaced.
        await replaceItems(twinItems.map((row) => ({ ...row, ...stamp })));


        const { id: _twinId, ...twinFields } = twin;
        await supabase
          .from("drawings")
          .update({
            ...twinFields,
            status: DRAWING_STATUS.complete,
            cloned_from_drawing_id: twin.id,
            analysed_at: new Date().toISOString(),
          })
          .eq("id", drawing.id);

        return { status: DRAWING_STATUS.complete, cloned: true, items: twinItems?.length ?? 0 };
      }

      const { data: file, error: fileError } = await supabase.storage
        .from("drawings")
        .download(drawing.storage_path);
      if (fileError || !file) return await fail(`Could not read the stored file: ${fileError?.message ?? "missing"}`);

      const { extractDrawing } = await import("./extract.server");
      const extract = await extractDrawing(new Uint8Array(await file.arrayBuffer()));

      const { data: patterns } = await supabase
        .from("deferral_patterns")
        .select("id, category, pattern, default_severity, recommended_action, commercial_risk");

      const findings = detectDeferrals(extract.items, (patterns ?? []) as DeferralPattern[]);

      // Stages 5-7 run in the same pass: reading and allocating are one step.
      const [{ data: cues }, { data: prefixes }, { data: rules }] = await Promise.all([
        supabase.from("trade_cues").select("trade_code, cue, weight"),
        supabase
          .from("system_code_prefixes")
          .select("prefix, trade_code, scope, project_id")
          .or(`scope.eq.global,project_id.eq.${drawing.project_id}`),
        supabase
          .from("interface_rules")
          .select("id, name, trigger_terms, context_terms, trade_codes, severity, guidance"),
      ]);

      const reference = {
        cues: (cues ?? []) as TradeCue[],
        prefixes: (prefixes ?? []) as CodePrefix[],
        rules: (rules ?? []) as InterfaceRule[],
        // The junction context is the whole sheet, not one annotation.
        sheetContext: extract.items.map((i) => i.item.str).join(" "),

      };


      // Everything is built in memory first. Nothing is deleted or written
      // until the whole new set exists.
      // also_categories was added after the generated types were last refreshed.
      const deferralRows = findings.map((f) => {
            const a = allocate(f.raw_text, reference);
            return {
              ...stamp,
              item_type: ITEM_TYPE.deferral,
              raw_text: f.raw_text,
              region: f.region,
              page_number: 1,
              bbox: f.bbox,
              // Extraction normalises rotation, so boxes are page space as rendered.
              bbox_frame: "rotated",
              colour: f.colour,
              font_size: f.font_size,
              is_red: f.is_red,
              deferral_category: f.deferral_category,
              also_categories: f.also_categories,
              deferred_to: f.deferred_to,
              severity: f.severity,
              commercial_risk: f.commercial_risk,
              recommended_action: f.recommended_action,
              method: f.method,
              allocation_status: a.allocation_status,
              allocated_trade_code: a.allocated_trade_code,
              candidate_trades: a.candidate_trades,
              confidence: a.confidence,
              system_code: a.system_code,
              interface_rule_id: a.interface_rule_id,
              interface_guidance: a.interface_guidance,
              allocation_method: a.allocation_method,
            };
          }) as never,
        );

        if (error) return await fail(`Could not record findings: ${error.message}`);
      }

      // Allocation only ever runs on the body of the sheet. Titleblock text
      // and the standard notes strip name no scope, so they never reach the
      // Clear / Contested / Unclaimed tabs. Deferral detection still reads
      // every region.
      const deferralText = new Set(findings.map((f) => f.raw_text.toLowerCase()));
      const others = extract.items
        .filter(({ item, region }) => {
          const t = item.str.trim();
          if (region !== "body") return false;
          if (t.length < 8 || isAnnotationOnly(t)) return false;

          const lower = t.toLowerCase();
          return ![...deferralText].some((d) => d.includes(lower) || lower.includes(d));
        })
        .map(({ item, region }) => {
          const t = item.str.trim();
          const a = allocate(t, reference);
          return {
            ...stamp,
            item_type: region === "body" ? ITEM_TYPE.body : ITEM_TYPE.note,
            raw_text: t,
            region,
            page_number: 1,
            bbox: { x: item.x, y: item.y, w: item.width, h: item.height },
            bbox_frame: "rotated",
            colour: item.colour,
            font_size: item.fontSize,
            is_red: false,
            allocation_status: a.allocation_status,
            allocated_trade_code: a.allocated_trade_code,
            candidate_trades: a.candidate_trades,
            confidence: a.confidence,
            system_code: a.system_code,
            interface_rule_id: a.interface_rule_id,
            interface_guidance: a.interface_guidance,
            allocation_method: a.allocation_method,
          };
        });

      if (others.length) {
        const { error } = await supabase.from("drawing_items").insert(others as never);
        if (error) return await fail(`Could not record the sheet's annotations: ${error.message}`);
      }



      const { error: doneError } = await supabase
        .from("drawings")
        .update({ status: DRAWING_STATUS.complete, error_message: null, analysed_at: new Date().toISOString() })
        .eq("id", drawing.id);
      if (doneError) return await fail(`Could not finish the reading: ${doneError.message}`);

      return { status: DRAWING_STATUS.complete, cloned: false, items: findings.length };

    } catch (error) {
      // Fail closed: status failed, error recorded, no partial findings kept.
      await supabase.from("drawing_items").delete().eq("drawing_id", drawing.id);
      return await fail(error instanceof Error ? error.message : String(error));
    }
  });
