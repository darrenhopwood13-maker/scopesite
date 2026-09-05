import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { analyseDrawing } from "@/lib/scopeguard/analyse.functions";
import { deleteDrawings } from "@/lib/scopeguard/delete.functions";
import { AccountBar } from "@/components/AccountBar";
import { Disclaimer } from "@/components/Disclaimer";
import { CreateReportDialog } from "@/components/CreateReportDialog";
import { PartyRegister } from "@/components/PartyRegister";
import { DRAWING_STATUS, DRAWING_STATUS_LABELS, type DrawingStatus } from "@/lib/scopeguard/vocab";


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
  return DRAWING_STATUS_LABELS[status as DrawingStatus] ?? status;
}


function ProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const analyse = useServerFn(analyseDrawing);
  const removeFn = useServerFn(deleteDrawings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const runDelete = useCallback(
    async (payload: { projectId: string; drawingIds?: string[]; all?: boolean }) => {
      setDeleting(true);
      setMessage(null);
      try {
        await removeFn({ data: payload });
        setSelected(new Set());
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setDeleting(false);
        qc.invalidateQueries({ queryKey: ["drawings", projectId] });
        qc.invalidateQueries({ queryKey: ["parties", projectId] });
        qc.invalidateQueries({ queryKey: ["party-counts", projectId] });
        qc.invalidateQueries({ queryKey: ["party-corroborations", projectId] });
      }
    },
    [projectId, qc, removeFn],
  );

  const removeDrawings = useCallback(
    async (ids: string[], confirmation: string) => {
      if (!ids.length || !window.confirm(confirmation)) return;
      await runDelete({ projectId, drawingIds: ids });
    },
    [projectId, runDelete],
  );

  const deleteEverything = useCallback(async () => {
    const typed = window.prompt('This removes every drawing, finding and stored file in this project. Type DELETE ALL to confirm.');
    if (typed?.trim().toUpperCase() !== "DELETE ALL") return;
    await runDelete({ projectId, all: true });
  }, [projectId, runDelete]);

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

  // Both a single selection and a multi-file selection use this same per-file
  // path. The storage name is content-addressed, so an existing object is the
  // same PDF and can be reused instead of requiring Storage UPDATE permission.
  const currentOwnerId = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;
    const expiresAt = (session?.expires_at ?? 0) * 1000;
    if (!session || expiresAt - Date.now() < 60_000) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error || !refreshed.session) throw new Error("Your sign-in has expired. Please sign in again.");
      session = refreshed.session;
    }
    const owner = session.user?.id;
    if (!owner) throw new Error("Not signed in");
    return owner;
  }, []);

  const upload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setBusy(true);
      setMessage(null);
      const problems: string[] = [];
      const uploaded: string[] = [];
      try {
        for (const file of Array.from(files)) {
          if (!file.name.toLowerCase().endsWith(".pdf")) {
            problems.push(`${file.name} is not a PDF and was skipped.`);
            continue;
          }
          try {
            // Read fresh for every file — never carried over from the loop start.
            const owner = await currentOwnerId();
            const hash = await sha256(file);
            const path = `${owner}/${projectId}/${hash}.pdf`;

            const { error: uploadError } = await supabase.storage
              .from("drawings")
              .upload(path, file, { contentType: "application/pdf", upsert: false });
            if (uploadError) {
              const alreadyStored =
                uploadError.message.toLowerCase().includes("already exists") ||
                uploadError.message.toLowerCase().includes("duplicate");
              if (!alreadyStored) throw uploadError;
            }

            const { data: row, error: insertError } = await supabase
              .from("drawings")
              .insert({
                project_id: projectId,
                owner_id: owner,
                file_name: file.name,
                storage_path: path,
                file_hash: hash,
                status: DRAWING_STATUS.queued,
              })
              .select("id")
              .single();
            if (insertError) throw insertError;
            uploaded.push(row.id);
          } catch (error) {
            // One bad file must not abandon the rest of the batch.
            problems.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        qc.invalidateQueries({ queryKey: ["drawings", projectId] });

        // Reading happens only after every file is safely stored, so a slow
        // read can never delay (and expire) a later upload.
        for (const drawingId of uploaded) {
          try {
            await currentOwnerId();
            await analyse({ data: { drawingId } });
          } catch (error) {
            problems.push(error instanceof Error ? error.message : String(error));
          }
          qc.invalidateQueries({ queryKey: ["drawings", projectId] });
        }
      } finally {
        setBusy(false);
        setMessage(problems.length ? problems.join(" ") : null);
        qc.invalidateQueries({ queryKey: ["drawings", projectId] });
      }
    },
    [analyse, currentOwnerId, projectId, qc],
  );


  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <AccountBar>
        <Link to="/projects" className="text-muted-foreground hover:text-foreground">
          All projects
        </Link>
      </AccountBar>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl">{project.data?.name ?? "Project"}</h1>
          <p className="text-sm text-muted-foreground">
            {[project.data?.client, project.data?.project_reference].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/projects/$projectId/corroborations"
            params={{ projectId }}
            className="rounded border border-border px-3 py-2 text-sm hover:border-primary"
          >
            Corroborated gaps
          </Link>
          <CreateReportDialog projectId={projectId} />
        </div>
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

        {drawings.data?.length ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {selected.size ? `${selected.size} selected` : "Select drawings to remove them"}
            </span>
            <button
              type="button"
              disabled={!selected.size || deleting}
              onClick={() => removeDrawings([...selected], `Delete ${selected.size} selected drawing(s)? This cannot be undone.`)}
              className="rounded border border-border px-3 py-1 disabled:opacity-40 hover:border-destructive hover:text-destructive"
            >
              Delete selected
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={deleteEverything}
              className="rounded border border-border px-3 py-1 disabled:opacity-40 hover:border-destructive hover:text-destructive"
            >
              Delete all drawings in this project
            </button>
          </div>
        ) : null}

        {drawings.data?.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-4 rounded-lg border border-border bg-card p-4"
          >
            <input
              type="checkbox"
              aria-label={`Select ${d.drawing_number ?? d.file_name}`}
              checked={selected.has(d.id)}
              onChange={(e) => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(d.id);
                  else next.delete(d.id);
                  return next;
                });
              }}
            />
            <Link
              to="/drawings/$drawingId"
              params={{ drawingId: d.id }}
              className="flex flex-1 items-center justify-between gap-4 hover:text-primary"
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
            <button
              type="button"
              disabled={deleting}
              onClick={() =>
                removeDrawings(
                  [d.id],
                  `Delete ${d.drawing_number ?? d.file_name}${d.revision ? ` Rev ${d.revision}` : ""}? Its findings and stored file are removed for good.`,
                )
              }
              className="rounded border border-border px-3 py-1 text-sm disabled:opacity-40 hover:border-destructive hover:text-destructive"
            >
              Delete
            </button>
          </div>
        ))}
      </section>

      <PartyRegister projectId={projectId} />

      <Disclaimer />
    </main>
  );
}
