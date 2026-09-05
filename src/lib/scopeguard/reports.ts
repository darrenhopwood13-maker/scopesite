// Templated report building. Nothing here is AI-generated: every line of a
// report comes from a database row or from a fixed sentence in this file.

export const DISCLAIMER =
  "Advisory only. ScopeGuard reports what the drawings say; it is not a compliance check or an approval. Scope allocation must be verified against the executed sub-contract documents by the Commercial Manager or Design Manager before it is relied upon.";

export type ReportTemplate =
  | "deferrals_register"
  | "open_items_schedule"
  | "party_dependency"
  | "package_scope_gap";


export const TEMPLATES: Array<{ id: ReportTemplate; name: string; description: string }> = [
  {
    id: "deferrals_register",
    name: "Deferrals register",
    description:
      "Every deferred item in severity order, quoted verbatim, with its source drawing and revision, the party it is deferred to and the action.",
  },
  {
    id: "open_items_schedule",
    name: "Open items schedule",
    description:
      "Open deferrals and contested interfaces as a numbered schedule with a suggested addressee and the action to confirm. Made to be tabled at a coordination meeting.",
  },
  {
    id: "party_dependency",
    name: "Party dependency report",
    description:
      "Every party, its type and appointment status, how many deferrals sit with it and which drawings depend on it.",
  },
  {
    id: "package_scope_gap",
    name: "Package scope gap report",
    description:
      "One trade at a time, for the tender pack: contested boundaries first, then what is clearly allocated to the package, deferrals that may land in it, the parties it depends on and every sheet the report was built from.",
  },
];


export type ReportDrawing = {
  id: string;
  drawing_number: string | null;
  file_name: string | null;
  revision: string | null;
  title: string | null;
  originator?: string | null;
  triage_class?: string | null;
};

export type ReportItem = {
  id: string;
  drawing_id: string;
  item_type: string;
  raw_text: string;
  severity: string | null;
  deferral_category: string | null;
  deferred_to: string | null;
  recommended_action: string | null;
  interface_guidance: string | null;
  allocation_status: string | null;
  correction_status: string | null;
  corrected_trade_code: string | null;
  allocated_trade_code: string | null;
  candidate_trades: unknown;
  party_id?: string | null;
};

export type ReportParty = {
  id: string;
  canonical_name: string;
  party_type: string;
  appointed_status: string;
};

/** One titled table in a multi-part report. */
export type ReportSection = {
  heading: string;
  note?: string;
  columns: string[];
  rows: string[][];
  emptyMessage: string;
};

export type Report = {
  template: ReportTemplate;
  title: string;
  projectName: string;
  projectClient?: string | null;
  generatedAt: Date;
  drawings: ReportDrawing[];
  columns: string[];
  rows: string[][];
  emptyMessage: string;
  headline?: string;
  /** Present on multi-section templates; when set, renderers use it instead of columns/rows. */
  sections?: ReportSection[];
};


const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };

const PARTY_TYPE_LABEL: Record<string, string> = {
  consultant: "Consultant",
  specialist_subcontractor: "Specialist subcontractor",
  client_side: "Client side",
  supplier: "Supplier",
  unknown: "Type not known",
};

// Appointment is only ever what the user set. Anything we do not recognise
// reads as "Not known" — a report must never assert an appointment nobody
// has confirmed.
function appointedLabel(status: string | null | undefined): string {
  if (status === "yes") return "Appointed";
  if (status === "no") return "Not appointed";
  return "Not known";
}

export function drawingLabel(d: ReportDrawing | undefined): string {
  if (!d) return "Unknown drawing";
  return d.drawing_number || d.file_name || "Unnamed drawing";
}

export function drawingWithRevision(d: ReportDrawing | undefined): string {
  if (!d) return "Unknown drawing";
  return `${drawingLabel(d)}${d.revision ? ` Rev ${d.revision}` : " (revision not stated)"}`;
}

function isOpen(item: ReportItem): boolean {
  return item.correction_status !== "dismissed" && item.correction_status !== "resolved";
}

function effectiveStatus(item: ReportItem): string {
  if (item.correction_status === "dismissed") return "dismissed";
  if (item.corrected_trade_code || item.correction_status === "accepted") return "allocated";
  return item.allocation_status ?? "unallocated";
}

