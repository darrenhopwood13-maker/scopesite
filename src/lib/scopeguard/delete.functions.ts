import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Full removal of drawings: findings, coverage, corroboration links, the stored
// PDF, and the drawing record — then the corroborations are rebuilt so cards
// that no longer span two drawings disappear. Parties are deliberately kept.
export const deleteDrawings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string; drawingIds?: string[]; all?: boolean }) => {
    if (!input?.projectId) throw new Error("projectId is required");
    if (!input.all && !input.drawingIds?.length) throw new Error("Nothing selected to delete");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let query = supabase
      .from("drawings")
      .select("id, storage_path, project_id, owner_id")
      .eq("project_id", data.projectId);
    if (!data.all) query = query.in("id", data.drawingIds ?? []);

    const { data: drawings, error: listError } = await query;
    if (listError) throw new Error(`Could not read the drawings: ${listError.message}`);
    const rows = drawings ?? [];
    if (!rows.length) return { deleted: 0 };

    const ids = rows.map((d) => d.id);

    const { data: items } = await supabase.from("drawing_items").select("id").in("drawing_id", ids);
    const itemIds = (items ?? []).map((i) => i.id);

    if (itemIds.length) {
      const { error } = await supabase.from("corroboration_items").delete().in("item_id", itemIds);
      if (error) throw new Error(`Could not clear corroboration links: ${error.message}`);
    }

    for (const table of ["drawing_items", "coverage"] as const) {
      const { error } = await supabase.from(table).delete().in("drawing_id", ids);
      if (error) throw new Error(`Could not clear findings: ${error.message}`);
    }

    // A cloned duplicate can share a stored file; only remove objects no
    // remaining drawing still points at.
    const paths = [...new Set(rows.map((d) => d.storage_path).filter(Boolean))];
    if (paths.length) {
      const { data: keepers } = await supabase
        .from("drawings")
        .select("storage_path")
        .in("storage_path", paths)
        .not("id", "in", `(${ids.join(",")})`);
      const kept = new Set((keepers ?? []).map((k) => k.storage_path));
      const removable = paths.filter((p) => !kept.has(p));
      if (removable.length) await supabase.storage.from("drawings").remove(removable);
    }

    const { error: drawingError } = await supabase.from("drawings").delete().in("id", ids);
    if (drawingError) throw new Error(`Could not delete the drawings: ${drawingError.message}`);

    const { rebuildPartyCorroborations } = await import("./party-register.server");
    await rebuildPartyCorroborations(supabase, { project_id: data.projectId, owner_id: userId });

    return { deleted: ids.length };
  });
