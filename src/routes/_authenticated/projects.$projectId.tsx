import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { analyseDrawing } from "@/lib/scopeguard/analyse.functions";
import { AccountBar } from "@/components/AccountBar";
import { Disclaimer } from "@/components/Disclaimer";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project drawings — ScopeGuard" },
      {
        name: "description",
        content:
          "Upload construction drawings to this ScopeGuard project and track reading status for each sheet.",
      },
      { property: "og:title", content: "Project drawings — ScopeGuard" },
      { property: "og:description", content: "Upload drawings and track scope analysis per sheet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectPage,
});

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function statusLabel(status: string): string {
  if (status === "queued") return "Queued";
  if (status === "reading") return "Reading";
  if (status === "complete") return "Read";
  if (status === "failed") return "Failed";
  return status;
}

function ProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const analyse = useServerFn(analyseDrawing);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client, project_reference")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const drawings = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drawings")
        .select("id, file_name, status, error_message, triage_class, drawing_number, revision, title, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setBusy(true);
      setMessage(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const owner = auth.user?.id;
        if (!owner) throw new Error("Not signed in");

        for (const file of Array.from(files)) {
          if (!file.name.toLowerCase().endsWith(".pdf")) {
            setMessage(`${file.name} is not a PDF and was skipped.`);
            continue;
          }
          const hash = await sha256(file);
          const path = `${owner}/${projectId}/${hash}.pdf`;

          const { error: uploadError } = await supabase.storage
            .from("drawings")
            .upload(path, file, { contentType: "application/pdf", upsert: true });
          if (uploadError) throw uploadError;

          const { data: row, error: insertError } = await supabase
            .from("drawings")
            .insert({
              project_id: projectId,
              owner_id: owner,
              file_name: file.name,
              storage_path: path,
              file_hash: hash,
              status: "queued",
            })
            .select("id")
            .single();
          if (insertError) throw insertError;

          await analyse({ data: { drawingId: row.id } });
          qc.invalidateQueries({ queryKey: ["drawings", projectId] });
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
        qc.invalidateQueries({ queryKey: ["drawings", projectId] });
      }
    },
    [analyse, projectId, qc],
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <AccountBar>
        <Link to="/projects" className="text-muted-foreground hover:text-foreground">
          All projects
        </Link>
      </AccountBar>

      <header className="space-y-1">
        <h1 className="font-display text-3xl">{project.data?.name ?? "Project"}</h1>
        <p className="text-sm text-muted-foreground">
          {[project.data?.client, project.data?.project_reference].filter(Boolean).join(" · ")}
        </p>
      </header>

      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
        className="rounded-lg border border-dashed border-border bg-card p-8 text-center space-y-3"
      >
        <p className="text-muted-foreground">Drag PDF drawings here, or choose files.</p>
        <input
          type="file"
          accept="application/pdf"
          multiple
          disabled={busy}
          onChange={(e) => upload(e.target.files)}
          className="mx-auto block text-sm"
        />
        {busy ? <p className="text-sm text-muted-foreground">Reading drawings…</p> : null}
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
      </section>

      <section className="space-y-3">
        {drawings.data?.length === 0 ? (
          <p className="text-muted-foreground">No drawings uploaded yet.</p>
        ) : null}
        {drawings.data?.map((d) => (
          <Link
            key={d.id}
            to="/drawings/$drawingId"
            params={{ drawingId: d.id }}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:border-primary"
          >
            <div>
              <div className="font-display">{d.drawing_number ?? d.file_name}</div>
              <div className="text-sm text-muted-foreground">
                {[d.title, d.revision ? `Rev ${d.revision}` : null, d.triage_class?.replace(/_/g, " ")]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {d.status === "failed" && d.error_message ? (
                <div className="text-sm text-destructive">{d.error_message}</div>
              ) : null}
            </div>
            <span className="text-sm text-muted-foreground">{statusLabel(d.status)}</span>
          </Link>
        ))}
      </section>

      <Disclaimer />
    </main>
  );
}