function candidateCodes(item: ReportItem): string[] {
  const v = item.candidate_trades;
  return Array.isArray(v)
    ? (v as Array<{ trade_code?: string }>).map((c) => c.trade_code ?? "").filter(Boolean)
    : [];
}

function bySeverity(a: ReportItem, b: ReportItem): number {
  return (SEVERITY_ORDER[a.severity ?? "low"] ?? 3) - (SEVERITY_ORDER[b.severity ?? "low"] ?? 3);
}

type BuildInput = {
  projectName: string;
  projectClient?: string | null;
  drawings: ReportDrawing[];
  items: ReportItem[];
  parties?: ReportParty[];
  scopeLabel: string;
  /** Package report only. */
  trade?: { code: string; name: string } | null;
  tradeCues?: Array<{ trade_code: string; cue: string }>;
  tradeNames?: Record<string, string>;
};


export function buildReport(template: ReportTemplate, input: BuildInput): Report {
  const byId = new Map(input.drawings.map((d) => [d.id, d]));
  const base = {
    template,
    projectName: input.projectName,
    projectClient: input.projectClient ?? null,
    generatedAt: new Date(),
    drawings: input.drawings,
  };

  if (template === "deferrals_register") {
    const rows = input.items
      .filter((i) => i.item_type === "deferral")
      .sort(bySeverity)
      .map((i) => [
        SEVERITY_LABEL[i.severity ?? "low"] ?? "Low",
        (i.deferral_category ?? "").replace(/_/g, " "),
        i.raw_text,
        drawingWithRevision(byId.get(i.drawing_id)),
        i.deferred_to ?? "Not named on the drawing",
        i.recommended_action ?? "Confirm who carries this item.",
      ]);
    return {
      ...base,
      title: `Deferrals register — ${input.scopeLabel}`,
      columns: ["Severity", "Category", "Quoted from the drawing", "Source", "Deferred to", "Action"],
      rows,
      emptyMessage: "No deferrals were found in this scope.",
    };
  }

  if (template === "open_items_schedule") {
    const deferrals = input.items.filter((i) => i.item_type === "deferral" && isOpen(i)).sort(bySeverity);
    const contested = input.items
      .filter((i) => i.item_type !== "deferral" && isOpen(i) && effectiveStatus(i) === "ambiguous")
      .sort(bySeverity);

    const rows: string[][] = [];
    let n = 0;
    for (const i of deferrals) {
      n += 1;
      rows.push([
        String(n),
        "Deferred scope",
        i.raw_text,
        drawingWithRevision(byId.get(i.drawing_id)),
        i.deferred_to ?? "Not named — confirm the responsible party",
        i.recommended_action ?? "Confirm who carries this item and by when.",
      ]);
    }
    for (const i of contested) {
      n += 1;
      const codes = candidateCodes(i);
      rows.push([
        String(n),
        "Contested interface",
        i.raw_text,
        drawingWithRevision(byId.get(i.drawing_id)),
        codes.length ? `${codes.join(" / ")} package leads` : "Package leads to be confirmed",
        i.interface_guidance ?? "Confirm which package carries this item.",
      ]);
    }
    return {
      ...base,
      title: `Open items schedule — ${input.scopeLabel}`,
      columns: ["Item", "Type", "Description", "Source", "Suggested addressee", "Action to confirm"],
      rows,
      emptyMessage: "There are no open deferrals or contested interfaces in this scope.",
    };
  }

  if (template === "package_scope_gap") {
    return buildPackageReport(base, input, byId);
  }



  const parties = input.parties ?? [];
  const deferrals = input.items.filter((i) => i.item_type === "deferral");
  const rows = parties
    .map((p) => {
      const theirs = deferrals.filter((i) => i.party_id === p.id);
      const drawingNames = Array.from(new Set(theirs.map((i) => drawingWithRevision(byId.get(i.drawing_id)))));
      return {
        count: theirs.length,
        row: [
          p.canonical_name,
          PARTY_TYPE_LABEL[p.party_type] ?? p.party_type,
          appointedLabel(p.appointed_status),
          String(theirs.length),
          drawingNames.length ? drawingNames.join("; ") : "No drawings in this scope",
        ],
      };
    })
    .sort((a, b) => b.count - a.count || (a.row[0] ?? "").localeCompare(b.row[0] ?? ""))
    .map((r) => r.row);

  // Deferrals naming nobody are the headline number, and they lead the table.
  const unnamed = deferrals.filter((i) => !i.party_id).length;
  if (unnamed > 0) {
    rows.unshift([
      "No party named on the drawing",
      "Type not known",
      "Not known",
      String(unnamed),
      "See the deferrals register for the sheets involved",
    ]);
  }

  return {
    ...base,
    title: `Party dependency report — ${input.scopeLabel}`,
    headline:
      unnamed > 0
        ? `${unnamed} deferral${unnamed === 1 ? "" : "s"} across these drawings name no responsible party. Under our own rules those are all high severity.`
        : "Every deferral across these drawings names a responsible party.",
    columns: ["Party", "Type", "Appointment status", "Deferrals", "Drawings depending on them"],
    rows,
    emptyMessage: "No parties have been recorded for this scope yet.",
  };
}

