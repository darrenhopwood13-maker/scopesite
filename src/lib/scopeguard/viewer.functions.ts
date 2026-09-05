import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// The drawings bucket is private. The viewer gets a short-lived signed link,
// minted only for a drawing the signed-in user can already read.
export const signedDrawingUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { drawingId: string }) => {
    if (!input?.drawingId) throw new Error("drawingId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: drawing, error } = await supabase
      .from("drawings")
      .select("id, storage_path")
      .eq("id", data.drawingId)
      .single();
    if (error || !drawing) throw new Error("That drawing could not be found.");

    const { data: signed, error: signError } = await supabase.storage
      .from("drawings")
      .createSignedUrl(drawing.storage_path, 300);
    if (signError || !signed?.signedUrl) {
      throw new Error(`The drawing file could not be opened: ${signError?.message ?? "no link"}`);
    }

    return { url: signed.signedUrl };
  });
