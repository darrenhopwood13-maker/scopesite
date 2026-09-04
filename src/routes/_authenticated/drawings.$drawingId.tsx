import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { analyseDrawing } from "@/lib/scopeguard/analyse.functions";
import { AccountBar } from "@/components/AccountBar";
import { Disclaimer } from "@/components/Disclaimer";
import { DRAWING_STATUS, ITEM_TYPE } from "@/lib/scopeguard/vocab";

export const Route = createFileRoute("/_authenticated/drawings/$drawingId")({
  head: () => ({
    meta: [
      { title: "Deferrals and trade allocation — ScopeGuard" },
      {
        name: "description",
        content:
          "Deferred scope, holds and unnamed responsibilities found on this drawing, each quoted verbatim, with every annotation allocated to a trade or flagged as contested.",
      },
      { property: "og:title", content: "Deferrals and trade allocation — ScopeGuard" },
      {
        property: "og:description",
        content: "Deferred scope, holds and contested trade allocations found on this drawing.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DrawingPage,
});

const SEVERITY_STYLES: Record<string, string> = {
  high: "text-severity-high",
  medium: "text-severity-medium",
  low: "text-severity-low",
};

type Item = {
  id: string;
  item_type: string;
  raw_text: string;
  region: string | null;
  severity: string | null;
  deferral_category: string | null;
  deferred_to: string | null;
  recommended_action: string | null;
  is_red: boolean | null;
  system_code: string | null;
  allocation_status: string | null;
  allocated_trade_code: string | null;
  candidate_trades: unknown;
  interface_guidance: string | null;
  corrected_trade_code: string | null;
  correction_status: string | null;
  correction_note: string | null;
};

// Columns added after the generated database types were last refreshed.
function alsoMatches(item: unknown): string[] {
  const v = (item as { also_categories?: string[] | null }).also_categories;
  return (v ?? []).map((c) => c.replace(/_/g, " "));
}

function candidates(item: Item): Array<{ trade_code: string; score: number }> {
  const v = item.candidate_trades;
  return Array.isArray(v) ? v : [];
}

/** A correction always beats what the reading step decided. */
function effectiveStatus(item: Item): "allocated" | "ambiguous" | "unallocated" | "dismissed" {
  if (item.correction_status === "dismissed") return "dismissed";
  if (item.corrected_trade_code || item.correction_status === "accepted") return "allocated";
  return (item.allocation_status as "allocated" | "ambiguous" | "unallocated") ?? "unallocated";
}

/** One vocabulary on screen: contested, clear, unclaimed. */
const STATUS_LABELS: Record<string, string> = {
  allocated: "Clear",
  ambiguous: "Contested",
  unallocated: "Unclaimed",
  dismissed: "Dismissed",
};
const statusLabel = (item: Item) => STATUS_LABELS[effectiveStatus(item)] ?? "Unclaimed";

function effectiveTrade(item: Item): string | null {
  return item.corrected_trade_code ?? item.allocated_trade_code ?? null;
}

const TABS = ["deferrals", "contested", "clear", "unclaimed", "coverage"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  deferrals: "Deferrals",
  contested: "Contested",
  clear: "Clear",
  unclaimed: "Unclaimed",
  coverage: "Coverage",
};

function DrawingPage() {
  const { drawingId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("deferrals");

  const drawing = useQuery({
    queryKey: ["drawing", drawingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("drawings").select("*").eq("id", drawingId).single();
      if (error) throw error;
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["drawing-items", drawingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("drawing_items").select("*").eq("drawing_id", drawingId);
      if (error) throw error;
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return [...data].sort(
        (a, b) => (order[a.severity ?? "low"] ?? 3) - (order[b.severity ?? "low"] ?? 3),
      ) as unknown as Item[];
    },
  });

  const trades = useQuery({
    queryKey: ["trades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trades").select("code, name").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const prefixes = useQuery({
    queryKey: ["prefixes", drawing.data?.project_id],
    enabled: !!drawing.data?.project_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_code_prefixes")
        .select("prefix, trade_code, scope, project_id");
      if (error) throw error;
      return data;
    },
  });

  const runAnalysis = useServerFn(analyseDrawing);
  const [reading, setReading] = useState(false);
  const readAgain = async () => {
    setReading(true);
    try {
      await runAnalysis({ data: { drawingId } });
      await Promise.all([drawing.refetch(), items.refetch()]);
    } finally {
      setReading(false);
    }
  };

  const all = items.data ?? [];
  const deferrals = useMemo(() => all.filter((i) => i.item_type === ITEM_TYPE.deferral), [all]);
  const contested = useMemo(() => all.filter((i) => effectiveStatus(i) === "ambiguous"), [all]);
  const clear = useMemo(() => all.filter((i) => effectiveStatus(i) === "allocated"), [all]);
  const unclaimed = useMemo(() => all.filter((i) => effectiveStatus(i) === "unallocated"), [all]);

  // Allocation only applies to sheets with readable body annotations.
  const allocationApplies =
    drawing.data?.triage_class !== "notes_only" && drawing.data?.triage_class !== "graphical_only";

  const tabCounts: Record<Tab, number | null> = {
    deferrals: deferrals.length,
    contested: allocationApplies ? contested.length : null,
    clear: allocationApplies ? clear.length : null,
    unclaimed: allocationApplies ? unclaimed.length : null,
    coverage: null,
  };

  const knownPrefixes = new Set((prefixes.data ?? []).map((p) => p.prefix.toUpperCase()));

  const correct = async (ids: string[], patch: Record<string, unknown>) => {
    const { data: session } = await supabase.auth.getUser();
    await supabase
      .from("drawing_items")
      .update({ ...patch, corrected_at: new Date().toISOString(), corrected_by: session.user?.id } as never)
      .in("id", ids);
    await items.refetch();
  };


  const teachPrefix = async (prefix: string, tradeCode: string) => {
    if (!drawing.data) return;
    const { data: session } = await supabase.auth.getUser();
    await supabase.from("system_code_prefixes").insert({
      prefix,
      trade_code: tradeCode,
      scope: "project",
      project_id: drawing.data.project_id,
      created_by: session.user?.id,
      description: "Learned on this project",
    } as never);
    await prefixes.refetch();
  };

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const rows = deferrals.map((i) => ({
      Severity: i.severity ?? "",
      Category: i.deferral_category ?? "",
      Finding: i.raw_text,
      Source: i.region ?? "",
      "Deferred to": i.deferred_to ?? "Not named",
      "Also matches": alsoMatches(i).join(", "),
      Trade: effectiveTrade(i) ?? "",
      Allocation: statusLabel(i),
      Action: i.recommended_action ?? "",
      "Red text": i.is_red ? "Yes" : "No",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.sheet_add_aoa(
      sheet,
      [
        [
          "Advisory only. ScopeGuard reports what the drawing says; it is not a compliance check or an approval. Verify against the executed sub-contract documents.",
        ],
      ],
      { origin: -1 },
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Deferrals");
    XLSX.writeFile(book, `${drawing.data?.drawing_number ?? "drawing"}-deferrals.xlsx`);
  };

  const d = drawing.data;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <AccountBar>
        {d ? (
          <Link
            to="/projects/$projectId"
            params={{ projectId: d.project_id }}
            className="text-muted-foreground hover:text-foreground"
          >
            Back to project
          </Link>
        ) : null}
      </AccountBar>

      <header className="space-y-2">
        <h1 className="font-display text-3xl">{d?.drawing_number ?? d?.file_name ?? "Drawing"}</h1>
        <p className="text-muted-foreground">{d?.title}</p>
        <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-3 text-sm">
          {[
            ["Revision", d?.revision],
            ["Date", d?.drawing_date],
            ["Scale", d?.drawing_scale],
            ["Client", d?.drawing_client],
            ["Originator", d?.originator],
            ["Status", d?.issue_status],
            ["Type", d?.drawing_type],
            ["Discipline", d?.discipline_code],
            ["Sheet reads as", d?.triage_class?.replace(/_/g, " ")],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex gap-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value ? String(value) : "—"}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1" aria-label="Drawing views">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                tab === t ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[t]}
              {tabCounts[t] === null ? "" : ` (${tabCounts[t]})`}
            </button>
          ))}
        </nav>
        <div className="flex gap-3">
          <button
            onClick={readAgain}
            disabled={reading}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {reading ? "Reading…" : "Read again"}
          </button>
          <button
            onClick={exportXlsx}
            disabled={!deferrals.length}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            Export to Excel
          </button>
        </div>
      </div>

      <Disclaimer />

      {tab === "deferrals" ? (
        <section className="space-y-4">
          {d?.status === DRAWING_STATUS.failed ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
              <p className="text-destructive">
                This drawing could not be read: {d.error_message}. No findings were produced by this read.
              </p>
              {deferrals.length ? (
                <p className="text-sm text-muted-foreground">
                  The {deferrals.length} finding{deferrals.length === 1 ? "" : "s"} below are from an earlier
                  successful read of this sheet, not from the read that just failed.
                </p>
              ) : null}
            </div>
          ) : null}
          {deferrals.length === 0 && d?.status === DRAWING_STATUS.complete ? (
            <p className="text-muted-foreground">No deferrals found on this sheet.</p>
          ) : null}

          {deferrals.map((i) => (
            <article key={i.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className={`font-medium uppercase ${SEVERITY_STYLES[i.severity ?? "low"] ?? ""}`}>
                  {i.severity}
                </span>
                <span className="text-muted-foreground">{i.deferral_category?.replace(/_/g, " ")}</span>
                {i.is_red ? <span className="text-severity-high">Red text on the sheet</span> : null}
              </div>
              <blockquote className="font-mono text-sm">“{i.raw_text}”</blockquote>
              <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Source</dt>
                  <dd>{i.region ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Deferred to</dt>
                  <dd>{i.deferred_to ?? "Not named on the drawing"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Also matches</dt>
                  <dd>{alsoMatches(i).join(", ") || "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Action</dt>
                  <dd>{i.recommended_action ?? "—"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </section>
      ) : null}

      {(tab === "contested" || tab === "clear" || tab === "unclaimed") && !allocationApplies ? (
        <section className="space-y-4">
          <p className="text-muted-foreground">
            Not applicable on this sheet. It reads as{" "}
            {drawing.data?.triage_class?.replace(/_/g, " ")}, so there are no body annotations to
            allocate to a trade. The deferrals register is the output for this drawing.
          </p>
        </section>
      ) : null}

      {(tab === "contested" || tab === "clear" || tab === "unclaimed") && allocationApplies ? (
        <section className="space-y-4">
          {(tab === "contested" ? contested : tab === "clear" ? clear : unclaimed).length === 0 ? (
            <p className="text-muted-foreground">
              {tab === "contested"
                ? "Nothing on this sheet is contested between trades."
                : tab === "clear"
                  ? "Nothing on this sheet sits clearly with one trade yet."
                  : "Every annotation on this sheet has been picked up by a trade."}
            </p>
          ) : null}

          {groupByText(tab === "contested" ? contested : tab === "clear" ? clear : unclaimed).map((g) => (
            <AllocationRow
              key={g.item.id}
              item={g.item}
              ids={g.ids}
              occurrences={g.ids.length}
              trades={trades.data ?? []}
              unknownPrefix={
                g.item.system_code &&
                !knownPrefixes.has(String(g.item.system_code).split("-")[0]!.toUpperCase())
                  ? String(g.item.system_code).split("-")[0]!.toUpperCase()
                  : null
              }
              onCorrect={correct}
              onTeachPrefix={teachPrefix}
            />
          ))}

        </section>
      ) : null}

      {tab === "coverage" ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <p className="text-muted-foreground">
            Coverage — the trades you would expect on a sheet of this type that have nothing on it — arrives in
            the next stage of the build.
          </p>
        </section>
      ) : null}
    </main>
  );
}

/** Identical text at two places on the sheet reads as a duplicate row until
 * the viewer can show where each one sits, so it is shown once with a count. */
function groupByText(list: Item[]): Array<{ item: Item; ids: string[] }> {
  const groups = new Map<string, { item: Item; ids: string[] }>();
  for (const i of list) {
    const key = i.raw_text.trim().toLowerCase();
    const g = groups.get(key);
    if (g) g.ids.push(i.id);
    else groups.set(key, { item: i, ids: [i.id] });
  }
  return [...groups.values()];
}

function AllocationRow({
  item,
  ids,
  occurrences,
  trades,
  unknownPrefix,
  onCorrect,
  onTeachPrefix,
}: {
  item: Item;
  ids: string[];
  occurrences: number;
  trades: Array<{ code: string; name: string }>;
  unknownPrefix: string | null;
  onCorrect: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onTeachPrefix: (prefix: string, tradeCode: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const tradeName = (code: string | null) =>
    code ? (trades.find((t) => t.code === code)?.name ?? code) : null;

  return (
    <article className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium uppercase">{statusLabel(item)}</span>
        {effectiveTrade(item) ? (
          <span className="text-muted-foreground">{tradeName(effectiveTrade(item))}</span>
        ) : null}
        {item.system_code ? <span className="text-muted-foreground">{item.system_code}</span> : null}
        {item.item_type === ITEM_TYPE.deferral ? (
          <span className="text-severity-medium">Also a deferral</span>
        ) : null}
        {occurrences > 1 ? (
          <span className="text-muted-foreground">Appears {occurrences} times on this sheet</span>
        ) : null}
        {item.correction_status ? (
          <span className="text-muted-foreground">You marked this {item.correction_status}</span>
        ) : null}
      </div>

      <blockquote className="font-mono text-sm">“{item.raw_text}”</blockquote>

      {item.interface_guidance ? (
        <p className="rounded-md border border-severity-medium/40 bg-severity-medium/5 p-3 text-sm">
          {item.interface_guidance}
        </p>
      ) : null}

      {candidates(item).length ? (
        <p className="text-sm text-muted-foreground">
          Candidates: {candidates(item).map((c) => tradeName(c.trade_code)).join(", ")}
        </p>
      ) : null}

      {unknownPrefix ? (
        <div className="rounded-md border border-border p-3 space-y-2 text-sm">
          <p>
            New code prefix found on this sheet: <span className="font-mono">{unknownPrefix}</span>. What does it
            mean on this project?
          </p>
          <select
            className="rounded-md border border-border bg-background px-2 py-1"
            defaultValue=""
            onChange={(e) => e.target.value && onTeachPrefix(unknownPrefix, e.target.value)}
          >
            <option value="">Choose the trade it belongs to…</option>
            {trades.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          className="rounded-md border border-border bg-background px-2 py-1"
          value={effectiveTrade(item) ?? ""}
          onChange={(e) =>
            onCorrect(ids, {
              corrected_trade_code: e.target.value || null,
              correction_status: e.target.value ? "changed" : null,
            })
          }
        >
          <option value="">Change trade…</option>
          {trades.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            onCorrect(ids, {
              correction_status: "accepted",
              corrected_trade_code: effectiveTrade(item),
            })
          }
          className="rounded-md border border-border px-3 py-1 font-medium"
        >
          Accept
        </button>
        <button
          onClick={() => setShowNote((v) => !v)}
          className="rounded-md border border-border px-3 py-1 font-medium"
        >
          Dismiss
        </button>
      </div>

      {showNote ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why are you dismissing this?"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1"
          />
          <button
            onClick={async () => {
              await onCorrect(ids, { correction_status: "dismissed", correction_note: note });
              setShowNote(false);
            }}
            className="rounded-md bg-accent px-3 py-1 font-medium text-accent-foreground"
          >
            Save
          </button>
        </div>
      ) : null}

      {item.correction_note ? (
        <p className="text-sm text-muted-foreground">Your note: {item.correction_note}</p>
      ) : null}
    </article>
  );
}