export function formatDate(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function reportToHtml(report: Report): string {
  const coverage = report.drawings.length
    ? report.drawings.map((d) => `<li>${escapeHtml(drawingWithRevision(d))}${d.title ? ` — ${escapeHtml(d.title)}` : ""}</li>`).join("")
    : "<li>No drawings in this scope</li>";

  const table = (columns: string[], rows: string[][], empty: string) =>
    rows.length
      ? `<table><thead><tr>${columns
          .map((c) => `<th>${escapeHtml(c)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`
      : `<p class="empty">${escapeHtml(empty)}</p>`;

  const body = report.sections
    ? report.sections
        .map(
          (s) =>
            `<h2>${escapeHtml(s.heading)}</h2>${
              s.note ? `<p class="meta">${escapeHtml(s.note)}</p>` : ""
            }${table(s.columns, s.rows, s.emptyMessage)}`,
        )
        .join("")
    : table(report.columns, report.rows, report.emptyMessage);


  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${escapeHtml(
    report.title,
  )}</title><style>
    @page { size: A4 landscape; margin: 14mm; }
    body { font-family: "Helvetica Neue", Arial, sans-serif; color: #16181d; font-size: 11px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 12px; margin: 16px 0 4px; text-transform: uppercase; letter-spacing: .06em; }
    .meta { color: #555; font-size: 11px; margin: 0 0 2px; }
    ul { margin: 4px 0 0 16px; padding: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #cfd3da; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #f2f4f7; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    tr { page-break-inside: avoid; }
    .disclaimer { margin-top: 16px; border-left: 3px solid #b58a00; padding: 8px 10px; background: #fdf8e8; font-size: 10px; }
    .empty { margin-top: 10px; font-style: italic; }
    .headline { font-size: 13px; font-weight: bold; margin: 10px 0 2px; }
  </style></head><body>
    <h1>${escapeHtml(report.title)}</h1>
    <p class="meta">Project: ${escapeHtml(report.projectName)}${
      report.projectClient ? ` — Client: ${escapeHtml(report.projectClient)}` : ""
    }</p>
    <p class="meta">Generated: ${escapeHtml(formatDate(report.generatedAt))}</p>
    ${report.headline ? `<p class="headline">${escapeHtml(report.headline)}</p>` : ""}
    <h2>Drawings covered</h2>
    <ul>${coverage}</ul>
    ${body}
    <p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>
  </body></html>`;
}

export function reportToText(report: Report): string {
  const lines: string[] = [];
  lines.push(report.title);
  lines.push(`Project: ${report.projectName}${report.projectClient ? ` — Client: ${report.projectClient}` : ""}`);
  lines.push(`Generated: ${formatDate(report.generatedAt)}`);
  lines.push("");
  if (report.headline) {
    lines.push(report.headline);
    lines.push("");
  }
  lines.push("Drawings covered:");
  if (report.drawings.length) {
    for (const d of report.drawings) {
      lines.push(`  - ${drawingWithRevision(d)}${d.title ? ` — ${d.title}` : ""}`);
    }
  } else {
    lines.push("  - No drawings in this scope");
  }
  lines.push("");
  const flat = (c: string) => c.replace(/\s*\n\s*/g, " ");
  if (report.sections) {
    for (const s of report.sections) {
      lines.push(s.heading);
      if (s.note) lines.push(s.note);
      if (s.rows.length) {
        lines.push(s.columns.join("\t"));
        for (const row of s.rows) lines.push(row.map(flat).join("\t"));
      } else {
        lines.push(s.emptyMessage);
      }
      lines.push("");
    }
  } else if (report.rows.length) {
    lines.push(report.columns.join("\t"));
    for (const row of report.rows) {
      lines.push(row.map(flat).join("\t"));
    }
  } else {
    lines.push(report.emptyMessage);
  }

  lines.push("");
  lines.push(DISCLAIMER);
  return lines.join("\n");
}

export function reportFileName(report: Report, extension: string): string {
  const slug = report.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const stamp = report.generatedAt.toISOString().slice(0, 10);
  return `${slug}-${stamp}.${extension}`;
}

/* ---------------------------------------------------------------- */
/* Package scope gap report                                          */
/* ---------------------------------------------------------------- */

type ReportBase = Pick<Report, "template" | "projectName" | "projectClient" | "generatedAt" | "drawings">;

const TRIAGE_LABEL: Record<string, string> = {
  annotation_rich: "Annotation rich",
  notes_only: "Notes only — annotations not read",
  graphical_only: "Graphical only — no readable text",
  unreadable: "Unreadable",
};

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

function mentionsCue(text: string, cues: string[]): string | null {
  const hay = norm(text);
  for (const cue of cues) {
    const c = norm(cue);
    if (c.trim().length < 3) continue;
    if (hay.includes(c)) return cue.trim();
  }
  return null;
}

/** The trade an item is actually allocated to, honouring a user correction. */
function effectiveTrade(item: ReportItem): string | null {
  return item.corrected_trade_code ?? item.allocated_trade_code ?? null;
}

function tradeList(codes: string[], names: Record<string, string>): string {
  return codes.map((c) => `${c}${names[c] ? ` ${names[c]}` : ""}`).join(", ");
}

function buildPackageReport(
  base: ReportBase,
  input: BuildInput,
  byId: Map<string, ReportDrawing>,
): Report {
  const trade = input.trade ?? { code: "", name: "No trade selected" };
  const names = input.tradeNames ?? {};
  const cues = (input.tradeCues ?? []).filter((c) => c.trade_code === trade.code).map((c) => c.cue);
  const live = input.items.filter((i) => i.correction_status !== "dismissed");

  // 1. Contested — this trade named as a candidate, or allocated but ambiguous.
  const contested = live
    .filter(
      (i) =>
        effectiveStatus(i) === "ambiguous" &&
        (candidateCodes(i).includes(trade.code) || effectiveTrade(i) === trade.code),
    )
    .sort(bySeverity);

  // 2. Clearly allocated to this trade.
  const allocated = live
    .filter((i) => effectiveStatus(i) === "allocated" && effectiveTrade(i) === trade.code)
    .sort(
      (a, b) =>
        drawingLabel(byId.get(a.drawing_id)).localeCompare(drawingLabel(byId.get(b.drawing_id))) ||
        bySeverity(a, b),
    );

  // 3. Deferrals that could land here: on a sheet this trade already works on,
  //    or whose own wording matches this trade's cues. Never asserted as ours.
  const tradeDrawingIds = new Set([...contested, ...allocated].map((i) => i.drawing_id));
  const maybe = live
    .filter((i) => i.item_type === "deferral")
    .map((i) => {
      const cue = mentionsCue(i.raw_text, cues);
      const onSheet = tradeDrawingIds.has(i.drawing_id);
      if (!cue && !onSheet) return null;
      return {
        item: i,
        why: cue
          ? `Wording matches this package (“${cue}”)`
          : "On a drawing where this package already carries work",
      };
    })
    .filter((x): x is { item: ReportItem; why: string } => x !== null)
    .sort((a, b) => bySeverity(a.item, b.item));

  // 4. Parties named on any item touching this package.
  const partyIds = new Set(
    [...contested, ...allocated, ...maybe.map((m) => m.item)]
      .map((i) => i.party_id)
      .filter((p): p is string => Boolean(p)),
  );
  const partyRows = (input.parties ?? [])
    .filter((p) => partyIds.has(p.id))
    .map((p) => {
      const count = [...contested, ...allocated, ...maybe.map((m) => m.item)].filter(
        (i) => i.party_id === p.id,
      ).length;
      return [
        p.canonical_name,
        PARTY_TYPE_LABEL[p.party_type] ?? p.party_type,
        appointedLabel(p.appointed_status),
        String(count),
      ];
    })
    .sort((a, b) => Number(b[3]) - Number(a[3]) || (a[0] ?? "").localeCompare(b[0] ?? ""));

  const sections: ReportSection[] = [
    {
      heading: "1. Contested items — settle before the package is let",
      note: "This package is one of the candidate trades on each of these. Nobody carries them until it is agreed in writing.",
      columns: [
        "Severity",
        "Quoted from the drawing",
        "Source",
        "Other candidate trades",
        "Interface guidance",
      ],
      rows: contested.map((i) => [
        SEVERITY_LABEL[i.severity ?? "low"] ?? "Low",
        i.raw_text,
        drawingWithRevision(byId.get(i.drawing_id)),
        tradeList(
          candidateCodes(i).filter((c) => c !== trade.code),
          names,
        ) || "None named — confirm the boundary",
        i.interface_guidance ?? "Confirm which package carries this item.",
      ]),
      emptyMessage: "No contested items name this package.",
    },
    {
      heading: "2. Allocated to this package",
      columns: ["Source", "Quoted from the drawing", "Severity"],
      rows: allocated.map((i) => [
        drawingWithRevision(byId.get(i.drawing_id)),
        i.raw_text,
        SEVERITY_LABEL[i.severity ?? "low"] ?? "Low",
      ]),
      emptyMessage: "Nothing on these drawings is clearly allocated to this package.",
    },
    {
      heading: "3. Deferrals that may fall to this package — confirm",
      note: "These are not allocated to this package. They are deferrals close enough to it that they must be confirmed before tender.",
      columns: ["Severity", "Quoted from the drawing", "Source", "Deferred to", "Why it is listed", "Action"],
      rows: maybe.map(({ item: i, why }) => [
        SEVERITY_LABEL[i.severity ?? "low"] ?? "Low",
        i.raw_text,
        drawingWithRevision(byId.get(i.drawing_id)),
        i.deferred_to ?? "Not named on the drawing",
        why,
        "May fall to this package — confirm",
      ]),
      emptyMessage: "No deferrals sit close to this package on these drawings.",
    },
    {
      heading: "4. Parties this package depends on",
      columns: ["Party", "Type", "Appointment status", "Items involving this package"],
      rows: partyRows,
      emptyMessage: "No party is named on any item touching this package.",
    },
    {
      heading: "5. Drawings covered",
      columns: ["Drawing", "Revision", "Title", "What could be read"],
      rows: base.drawings.map((d) => [
        drawingLabel(d),
        d.revision ?? "Not stated",
        d.title ?? "No title read",
        TRIAGE_LABEL[d.triage_class ?? ""] ?? "Not classified",
      ]),
      emptyMessage: "No drawings in this scope.",
    },
  ];

  const unconfirmed = (input.parties ?? []).filter(
    (p) => partyIds.has(p.id) && p.appointed_status !== "yes",
  );
  const headline = [
    `${contested.length} contested item${contested.length === 1 ? "" : "s"} name this package, ${allocated.length} item${
      allocated.length === 1 ? "" : "s"
    } are clearly allocated to it and ${maybe.length} deferral${maybe.length === 1 ? "" : "s"} may fall to it.`,
    unconfirmed.length
      ? `${unconfirmed.length} of the parties it depends on ${unconfirmed.length === 1 ? "is" : "are"} not confirmed as appointed: ${unconfirmed
          .map((p) => p.canonical_name)
          .join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    ...base,
    title: `Package scope gap report — ${trade.name}${trade.code ? ` (${trade.code})` : ""} — ${input.scopeLabel}`,
    headline,
    columns: sections[0]!.columns,
    rows: sections.flatMap((s) => s.rows),
    emptyMessage: "Nothing on these drawings touches this package.",
    sections,
  };
}
