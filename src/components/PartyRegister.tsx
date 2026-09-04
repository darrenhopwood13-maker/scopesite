import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as SupabaseClient<any, "public", any>;

type Party = {
  id: string;
  canonical_name: string;
  appointed_status: string;
  needs_review: boolean;
  review_reason: string | null;
};

type Corroboration = {
  id: string;
  topic: string;
  severity: string | null;
  summary: string | null;
  item_ids: string[];
  drawing_ids: string[];
  originators: string[];
};

const STATUS_LABELS: Record<string, string> = {
  unknown: "Not known",
  appointed: "Appointed",
  not_appointed: "Not appointed",
};

export function PartyRegister({ projectId }: { projectId: string }) {
  const qc = useQueryClient();

  const parties = useQuery({
    queryKey: ["parties", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("parties")
        .select("id, canonical_name, appointed_status, needs_review, review_reason")
        .eq("project_id", projectId)
        .order("canonical_name");
      if (error) throw error;
      return (data ?? []) as Party[];
    },
  });

  const counts = useQuery({
    queryKey: ["party-counts", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("drawing_items")
        .select("party_id, drawing_id")
        .eq("project_id", projectId)
        .eq("item_type", "deferral")
        .not("party_id", "is", null);
      if (error) throw error;
      const map = new Map<string, { items: number; drawings: Set<string> }>();
      for (const r of (data ?? []) as Array<{ party_id: string; drawing_id: string }>) {
        const e = map.get(r.party_id) ?? { items: 0, drawings: new Set<string>() };
        e.items += 1;
        e.drawings.add(r.drawing_id);
        map.set(r.party_id, e);
      }
      return map;
    },
  });

  const corroborations = useQuery({
    queryKey: ["party-corroborations", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("corroborations")
        .select("id, topic, severity, summary, item_ids, drawing_ids, originators")
        .eq("project_id", projectId)
        .eq("kind", "party")
        .order("severity");
      if (error) throw error;
      return (data ?? []) as Corroboration[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from("parties").update({ appointed_status: status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["parties", projectId] });
    },
  });

  const merge = useMutation({
    mutationFn: async ({ id, into }: { id: string; into: string }) => {
      await db.from("drawing_items").update({ party_id: into }).eq("party_id", id);
      await db.from("party_aliases").update({ party_id: into }).eq("party_id", id);
      const { error } = await db
        .from("parties")
        .update({ merged_into_party_id: into, needs_review: false })
        .eq("id", id);
      if (error) throw error;
      await db.from("parties").delete().eq("id", id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["parties", projectId] });
      void qc.invalidateQueries({ queryKey: ["party-counts", projectId] });
    },
  });

  const keepSeparate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("parties")
        .update({ needs_review: false, review_reason: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["parties", projectId] }),
  });

  const rows = parties.data ?? [];

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <h2 className="font-display text-xl">Party register</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No parties named yet. They appear once a drawing has been read.
          </p>
        ) : null}
        {rows.map((p) => {
          const c = counts.data?.get(p.id);
          const candidate = p.review_reason?.match(/“(.+)”/)?.[1];
          const other = candidate
            ? rows.find((r) => r.canonical_name === candidate && r.id !== p.id)
            : undefined;
          return (
            <div key={p.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-display">{p.canonical_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {c ? `${c.items} deferral${c.items === 1 ? "" : "s"} across ${c.drawings.size} drawing${c.drawings.size === 1 ? "" : "s"}` : "No deferrals"}
                  </div>
                </div>
                <label className="text-sm text-muted-foreground">
                  Status{" "}
                  <select
                    value={p.appointed_status}
                    onChange={(e) => setStatus.mutate({ id: p.id, status: e.target.value })}
                    className="rounded border border-border bg-background px-2 py-1 text-foreground"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {p.needs_review ? (
                <div className="flex flex-wrap items-center gap-3 rounded border border-border/60 bg-muted/40 p-3 text-sm">
                  <span>{p.review_reason}</span>
                  {other ? (
                    <button
                      type="button"
                      onClick={() => merge.mutate({ id: p.id, into: other.id })}
                      className="rounded border border-border px-2 py-1 hover:border-primary"
                    >
                      Merge into {other.canonical_name}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => keepSeparate.mutate(p.id)}
                    className="rounded border border-border px-2 py-1 hover:border-primary"
                  >
                    Keep separate
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-xl">Parties named on more than one drawing</h2>
        {(corroborations.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. A party has to appear on two or more drawings in this project.
          </p>
        ) : null}
        {(corroborations.data ?? []).map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="font-display">{c.topic}</span>
              <span
                className={
                  c.severity === "high" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
                }
              >
                {c.severity === "high" ? "High" : "Medium"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{c.summary}</p>
            <p className="text-sm text-muted-foreground">
              {c.item_ids.length} deferrals · {c.drawing_ids.length} drawings
              {c.originators.length ? ` · ${c.originators.join(", ")}` : ""}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
