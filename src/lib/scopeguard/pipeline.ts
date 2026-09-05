// Pure extraction/analysis logic for ScopeGuard. No PDF library imports here so
// the same code can be tested outside the server runtime.

export type Span = {
  str: string;
  x: number; // left edge, viewport frame (y grows downwards)
  y: number; // baseline
  width: number;
  height: number;
  fontSize: number;
  colour: string; // 6-digit lowercase hex
};

export type MergedItem = Span & { lines: number };

export type DeferralPattern = {
  id: string;
  category: string;
  pattern: string;
  default_severity: string;
  recommended_action: string | null;
  commercial_risk: string | null;
};

export type Region = "notes" | "body" | "titleblock";

export type Finding = {
  raw_text: string;
  region: Region;
  bbox: { x: number; y: number; w: number; h: number };
  colour: string;
  font_size: number;
  is_red: boolean;
  deferral_category: string;
  also_categories: string[];
  deferred_to: string | null;
  severity: "high" | "medium" | "low";
  commercial_risk: string | null;
  recommended_action: string | null;
  method: string;
};

/* ------------------------------------------------------------------ */
/* Stage 1 — line merging                                              */
/* ------------------------------------------------------------------ */

// Horizontal: same baseline, small gap. Recovers split system codes and the
// trailing fragments some fonts emit ("... designer" + "’s documentation.").
export function mergeHorizontal(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Span[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    const gap = prev ? s.x - (prev.x + prev.width) : 0;
    if (
      prev &&
      Math.abs(prev.y - s.y) <= 0.5 &&
      Math.abs(prev.fontSize - s.fontSize) <= 0.3 &&
      prev.colour === s.colour &&
      s.x >= prev.x &&
      gap < Math.max(2, s.fontSize * 0.75)
    ) {
      const glue = /^[’'",.;:)\]]/.test(s.str) ? "" : gap > 0.6 && !prev.str.endsWith(" ") ? " " : "";
      prev.str = prev.str + glue + s.str;
      prev.width = s.x + s.width - prev.x;
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

// Vertical: left edges within 3pt, gap 0-6pt, font size within 0.3pt, same colour.
// `startsNewBlock` marks lines that begin a numbered note; they never fold into
// the note above them.
export function mergeVertical(
  spans: Span[],
  startsNewBlock?: (s: Span) => boolean,
): MergedItem[] {
  // Bucket the left edge before sorting: two lines of the same paragraph can
  // differ by a fraction of a point, which would otherwise reverse their order.
  const bucket = (v: number) => Math.round(v / 3);
  const sorted = [...spans].sort((a, b) => bucket(a.x) - bucket(b.x) || a.y - b.y);
  const used = new Array(sorted.length).fill(false);
  const out: MergedItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const first = sorted[i]!;
    const cur: MergedItem = { ...first, lines: 1 };
    let last = first;
    for (let j = i + 1; j < sorted.length; j++) {
      if (used[j]) continue;
      const c = sorted[j]!;
      if (bucket(c.x) - bucket(last.x) > 1) break;
      if (startsNewBlock?.(c)) break;
      const gap = c.y - (last.y + last.height * 0);
      const lineGap = c.y - last.y - last.fontSize;
      if (
        Math.abs(c.x - last.x) <= 3 &&
        gap > 0 &&
        lineGap >= 0 &&
        lineGap <= 6 &&
        Math.abs(c.fontSize - last.fontSize) <= 0.3 &&
        c.colour === last.colour
      ) {
        used[j] = true;
        cur.str = `${cur.str} ${c.str}`.replace(/\s+/g, " ").trim();
        cur.width = Math.max(cur.width, c.width);
        cur.height = c.y + c.height - cur.y;
        cur.lines += 1;
        last = c;
      }
    }
    out.push(cur);
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}


/* ------------------------------------------------------------------ */
/* Triage                                                              */
/* ------------------------------------------------------------------ */

const ANNOTATION_ONLY: RegExp[] = [
  /^[\d\s.,:+\-/x×'"()]+$/i, // numbers, dimensions, level datums (+44836, 43930)
  /^[A-Za-z]$/,
  /^[A-Z]{1,2}[\s.-]?\d{1,3}$/i, // letter-number grid references
  /^\d+\s*[:/]\s*\d+$/, // scale text 1 : 50
  /^(scale|north|rev|revision|date|drawn|checked|do not scale.*)$/i,
  /^[\d.,]+\s?(mm|m|cm)$/i,
  /^\d{1,2}[-/]?[A-Z]{2,4}$/i, // level datum labels such as 05-FCL
  // Zone and orientation labels: "STAIR CORE", "INTERIOR", "EXTERIOR", "NORTH
  // ELEVATION", "LEVEL 04", "CORE 2". Names a place on the sheet, not scope.
  /^(interior|exterior|internal|external|inside|outside|above|below|left|right|top|bottom|upper|lower|front|rear|near|far|typical|typ|existing|proposed|new|opposite hand|handed)$/i,
  /^(north|south|east|west|north[- ]?east|north[- ]?west|south[- ]?east|south[- ]?west|ne|nw|se|sw)(\s+(elevation|facade|façade|wing|side|end|view|block|core))?$/i,
  /^(stair|lift|service|riser|escape|access)?\s*(core|lobby|shaft|riser|well|landing)\s*\d*[a-z]?$/i,
  /^(level|floor|storey|story|zone|block|core|grid|bay|room|area|plot|phase|sector|wing|unit|apartment|flat|plant|roof|basement|mezzanine|ground|podium)\s*[-–]?\s*[a-z0-9.]{0,6}$/i,
  /^(plan|section|elevation|detail|view|key ?plan|site plan|location plan|part plan|enlarged plan)\s*[a-z0-9-]{0,4}$/i,
  /^(ground|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+floor(\s+(plan|level))?$/i,
  // Level datums and their labels: "RFW-LEVEL", "RF-LEVEL", "06-FFL 43930".
  /^[a-z]{1,4}[-\s]?(level|ffl|fcl|ssl|sfl|aod|soffit|datum)\b[\s\d.,+-]*$/i,
  /^\d{1,3}[-\s]?(level|ffl|fcl|ssl|sfl|aod|datum)\b[\s\d.,+-]*$/i,
  // Location labels: street names and site boundaries name a place, not scope.
  /^[a-z][a-z'\s-]*\s(street|road|lane|avenue|way|place|square|gardens|drive|close|court|row|terrace|mews|yard|park|hill|crescent|walk|wharf|embankment)$/i,
  /^(site\s+|red\s?line\s+|party\s?wall\s+|building\s+)?(boundary|line)$/i,
  // View and section labels: "Elevation view on top connection", "Plan view on
  // base connection", "Section A-A", "Detail 3", "View on grid 4". Names which
  // drawn view you are looking at, not scope.
  /^(enlarged\s+|part\s+|typical\s+|indicative\s+)?(plan|section|elevation|detail|isometric|axonometric|3d)?\s*(view|section|detail|elevation|plan)\s+(on|at|through|of|looking)\b.*$/i,
  /^(section|detail|elevation|plan|view)\s*[-–]?\s*[a-z0-9]{1,3}\s*[-–]?\s*[a-z0-9]{0,3}$/i,
  /^(scale\s*bar|scale\s*[:=]?\s*\d+\s*[:/]\s*\d+|\d+\s*[:/]\s*\d+\s*(@|at)\s*a[0-4])$/i,
];



export function isAnnotationOnly(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return true;
  if (!/[a-z]{3}/i.test(t)) return true; // nothing word-like in it
  return ANNOTATION_ONLY.some((re) => re.test(t));
}

/* ------------------------------------------------------------------ */
/* Titleblock location by content                                      */
/* ------------------------------------------------------------------ */

// A titleblock is recognisable by its field labels, not by where it sits.
// Bottom strips, left strips and corner blocks are all normal, and a
// position-only rule fails silently on them: everything becomes body text and
// drawn-by initials end up asking to be allocated to a trade.
const TB_LABELS: RegExp[] = [
  /^drawing\s*(no\.?|number)\b/i,
  /^dwg\s*(no\.?|number)\b/i,
  /^(rev|revision)\b\.?:?$/i,
  /^scale\b\.?:?/i,
  /^drawn\b\.?:?/i,
  /^(checked|chkd|approved|authorised|authorized)\b\.?:?/i,
  /^client\b\.?:?/i,
  /^project\b(\s*(no\.?|number|name))?\.?:?/i,
  /^(job|contract)\s*(no\.?|number)\b/i,
  /^date\b\.?:?$/i,
  /^(title|drawing title|sheet title)\b\.?:?/i,
  /^(status|suitability|purpose of issue)\b\.?:?/i,
  /^(originator|designer|architect|engineer)\b\.?:?$/i,
  /^description$/i,
  /^sheet\s*(no\.?|size)?\b/i,
];

export type Box = { x0: number; y0: number; x1: number; y1: number };

export function findTitleblockBox(
  lines: Array<{ str: string; x: number; y: number; width?: number; height?: number }>,
  pageWidth: number,
  pageHeight: number,
): Box | null {
  const hits = lines.filter((l) => TB_LABELS.some((re) => re.test(l.str.trim())));
  if (hits.length < 4) return null;

  // Single-linkage clustering: labels belonging to one titleblock sit close
  // together wherever that block is placed on the sheet.
  const radius = Math.hypot(pageWidth, pageHeight) * 0.16;
  const clusters: Array<typeof hits> = [];
  for (const h of hits) {
    const near = clusters.filter((c) =>
      c.some((m) => Math.hypot(m.x - h.x, m.y - h.y) <= radius),
    );
    if (!near.length) {
      clusters.push([h]);
      continue;
    }
    const first = near[0]!;
    first.push(h);
    for (const other of near.slice(1)) {
      first.push(...other);
      clusters.splice(clusters.indexOf(other), 1);
    }
  }

  const best = clusters.sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < 4) return null;

  const padX = pageWidth * 0.03;
  const padY = pageHeight * 0.03;
  const box: Box = {
    x0: Math.min(...best.map((l) => l.x)) - padX,
    y0: Math.min(...best.map((l) => l.y)) - padY,
    x1: Math.max(...best.map((l) => l.x + (l.width ?? 0))) + padX * 2,
    y1: Math.max(...best.map((l) => l.y + (l.height ?? 0))) + padY,
  };
  // A "titleblock" covering most of the sheet is a bad match, not a titleblock.
  const area = ((box.x1 - box.x0) * (box.y1 - box.y0)) / (pageWidth * pageHeight);
  if (area > 0.5) return null;
  return box;
}

export function inBox(box: Box, x: number, y: number): boolean {
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
}


export type TriageClass = "annotation_rich" | "notes_only" | "graphical_only" | "unreadable";

export function triage(input: {
  bodyTextCount: number;
  notesTextCount: number;
  totalTextCount: number;
  pathCount: number;
}): TriageClass {
  if (input.totalTextCount < 10) return "unreadable";
  if (input.bodyTextCount >= 20) return "annotation_rich";
  if (input.notesTextCount >= 10) return "notes_only";
  if (input.pathCount > 5000) return "graphical_only";
  return "unreadable";
}

/* ------------------------------------------------------------------ */
/* Titleblock parse                                                    */
/* ------------------------------------------------------------------ */

const DRAWING_NUMBER = /\b[A-Z]{2,4}(?:-[A-Z0-9]{1,6}){3,8}\b/;
const STATUS_CODE = /\b(?:S[0-7]|A[1-5]|P\d{2}|C\d{2})\b/;

export type Titleblock = {
  drawing_number: string | null;
  revision: string | null;
  drawing_date: string | null;
  drawing_scale: string | null;
  title: string | null;
  drawing_client: string | null;
  originator: string | null;
  issue_status: string | null;
  drawing_type: string | null;
  discipline_code: string | null;
};

const TYPE_CUES: Array<[RegExp, string]> = [
  [/scope plan/i, "scope_plan"],
  [/reflected ceiling|\bRCP\b/i, "RCP"],
  [/\bdetails?\b/i, "detail"],
  [/\bsections?\b/i, "section"],
  [/\belevations?\b/i, "elevation"],
  [/\bschedule\b/i, "schedule"],
  [/general arrangement|\bGA\b/i, "GA"],
  [/\bplan\b/i, "GA"],
];

export type TbLine = { str: string; x: number; y: number; fontSize: number };

// Titleblocks are label/value pairs: the value sits directly under its label,
// on roughly the same left edge. Anything not found is left blank, never guessed.
function valueUnder(lines: TbLine[], label: RegExp): string | null {
  const labels = lines.filter((l) => label.test(l.str.trim()));
  for (const lab of labels) {
    const value = lines
      .filter(
        (l) =>
          l !== lab &&
          Math.abs(l.x - lab.x) <= 14 &&
          l.y > lab.y + 1 &&
          l.y - lab.y < 40 &&
          l.str.trim().length > 0,
      )
      .sort((a, b) => a.y - b.y)[0];
    if (value) return value.str.trim();
  }
  return null;
}

// Revision history table: a short revision code with a date on the same
// baseline, to its right. Returns one entry per row found.
function revisionRows(lines: TbLine[]): Array<{ rev: string; date: string }> {
  const rows: Array<{ rev: string; date: string }> = [];
  const codes = lines.filter((l) => /^(P\d{2}|C\d{2}|[A-Z]?\d{1,2})$/i.test(l.str.trim()));
  for (const code of codes) {
    const right = lines
      .filter(
        (l) =>
          l !== code &&
          Math.abs(l.y - code.y) <= 3 &&
          l.x > code.x &&
          l.x - code.x < 120 &&
          /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(l.str.trim()),
      )
      .sort((a, b) => a.x - b.x)[0];
    if (!right) continue;
    const date = right.str.trim().match(/^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/)?.[1];
    if (date) rows.push({ rev: code.str.trim().toUpperCase(), date });
  }
  return rows;
}

export function parseTitleblock(lines: TbLine[], revisionScanLines?: TbLine[]): Titleblock {

  const clean = lines
    .map((l) => ({ ...l, str: l.str.trim() }))
    .filter((l) => l.str.length > 0);
  const joined = clean.map((l) => l.str).join(" \n ");
  const tb: Titleblock = {
    drawing_number: null,
    revision: null,
    drawing_date: null,
    drawing_scale: null,
    title: null,
    drawing_client: null,
    originator: null,
    issue_status: null,
    drawing_type: null,
    discipline_code: null,
  };

  const numLabel = valueUnder(clean, /^drawing\s*(no\.?|number)$/i);
  const numText = (numLabel ?? joined).replace(/(?<=[A-Z0-9-])[ ]+(?=[A-Z0-9-])/g, "");
  const num = numText.match(DRAWING_NUMBER);
  if (num) tb.drawing_number = num[0].replace(/^-|-$/g, "");

  const revValue = valueUnder(clean, /^rev(?:ision|\.)?$/i);
  const rev =
    revValue?.match(/^(P\d{2}|C\d{2}|[A-Z]?\d{1,2})$/i) ??
    joined.match(/\brev(?:ision)?\.?\s*[:\-]?\s*(P\d{2}|C\d{2}|[A-Z]?\d{1,2})\b/i) ??
    joined.match(/\b(P\d{2})\b/);
  if (rev?.[1]) tb.revision = rev[1].toUpperCase();

  // Date order: the titleblock's own date field first (that is the date printed
  // on the sheet), then the revision history row for the CURRENT revision —
  // never the first row of the history, and never a "first issue" date while a
  // current-revision row exists.
  const revRows = revisionRows(revisionScanLines ?? clean);
  const currentRow = tb.revision
    ? revRows.find((r) => r.rev === tb.revision)
    : revRows.slice().sort((a, b) => b.rev.localeCompare(a.rev))[0];

  const dateField = valueUnder(clean, /^date$/i)?.match(
    /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/,
  )?.[1];

  if (dateField) tb.drawing_date = dateField;
  else if (currentRow) tb.drawing_date = currentRow.date;
  else {
    const dateValue = valueUnder(clean, /first issue date/i);
    const date = (dateValue ?? joined).match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/);
    if (date?.[1]) tb.drawing_date = date[1];
  }
  if (currentRow && !tb.revision) tb.revision = currentRow.rev;



  const scaleValue = valueUnder(clean, /^scale\b.*$/i);
  tb.drawing_scale = scaleValue ?? joined.match(/\b1\s*[:/]\s*\d{1,4}(?:\s*@\s*A\d)?/i)?.[0] ?? null;

  const statusValue =
    valueUnder(clean, /^(purpose of issue|status|suitability)$/i) ??
    joined.match(/\b(S[0-7]|A[1-5])\s*[-–]\s*[A-Za-z ]{3,40}/)?.[0] ??
    null;
  if (statusValue) tb.issue_status = statusValue.trim();

  tb.drawing_client = valueUnder(clean, /^(client|employer)$/i);
  tb.title = valueUnder(clean, /^(title|drawing title)$/i);

  const orig = joined.match(/\b(Foster\s?\+\s?Partners|Veretec)\b/i);
  if (orig) {
    tb.originator = /veretec/i.test(orig[0]) ? "Veretec" : "Foster + Partners";
  } else {
    const copy = joined.match(/©\s*(?:copyright)?\s*[-–]?\s*([A-Za-z'&+. -]{3,40})/i);
    if (copy?.[1]) tb.originator = copy[1].trim();
  }

  const typeSource = tb.title ?? joined;
  for (const [re, type] of TYPE_CUES) {
    if (re.test(typeSource)) {
      tb.drawing_type = type;
      break;
    }
  }

  if (tb.drawing_number) {
    const parts = tb.drawing_number.split("-");
    const candidate = parts[parts.length - 2];
    if (candidate && /^(A|S|M|E|P|FP|C|L|T|X)$/.test(candidate)) tb.discipline_code = candidate;
  }

  return tb;
}

/* ------------------------------------------------------------------ */
/* Deferral detection                                                  */
/* ------------------------------------------------------------------ */

const PARTY_PHRASES =
  /(?:reviewed with|review by|reviewed by|confirmed by|agreed with|agreed by|approved by|coordinated with|co-ordinated with|designed by|determined by|defined by|specified by|provided by|carried out by|installed by|subject to review by|refer to|in accordance with|to suit|by)\s+((?:the\s+)?(?:appointed\s+|nominated\s+|agreed\s+|relevant\s+)?[A-Za-z'’&/+ -]{4,80}?)(?:\.|,|;|$)/i;
const PARTY_FALLBACK = /\b(?:with|to)\s+((?:the\s+)?[A-Za-z'’&/+ -]{4,80}?)(?:\.|,|;|$)/i;

// A company name is a party wherever it appears in the note, with or without a
// verb in front of it: "SURVEY BY MB SURVEY SOLUTIONS LTD".
const COMPANY_NAME =
  /\b((?:[A-Za-z][A-Za-z&.'’-]*\s+){1,4}(?:Ltd|Ltd\.|Limited|LLP|L\.L\.P\.|PLC|Plc|Partners|Partnership))\b/i;

const LEADING_NOISE =
  /^(?:by|to|with|from|for|of|the|and|a|an|agreed|appointed|nominated|relevant|specialist's)\s+/i;

// Stage and phase names are not parties. "TENANT FIT OUT" is a stage of the
// works; the party is whoever is named alongside it.
const STAGE_NAMES =
  /^(?:tenant\s+fit[- ]?out|fit[- ]?out|base\s+build|shell\s*(?:and|&)\s*core|cat\s?[ab]|construction|demolition|strip[- ]?out|design(?:\s+stage)?|stage\s+[\w-]+|works?|handover|practical\s+completion)$/i;

// The words before a company suffix are only part of the name while they are
// capitalised: "referred back to Veretec Limited" names Veretec Limited.
function trimToName(raw: string): string {
  const words = raw.trim().split(/\s+/);
  while (words.length > 1 && !/^[A-Z]/.test(words[0]!)) words.shift();
  return words.join(" ");
}

// Documents belong to a party but are not the party: strip the document tail so
// "specialist lighting designer’s documentation" reads as the designer.
function cleanParty(raw: string): string | null {
  let party = raw.replace(/\s+/g, " ").trim();
  party = party.split(/[’']s\b/)[0]!.trim();
  party = party
    .replace(
      /\s+(?:documentation|documents?|drawings?|details?|information|specification|schedule|report|requirements?|instructions?|approval)\b.*$/i,
      "",
    )
    .trim();
  while (LEADING_NOISE.test(party)) party = party.replace(LEADING_NOISE, "");
  party = party.replace(/[.,;:]+$/, "").trim();
  if (party.length < 3) return null;
  if (STAGE_NAMES.test(party)) return null;
  return party;
}

export function extractDeferredTo(text: string): string | null {
  if (/\bby others\b/i.test(text)) return null;

  // 1. A named company anywhere in the note, captured in full.
  const company = text.match(COMPANY_NAME);
  if (company?.[1]) {
    const cleaned = cleanParty(trimToName(company[1]));
    if (cleaned) return cleaned;
  }

  // 2. Compound parties: "Landlord - Tenant Demarcation Schedule" names both.
  if (/\blandlord\b\s*[-–—/&]?\s*(?:and\s+|to\s+)?\btenant\b/i.test(text)) return "Landlord and Tenant";

  // 3. A party named after a verb or pointer phrase.
  const m = text.match(PARTY_PHRASES) ?? text.match(PARTY_FALLBACK);
  if (!m?.[1]) return null;
  const party = cleanParty(m[1]);
  if (!party) return null;
  if (!PARTY_WORDS.test(party)) return null;
  return party;
}

const PARTY_WORDS =
  /(specialist|consultant|architect|engineer|designer|contractor|sub-?contractor|tenant|landlord|client|employer|manufacturer|supplier|authority|surveyor)/i;

// Does the note name anybody at all to carry the item?
export function namesAParty(text: string): boolean {
  return extractDeferredTo(text) !== null || PARTY_WORDS.test(text) || namedParty(text) !== null;
}

// Sheets name suppliers and specialists by initials or company name:
// "PPC ALUMINIUM CAPPING BY AMR TO MATCH PRINCIPLE TRIM". Common words that
// follow "by" on a drawing are not parties.
const NOT_A_PARTY = new Set([
  "OTHERS", "THE", "MAIN", "ALL", "THIS", "THAT", "HAND", "SITE", "DESIGN", "AREA",
  "PASS", "USING", "MEANS", "HAND.", "OTHER", "CLIENT", "TENANT", "LANDLORD",
]);

export function namedParty(text: string): string | null {
  // A full company name always wins over its initials.
  const company = text.match(COMPANY_NAME);
  if (company?.[1]) {
    const cleaned = cleanParty(trimToName(company[1]));
    if (cleaned) return cleaned;
  }
  const m = text.match(/\b(?:by|BY|By)\s+([A-Z][A-Z&.'-]{1,9})\b/);
  if (!m?.[1]) return null;
  const party = m[1].trim();
  if (party.split(/\s+/).some((w) => NOT_A_PARTY.has(w))) return null;
  if (PARTY_WORDS.test(party)) return null; // handled by the phrase parser
  return party;
}



export function isRedish(hex: string): boolean {
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r > 150 && g < 90 && b < 90;
}

// A merged notes block may still hold more than one note. The general notes
// list is numbered, so split on the note numbering first; sentence punctuation
// is only a fallback for a long unnumbered block.
export function splitNotes(text: string): string[] {
  const t = text.trim();

  const numbered = t.split(/\s(?=\d{1,2}[.)]\s)/).map((s) => s.trim()).filter(Boolean);
  if (numbered.length > 1 && numbered.filter((s) => /^\d{1,2}[.)]\s/.test(s)).length > 1) {
    return numbered.map((s) => s.replace(/^\d{1,2}[.)]\s*/, "").trim()).filter((s) => s.length >= 8);
  }

  if (t.length <= 400) return [t];

  const raw = t
    .split(/(?<=[.;])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // A full stop mid-annotation ("... CLADDING SPECIALIST. IN ABEYANCE") is not
  // a note boundary. Only treat a fragment as its own note if it reads like a
  // sentence in its own right; otherwise fold it back into the previous note.
  const parts: string[] = [];
  for (const p of raw) {
    const standalone = p.length >= 30 && p.split(/\s+/).length >= 5;
    if (!standalone && parts.length) parts[parts.length - 1] += ` ${p}`;
    else parts.push(p);
  }
  const kept = parts.filter((s) => s.length >= 8);
  return kept.length ? kept : [t];
}



/* ------------------------------------------------------------------ */
/* Boilerplate and the sheet's own author                              */
/* ------------------------------------------------------------------ */

// The category the seeded exclusion rows carry in deferral_patterns. They sit
// alongside the detection patterns so the list can be extended from data.
export const EXCLUSION_CATEGORY = "boilerplate_exclusion";

function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(ltd|limited|llp|plc|partners|partnership|architects?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// A drawing referring back to its own author is not a scope deferral.
export function isOriginatorParty(party: string | null, originator: string | null | undefined): boolean {
  if (!party || !originator) return false;
  const a = normaliseName(party);
  const b = normaliseName(originator);
  if (a.length < 3 || b.length < 3) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export type DetectOptions = {
  exclusions?: string[];
  originator?: string | null;
};

/* ------------------------------------------------------------------ */
/* Severity model — applied after pattern matching, on every path       */
/* ------------------------------------------------------------------ */

// The Scope Gap Bible grades anything touching fire compartmentation, means
// of escape, structural fire protection or another statutory requirement as
// high regardless of cost. That is a rule, not a judgement.
const LIFE_SAFETY = new RegExp(
  [
    "\\bfire\\b",
    "fire ?stopp?ing",
    "compartment",
    "means of escape",
    "\\bescape\\b",
    "\\brefuge\\b",
    "cavity barrier",
    "intumescent",
    "\\bsmoke\\b",
    "sprinkler",
    "fire alarm",
    "\\balarm\\b",
    "life safety",
    "accessib",
    "part ?[bm]\\b",
    "building reg",
    "fire strategy",
  ].join("|"),
  "i",
);

// One level up: long-lead and structural items, where a late answer costs
// programme as well as money.
const PROGRAMME_SENSITIVE = new RegExp(
  [
    "long ?lead",
    "lead ?time",
    "\\bprocurement\\b",
    "\\bbespoke\\b",
    "curtain wall",
    "\\bprecast\\b",
    "\\bstructural\\b",
    "structural steel",
    "transfer beam",
    "\\bcolumn\\b",
    "\\bfoundation\\b",
    "\\blift\\b",
    "escalator",
    "switchgear",
    "generator",
  ].join("|"),
  "i",
);

// Documentation tidy-up only: changes neither price nor method.
const TIDY_UP = new RegExp(
  ["supersed", "superceded", "\\bduplicate\\b", "for information only", "drawing removed"].join("|"),
  "i",
);

export type SeverityContext = { partyNamed: boolean; isRed: boolean; interfaceGuidance?: string | null };

export function applySeverityModel(
  base: Finding["severity"],
  text: string,
  context: SeverityContext,
): Finding["severity"] {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const subject = `${text} ${context.interfaceGuidance ?? ""}`;

  // Escalations to high come first and are absolute.
  if (LIFE_SAFETY.test(subject)) return "high";
  if (!context.partyNamed) return "high";
  if (context.isRed) return "high";

  // Documentation tidy-up drops to low, but only where nothing above applies.
  if (TIDY_UP.test(subject)) return "low";

  // Programme sensitivity moves it one level, never two.
  if (PROGRAMME_SENSITIVE.test(subject)) {
    return rank[base] > rank["high"] ? (base === "low" ? "medium" : "high") : base;
  }

  return base;
}


/* ------------------------------------------------------------------ */
/* Red is emphasis unless the words say hold                            */
/* ------------------------------------------------------------------ */

// Only these words make a note a hold. "No mechanical fixings between" is
// emphasis, not abeyance.
export const HOLD_LANGUAGE = new RegExp(
  [
    "abeyance",
    "on hold",
    "\\bhold\\b",
    "\\btbc\\b",
    "to be confirmed",
    "to be reviewed",
    "under review",
    "not for construction",
    "\\bnfc\\b",
    "pending (?:approval|review|instruction)",
    "awaiting (?:approval|instruction|confirmation)",
  ].join("|"),
  "i",
);

// A red note that is not a hold still says something. Classify it by content
// so it lands in the right place; the colour only lifts its severity.
export function classifyRedByContent(text: string, partyNamed: boolean): string {
  if (partyNamed) return "by_others";
  if (/\b(?:performance|design(?:ed)? by|specialist design|to achieve|in accordance with)\b/i.test(text))
    return "performance_req";
  if (/\b(?:movement|tolerance|clearance|between|interface|junction|no\s+(?:mechanical\s+)?fixing|high point|falls?)\b/i.test(text))
    return "scope_boundary";
  if (/\b(?:as required|to suit|as necessary|refer to|to be (?:agreed|advised))\b/i.test(text))
    return "design_deferral";
  return "scope_boundary";
}

/* ------------------------------------------------------------------ */
/* Party disclaimers — boilerplate on the sheet, a finding once            */
/* ------------------------------------------------------------------ */

// A subcontractor disclaiming responsibility for interfaces and coordination
// is a real finding, but it is printed on every one of their sheets. It is
// excluded from the per-sheet deferrals and surfaced once against the party.
const DISCLAIMER_LANGUAGE = new RegExp(
  [
    "produced to emphasise",
    "works only",
    "no responsibility (?:is )?(?:accepted|taken)",
    "accepts? no responsibility",
    "not responsible for",
    "excludes? (?:all )?(?:other )?(?:trades|works|interfaces)",
    "for (?:information|indicative) purposes only",
  ].join("|"),
  "i",
);

export type PartyDisclaimer = { party: string | null; text: string };

export function detectPartyDisclaimers(
  items: Array<{ item: MergedItem; region: Region }>,
  originator?: string | null,
): PartyDisclaimer[] {
  const out = new Map<string, PartyDisclaimer>();
  for (const { item, region } of items) {
    if (region === "titleblock") continue;
    const text = item.str.replace(/\s+/g, " ").trim();
    if (text.length < 20 || !DISCLAIMER_LANGUAGE.test(text)) continue;
    // A disclaimer belongs to whoever wrote it: the sheet's own author.
    const party = originator ?? namedParty(text) ?? extractDeferredTo(text);
    const key = text.toLowerCase();
    if (!out.has(key)) out.set(key, { party, text });
  }
  return [...out.values()];
}

export function detectDeferrals(


  items: Array<{ item: MergedItem; region: Region }>,
  patterns: DeferralPattern[],
  options: DetectOptions = {},
): Finding[] {
  const originator = options.originator ?? null;
  const exclusionRes: RegExp[] = [];
  for (const p of [...(options.exclusions ?? []), ...patterns.filter((p) => p.category === EXCLUSION_CATEGORY).map((p) => p.pattern)]) {
    try {
      exclusionRes.push(new RegExp(p, "i"));
    } catch {
      // an unusable pattern is skipped, never guessed at
    }
  }

  // Contractual boilerplate carries no scope meaning, and a sheet that only
  // states its author's name is naming nobody new.
  const excluded = (text: string): boolean => {
    if (exclusionRes.some((re) => re.test(text))) return true;
    if (originator && normaliseName(text) === normaliseName(originator)) return true;
    return false;
  };

  patterns = patterns.filter((p) => p.category !== EXCLUSION_CATEGORY);

  const compiled: Array<{ p: DeferralPattern; re: RegExp }> = [];
  for (const p of patterns) {
    try {
      compiled.push({ p, re: new RegExp(p.pattern, "i") });
    } catch {
      // an unusable pattern is skipped, never guessed at
    }
  }

  const findings: Finding[] = [];
  const seen = new Map<string, Finding>();
  const rank = { high: 0, medium: 1, low: 2 } as const;

  for (const { item, region } of items) {
    if (region === "titleblock") continue;
    const isRed = isRedish(item.colour);

    for (const text of splitNotes(item.str)) {
      if (text.length < 8 || excluded(text)) continue;
      const matches = compiled.filter(({ re }) => re.test(text));
      if (!matches.length) continue;

      const named = extractDeferredTo(text);
      const deferredTo = isOriginatorParty(named, originator) ? null : named;
      const partyNamed = deferredTo !== null || namesAParty(text);

      // One finding per source sentence, carrying the strongest classification.
      let best: { p: DeferralPattern; severity: Finding["severity"] } | null = null;
      const categories = new Set<string>();
      for (const { p } of matches) {
        categories.add(p.category);
        let severity = (p.default_severity as Finding["severity"]) ?? "medium";
        // Performance requirements and generic "refer to" pointers only reach
        // high when the note names nobody to carry them.
        const generic = p.category === "performance_req" || /\brefer to\b/i.test(text);
        if (generic && partyNamed && rank[severity] < rank["medium"]) severity = "medium";
        // The bible's severity model: life safety, no named party, programme
        // sensitivity and tidy-up all applied in one place.
        severity = applySeverityModel(severity, text, { partyNamed, isRed });
        if (!best || rank[severity] < rank[best.severity]) best = { p, severity };

      }
      if (!best) continue;

      const key = text.toLowerCase();
      if (seen.has(key)) continue;

      const finding: Finding = {
        raw_text: text,
        region,
        bbox: { x: item.x, y: item.y, w: item.width, h: item.height },
        colour: item.colour,
        font_size: item.fontSize,
        is_red: isRed,
        deferral_category: best.p.category,
        also_categories: [...categories].filter((c) => c !== best!.p.category),
        deferred_to: deferredTo,
        severity: best.severity,
        commercial_risk: best.p.commercial_risk,
        recommended_action: best.p.recommended_action,
        method: isRed ? "notes_pattern+colour" : "notes_pattern",
      };
      seen.set(key, finding);
      findings.push(finding);
    }
  }


  // A note that hands work to a named party ("... BY AMR ...") is a deferral
  // even where no pattern and no trade cue catches it.
  for (const { item, region } of items) {
    if (region === "titleblock") continue;
    for (const text of splitNotes(item.str)) {
      if (text.length < 8 || excluded(text)) continue;
      const named = namedParty(text);
      if (!named) continue;
      if (isOriginatorParty(named, originator)) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      const isRed = isRedish(item.colour);
      const finding: Finding = {
        raw_text: text,
        region,
        bbox: { x: item.x, y: item.y, w: item.width, h: item.height },
        colour: item.colour,
        font_size: item.fontSize,
        is_red: isRed,
        deferral_category: "by_others",
        also_categories: [],
        deferred_to: named,
        severity: applySeverityModel("medium", text, { partyNamed: true, isRed }),
        commercial_risk: null,
        recommended_action: `Confirm what ${named} is providing and where the boundary with the main contract sits.`,
        method: "named_party",
      };
      seen.set(key, finding);
      findings.push(finding);
    }
  }

  // Stage 4 — colour flag. Red is not a hold in itself: on one sheet it marks
  // an item in abeyance, on another it is simply emphasis. Red always
  // escalates severity; it only classifies as a hold where hold language is
  // actually present. Otherwise the note is classified by what it says.

  for (const { item, region } of items) {
    if (region === "titleblock") continue;
    const text = item.str.trim();
    if (text.length < 8 || !isRedish(item.colour) || excluded(text)) continue;
    if (findings.some((f) => text.includes(f.raw_text) || f.raw_text.includes(text))) continue;
    const named = isOriginatorParty(extractDeferredTo(text), originator)
      ? null
      : extractDeferredTo(text);
    const onHold = HOLD_LANGUAGE.test(text);
    findings.push({
      raw_text: text,
      region,
      bbox: { x: item.x, y: item.y, w: item.width, h: item.height },
      colour: item.colour,
      font_size: item.fontSize,
      is_red: true,
      deferral_category: onHold ? "hold_status" : classifyRedByContent(text, named !== null),
      also_categories: [],
      deferred_to: named,
      severity: "high",
      commercial_risk: null,
      recommended_action: onHold
        ? "Marked in red and on hold. Confirm the item is resolved and re-issued before it is relied upon."
        : "Highlighted in red on the drawing. Confirm who carries this requirement and that it is priced.",
      method: "colour",
    });
  }


  const order = { high: 0, medium: 1, low: 2 } as const;
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
