import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DISCLAIMER,
  TEMPLATES,
  buildReport,
  drawingWithRevision,
  formatDate,
  reportFileName,
  reportToText,
  type Report,
  type ReportDrawing,
  type ReportItem,
  type ReportParty,
  type ReportTemplate,
} from "@/lib/scopeguard/reports";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as SupabaseClient<any, "public", any>;

type Props = {
  projectId: string;
  drawingId?: string | undefined;
  drawingLabel?: string | undefined;
};

export function CreateReportDialog({ projectId, drawingId, drawingLabel }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
      >
        Create report
      </button>
      {open ? (
        <ReportPicker
          projectId={projectId}
          drawingId={drawingId}
          drawingLabel={drawingLabel}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ReportPicker({ projectId, drawingId, drawingLabel, onClose }: Props & { onClose: () => void }) {
  const [template, setTemplate] = useState<ReportTemplate>("deferrals_register");
  const [scope, setScope] = useState<"drawing" | "project">(drawingId ? "drawing" : "project");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const project = useQuery({
    queryKey: ["report-project", projectId],
    queryFn: async () => {
      const { data, error } = await db.from("projects").select("id, name, client").eq("id", projectId).single();
      if (error) throw error;
      return data as { id: string; name: string; client: string | null };
    },
  });

  const drawings = useQuery({
    queryKey: ["report-drawings", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("drawings")
        .select("id, drawing_number, file_name, revision, title, originator")
        .eq("project_id", projectId)
        .order("drawing_number");
      if (error) throw error;
      return (data ?? []) as ReportDrawing[];
    },
  });

  const items = useQuery({
    queryKey: ["report-items", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("drawing_items")
        .select(
          "id, drawing_id, item_type, raw_text, severity, deferral_category, deferred_to, recommended_action, interface_guidance, allocation_status, correction_status, corrected_trade_code, allocated_trade_code, candidate_trades, party_id",
        )
        .eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []) as ReportItem[];
    },
  });

  const parties = useQuery({
    queryKey: ["report-parties", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("parties")
        .select("id, canonical_name, party_type, appointed_status")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []) as ReportParty[];
    },
  });

  const loading = project.isLoading || drawings.isLoading || items.isLoading || parties.isLoading;

  const report: Report | null = useMemo(() => {
    if (!project.data || !drawings.data || !items.data) return null;
    const inScope =
      scope === "drawing" && drawingId ? drawings.data.filter((d) => d.id === drawingId) : drawings.data;
    const ids = new Set(inScope.map((d) => d.id));
    return buildReport(template, {
      projectName: project.data.name,
      projectClient: project.data.client,
      drawings: inScope,
      items: items.data.filter((i) => ids.has(i.drawing_id)),
      parties: parties.data ?? [],
      scopeLabel:
        scope === "drawing" && drawingId
          ? drawingWithRevision(inScope[0]) || (drawingLabel ?? "this drawing")
          : project.data.name,
    });
  }, [project.data, drawings.data, items.data, parties.data, scope, template, drawingId, drawingLabel]);

  const downloadPdf = async () => {
    if (!report) return;
    setBusy(true);
    setStatus(null);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const margin = 36;
      const width = doc.internal.pageSize.getWidth();
      let y = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text(report.title, margin, y);
      y += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `Project: ${report.projectName}${report.projectClient ? ` — Client: ${report.projectClient}` : ""}`,
        margin,
        y,
      );
      y += 12;
      doc.text(`Generated: ${formatDate(report.generatedAt)}`, margin, y);
      y += 16;
      if (report.headline) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        for (const line of doc.splitTextToSize(report.headline, width - margin * 2) as string[]) {
          doc.text(line, margin, y);
          y += 13;
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        y += 6;
      }
      doc.setFont("helvetica", "bold");
      doc.text("Drawings covered", margin, y);
      doc.setFont("helvetica", "normal");
      y += 12;
      const covered = report.drawings.length
        ? report.drawings.map((d) => `${drawingWithRevision(d)}${d.title ? ` — ${d.title}` : ""}`)
        : ["No drawings in this scope"];
      for (const line of covered) {
        for (const wrapped of doc.splitTextToSize(line, width - margin * 2) as string[]) {
          doc.text(wrapped, margin, y);
          y += 11;
        }
      }
      y += 8;

      if (report.rows.length) {
        autoTable(doc, {
          head: [report.columns],
          body: report.rows,
          startY: y,
          margin: { left: margin, right: margin, bottom: 60 },
          styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak", valign: "top" },
          headStyles: { fillColor: [238, 240, 244], textColor: 20, fontStyle: "bold" },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
      } else {
        doc.setFont("helvetica", "italic");
        doc.text(report.emptyMessage, margin, y);
        doc.setFont("helvetica", "normal");
        y += 20;
      }

      if (y > doc.internal.pageSize.getHeight() - 70) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(8);
      for (const line of doc.splitTextToSize(DISCLAIMER, width - margin * 2) as string[]) {
        doc.text(line, margin, y);
        y += 10;
      }
      doc.save(reportFileName(report, "pdf"));
      setStatus("PDF downloaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const copyReport = async () => {
    if (!report) return;
    setBusy(true);
    setStatus(null);
    try {
      await navigator.clipboard.writeText(reportToText(report));
      setStatus("Report copied. Paste it into an email or a document.");
    } catch {
      setStatus("Your browser blocked the copy. Download the PDF instead.");
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = async () => {
    if (!report) return;
    setBusy(true);
    setStatus(null);
    try {
      const XLSX = await import("xlsx");
      const header = [
        [report.title],
        [`Project: ${report.projectName}${report.projectClient ? ` — Client: ${report.projectClient}` : ""}`],
        [`Generated: ${formatDate(report.generatedAt)}`],
        ...(report.headline ? [[report.headline]] : []),
        ["Drawings covered:"],
        ...(report.drawings.length
          ? report.drawings.map((d) => [`${drawingWithRevision(d)}${d.title ? ` — ${d.title}` : ""}`])
          : [["No drawings in this scope"]]),
        [],
      ];
      const sheet = XLSX.utils.aoa_to_sheet(header);
      if (report.rows.length) {
        XLSX.utils.sheet_add_aoa(sheet, [report.columns, ...report.rows], { origin: -1 });
      } else {
        XLSX.utils.sheet_add_aoa(sheet, [[report.emptyMessage]], { origin: -1 });
      }
      XLSX.utils.sheet_add_aoa(sheet, [[], [DISCLAIMER]], { origin: -1 });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Report");
      XLSX.writeFile(book, reportFileName(report, "xlsx"));
      setStatus("Excel file downloaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Create report"
    >
      <div className="w-full max-w-2xl space-y-5 rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl">Create report</h2>
            <p className="text-sm text-muted-foreground">
              Templated output built from the readings on file. Nothing here is written by AI.
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>

        {drawingId ? (
          <fieldset className="space-y-2">
            <legend className="text-xs uppercase tracking-wide text-muted-foreground">Covers</legend>
            <div className="flex gap-2">
              {(
                [
                  ["drawing", drawingLabel ? `This drawing (${drawingLabel})` : "This drawing"],
                  ["project", "Whole project"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setScope(value)}
                  aria-pressed={scope === value}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    scope === value ? "border-accent bg-accent/10" : "border-border text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wide text-muted-foreground">Template</legend>
          <div className="space-y-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                aria-pressed={template === t.id}
                className={`block w-full rounded-md border p-3 text-left ${
                  template === t.id ? "border-accent bg-accent/10" : "border-border"
                }`}
              >
                <span className="text-sm font-medium">{t.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{t.description}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <p className="text-xs text-muted-foreground">
          {loading
            ? "Loading the readings for this project…"
            : report
              ? `${report.rows.length} row${report.rows.length === 1 ? "" : "s"} across ${
                  report.drawings.length
                } drawing${report.drawings.length === 1 ? "" : "s"}. Every report carries the advisory note, the project name, the drawings covered with their revisions, and the date it was made.`
              : "Nothing to report yet."}
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={downloadPdf}
            disabled={busy || !report}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            Download PDF
          </button>
          <button
            onClick={copyReport}
            disabled={busy || !report}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Copy to clipboard
          </button>
          <button
            onClick={exportExcel}
            disabled={busy || !report}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground disabled:opacity-50"
          >
            Export to Excel
          </button>
        </div>

        {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
        <p className="text-xs text-muted-foreground">
          Sharing by link is not available in this build. Reports name the client and consultants, so link
          sharing needs expiry and access control designed first.
        </p>
      </div>
    </div>
  );
}
