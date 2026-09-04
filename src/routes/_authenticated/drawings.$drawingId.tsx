import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { analyseDrawing } from "@/lib/scopeguard/analyse.functions";
import { AccountBar } from "@/components/AccountBar";
import { Disclaimer } from "@/components/Disclaimer";

export const Route = createFileRoute("/_authenticated/drawings/$drawingId")({
  head: () => ({
    meta: [
      { title: "Deferrals register — ScopeGuard" },
      {
        name: "description",
        content:
          "Deferred scope, holds and unnamed responsibilities found on this drawing, each quoted verbatim with the action to take.",
      },
      { property: "og:title", content: "Deferrals register — ScopeGuard" },
      {
        property: "og:description",
        content: "Deferred scope and holds found on this drawing, quoted verbatim.",
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

// Added after the generated database types were last refreshed.
function alsoMatches(item: unknown): string[] {
  const v = (item as { also_categories?: string[] | null }).also_categories;
  return (v ?? []).map((c) => c.replace(/_/g, " "));
}

function DrawingPage() {
  const { drawingId } = Route.useParams();

  const drawing = useQuery({
    queryKey: ["drawing", drawingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drawings")
        .select("*")
        .eq("id", drawingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["drawing-items", drawingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drawing_items")
        .select("*")
        .eq("drawing_id", drawingId)
        .eq("item_type", "deferral");
      if (error) throw error;
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return [...data].sort((a, b) => (order[a.severity ?? "low"] ?? 3) - (order[b.severity ?? "low"] ?? 3));
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

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const rows = (items.data ?? []).map((i) => ({
      Severity: i.severity ?? "",
      Category: i.deferral_category ?? "",
      Finding: i.raw_text,
      Source: i.region ?? "",
      "Deferred to": i.deferred_to ?? "Not named",
      "Also matches": alsoMatches(i).join(", "),
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

      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">
          Deferrals ({items.data?.length ?? 0})
        </h2>
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
          disabled={!items.data?.length}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          Export to Excel
        </button>
        </div>
      </div>

      <Disclaimer />

      <section className="space-y-4">
        {d?.status === "failed" ? (
          <p className="text-destructive">
            This drawing could not be read: {d.error_message}. No findings were produced.
          </p>
        ) : null}
        {items.data?.length === 0 && d?.status === "complete" ? (
          <p className="text-muted-foreground">No deferrals found on this sheet.</p>
        ) : null}
        {items.data?.map((i) => (
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
    </main>
  );
}
