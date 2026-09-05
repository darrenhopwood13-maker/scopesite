import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as SupabaseClient<any, "public", any>;

type Corroboration = {
  id: string;
  kind: string;
  topic: string;
  severity: string | null;
  summary: string | null;
  narrative: string | null;
  status: string;
  resolved_note: string | null;
  drawing_count: number;
  originator_count: number;
  drawing_ids: string[];
  originators: string[];
  item_ids: string[];
  first_seen_at: string | null;
};

type DrawingRef = { id: string; drawing_number: string | null; revision: string | null; file_name: string };

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

const KIND_LABELS: Record<string, string> = {
  topic: "Topic",
  unnamed_party: "Unnamed parties",
  party: "Party",
};

function severityLabel(severity: string | null): string {
  return severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low";
}

export function CorroborationBoard({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [view, setView] = useState<"topic" | "party">("topic");
  const [showClosed, setShowClosed] = useState(false);

  const corroborations = useQuery({
    queryKey: ["corroborations", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("corroborations")
        .select(
          "id, kind, topic, severity, summary, narrative, status, resolved_note, drawing_count, originator_count, drawing_ids, originators, item_ids, first_seen_at",
        )
        .eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []) as Corroboration[];
    },
  });

  const drawings = useQuery({
    queryKey: ["drawing-refs", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("drawings")
        .select("id, drawing_number, revision, file_name")
        .eq("project_id", projectId);
      if (error) throw error;
      const map = new Map<string, DrawingRef>();
      for (const d of (data ?? []) as DrawingRef[]) map.set(d.id, d);
      return map;
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note: string }) => {
      const { error } = await db
        .from("corroborations")
        .update({ status, resolved_note: note })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["corroborations", projectId] });
      void qc.invalidateQueries({ queryKey: ["party-corroborations", projectId] });
    },
  });

  const all = corroborations.data ?? [];
  const rows = all
    .filter((c) => (view === "party" ? c.kind === "party" : c.kind !== "party"))
    .filter((c) => (showClosed ? true : c.status === "open"))
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity ?? ""] ?? 3) - (SEVERITY_ORDER[b.severity ?? ""] ?? 3) ||
        b.originator_count - a.originator_count ||
        b.drawing_count - a.drawing_count,
    );

  const openCount = (kindIsParty: boolean) =>
    all.filter(
      (c) => c.status === "open" && (kindIsParty ? c.kind === "party" : c.kind !== "party"),
    ).length;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="tablist" aria-label="Corroboration views">
          {(
            [
              ["topic", `By topic (${openCount(false)})`],
              ["party", `By party (${openCount(true)})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={
                view === value
                  ? "rounded border border-primary bg-primary/10 px-3 py-1 text-sm text-foreground"
                  : "rounded border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          Show resolved and dismissed
        </label>
      </div>

      {corroborations.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading findings…</p>
      ) : null}

      {!corroborations.isLoading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {view === "topic"
            ? "Nothing grouped by topic yet. Read two or more drawings to see where the same scope is left open on both."
            : "No party appears on more than one drawing yet."}
        </p>
      ) : null}

      {rows.map((c) => {
        const sheets = c.drawing_ids
          .map((id) => ({ id, ref: drawings.data?.get(id) }))
          .filter((s) => s.ref);
        return (
          <article key={c.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg">{c.topic}</h3>
                <p className="text-sm text-muted-foreground">
                  {KIND_LABELS[c.kind] ?? c.kind}
                  {" · "}
                  {c.drawing_count} drawing{c.drawing_count === 1 ? "" : "s"}
                  {c.originators.length ? ` · ${c.originators.join(", ")}` : ""}
                  {c.item_ids.length ? ` · ${c.item_ids.length} findings` : ""}
                </p>
              </div>
              <span
                className={
                  c.severity === "high"
                    ? "rounded border border-destructive px-2 py-0.5 text-sm text-destructive"
                    : "rounded border border-border px-2 py-0.5 text-sm text-muted-foreground"
                }
              >
                {severityLabel(c.severity)}
                {c.status !== "open" ? ` · ${c.status}` : ""}
              </span>
            </div>

            {c.narrative ? (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{c.narrative}</p>
            ) : c.summary ? (
              <p className="text-sm text-muted-foreground">{c.summary}</p>
            ) : null}

            {c.resolved_note ? (
              <p className="text-sm text-muted-foreground">Note: {c.resolved_note}</p>
            ) : null}

            {sheets.length ? (
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {sheets.map(({ id, ref }) => (
                  <Link
                    key={id}
                    to="/drawings/$drawingId"
                    params={{ drawingId: id }}
                    className="underline text-muted-foreground hover:text-foreground"
                  >
                    {ref?.drawing_number ?? ref?.file_name}
                    {ref?.revision ? ` Rev ${ref.revision}` : ""}
                  </Link>
                ))}
              </p>
            ) : null}

            {c.status === "open" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const note = window.prompt("Resolve with a note:");
                    if (note !== null) setStatus.mutate({ id: c.id, status: "resolved", note });
                  }}
                  className="rounded border border-border px-2 py-1 text-sm hover:border-primary"
                >
                  Resolve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const note = window.prompt("Dismiss with a note:");
                    if (note !== null) setStatus.mutate({ id: c.id, status: "dismissed", note });
                  }}
                  className="rounded border border-border px-2 py-1 text-sm hover:border-primary"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setStatus.mutate({ id: c.id, status: "open", note: "" })}
                className="rounded border border-border px-2 py-1 text-sm hover:border-primary"
              >
                Reopen
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}
