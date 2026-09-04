import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectDeferrals, type DeferralPattern } from "./pipeline";

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
        .update({ status: "failed", error_message: message.slice(0, 500), analysed_at: new Date().toISOString() })
        .eq("id", drawing.id);
      return { status: "failed" as const, error: message, items: 0 };
    };

    try {
      await supabase.from("drawings").update({ status: "reading", error_message: null }).eq("id", drawing.id);

      // Same fingerprint already read in this project: clone, never re-read.
      const { data: twin } = await supabase
        .from("drawings")
        .select("id, triage_class, text_span_count, body_text_count, path_count, layers_present, page_width, page_height, page_rotation, coordinate_frame_ok, notes_strip_source, drawing_number, revision, drawing_date, drawing_scale, title, drawing_client, originator, issue_status, drawing_type, discipline_code")
        .eq("project_id", drawing.project_id)
        .eq("file_hash", drawing.file_hash)
        .eq("status", "complete")
        .neq("id", drawing.id)
        .limit(1)
        .maybeSingle();

      if (twin) {
        const { data: twinItems } = await supabase
          .from("drawing_items")
          .select("item_type, raw_text, region, page_number, bbox, colour, font_size, is_red, deferral_category, deferred_to, severity, commercial_risk, recommended_action, method, confidence")
          .eq("drawing_id", twin.id);

        if (twinItems?.length) {
          const { error } = await supabase
            .from("drawing_items")
            .insert(twinItems.map((row) => ({ ...row, ...stamp })));
          if (error) return await fail(`Clone failed: ${error.message}`);
        }

        const { id: _twinId, ...twinFields } = twin;
        await supabase
          .from("drawings")
          .update({
            ...twinFields,
            status: "complete",
            cloned_from_drawing_id: twin.id,
            analysed_at: new Date().toISOString(),
          })
          .eq("id", drawing.id);

        return { status: "complete" as const, cloned: true, items: twinItems?.length ?? 0 };
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

      // Write what the sheet says about itself first, so the titleblock and
      // triage survive even if recording the findings fails.
      const { error: metaError } = await supabase
        .from("drawings")
        .update({
          triage_class: extract.triage_class,
          text_span_count: extract.text_span_count,
          body_text_count: extract.body_text_count,
          path_count: extract.path_count,
          layers_present: extract.layers_present,
          page_width: extract.page_width,
          page_height: extract.page_height,
          page_rotation: extract.page_rotation,
          coordinate_frame_ok: extract.coordinate_frame_ok,
          notes_strip_source: extract.notes_strip_source,
          drawing_number: extract.titleblock.drawing_number,
          revision: extract.titleblock.revision,
          drawing_date: extract.titleblock.drawing_date,
          drawing_scale: extract.titleblock.drawing_scale,
          title: extract.titleblock.title,
          drawing_client: extract.titleblock.drawing_client,
          originator: extract.titleblock.originator,
          issue_status: extract.titleblock.issue_status,
          drawing_type: extract.titleblock.drawing_type,
          discipline_code: extract.titleblock.discipline_code,
        })
        .eq("id", drawing.id);
      if (metaError) return await fail(`Could not record the drawing details: ${metaError.message}`);

      if (findings.length) {
        // also_categories was added after the generated types were last refreshed.
        const { error } = await supabase.from("drawing_items").insert(
          findings.map((f) => ({
            ...stamp,
            item_type: "deferral",
            raw_text: f.raw_text,
            region: f.region,
            page_number: 1,
            bbox: f.bbox,
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
          })) as never,
        );
        if (error) return await fail(`Could not record findings: ${error.message}`);
      }

      const { error: doneError } = await supabase
        .from("drawings")
        .update({ status: "complete", error_message: null, analysed_at: new Date().toISOString() })
        .eq("id", drawing.id);
      if (doneError) return await fail(`Could not finish the reading: ${doneError.message}`);

      return { status: "complete" as const, cloned: false, items: findings.length };

    } catch (error) {
      // Fail closed: status failed, error recorded, no partial findings kept.
      await supabase.from("drawing_items").delete().eq("drawing_id", drawing.id);
      return await fail(error instanceof Error ? error.message : String(error));
    }
  });
