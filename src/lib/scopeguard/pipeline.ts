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
  deferred_to: string | null;
  severity: "high" | "medium" | "low";
  commercial_risk: string | null;
  recommended_action: string | null;
  method: string;
};

/* ------------------------------------------------------------------ */
/* Stage 1 — line merging                                              */
/* ------------------------------------------------------------------ */

// Horizontal: same baseline, gap under 2pt. Recovers split system codes.
export function mergeHorizontal(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: Span[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev.y - s.y) <= 0.5 &&
      Math.abs(prev.fontSize - s.fontSize) <= 0.3 &&
      prev.colour === s.colour &&
      s.x >= prev.x &&
      s.x - (prev.x + prev.width) < 2
    ) {
      const gap = s.x - (prev.x + prev.width);
      prev.str = prev.str + (gap > 0.6 && !prev.str.endsWith(" ") ? " " : "") + s.str;
      prev.width = s.x + s.width - prev.x;
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

// Vertical: left edges within 3pt, gap 0-6pt, font size within 0.3pt, same colour.
export function mergeVertical(spans: Span[]): MergedItem[] {
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
];

export function isAnnotationOnly(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return true;
  if (!/[a-z]{3}/i.test(t)) return true; // nothing word-like in it
  return ANNOTATION_ONLY.some((re) => re.test(t));
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

export function parseTitleblock(lines: TbLine[]): Titleblock {
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
  const numText = (numLabel ?? joined).replace(/(?<=[A-Z0-9])[ ]+(?=[A-Z0-9-])/g, "");
  const num = numText.match(DRAWING_NUMBER);
  if (num) tb.drawing_number = num[0].replace(/^-|-$/g, "");

  const revValue = valueUnder(clean, /^rev(?:ision|\.)?$/i);
  const rev =
    revValue?.match(/^(P\d{2}|C\d{2}|[A-Z]?\d{1,2})$/i) ??
    joined.match(/\brev(?:ision)?\.?\s*[:\-]?\s*(P\d{2}|C\d{2}|[A-Z]?\d{1,2})\b/i) ??
    joined.match(/\b(P\d{2})\b/);
  if (rev?.[1]) tb.revision = rev[1].toUpperCase();

  const dateValue =
    valueUnder(clean, /^date$/i) ?? valueUnder(clean, /first issue date/i);
  const date = (dateValue ?? joined).match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/);
  if (date?.[1]) tb.drawing_date = date[1];

  const scaleValue = valueUnder(clean, /^scale\b.*$/i);
  tb.drawing_scale = scaleValue ?? joined.match(/\b1\s*[:/]\s*\d{1,4}(?:\s*@\s*A\d)?/i)?.[0] ?? null;

  const statusValue =
    valueUnder(clean, /^(purpose of issue|status|suitability)$/i) ??
    joined.match(/\b(S[0-7]|A[1-5])\s*[-–]\s*[A-Za-z ]{3,40}/)?.[0] ??
    joined.match(STATUS_CODE)?.[0] ??
    null;
  if (statusValue) tb.issue_status = statusValue.trim();

  tb.drawing_client = valueUnder(clean, /^(client|employer)$/i);
  tb.title = valueUnder(clean, /^(title|drawing title)$/i);

  const orig = joined.match(/\b(Foster\s?\+\s?Partners|Veretec)\b/i);
  if (orig) {
    tb.originator = orig[0];
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

const PARTY_AFTER =
  /(?:reviewed with|review by|confirmed by|designed by|determined by|defined by|provided by|by|with|to)\s+((?:the\s+)?(?:appointed\s+|nominated\s+|specialist\s+)?[A-Za-z'&/+ -]{4,60}?)(?:\.|,|;|$)/i;

export function extractDeferredTo(text: string): string | null {
  if (/\bby others\b/i.test(text)) return null;
  const m = text.match(PARTY_AFTER);
  if (!m?.[1]) return null;
  const party = m[1].trim().replace(/\s+/g, " ");
  if (party.length < 4) return null;
  if (
    !/(specialist|consultant|architect|engineer|designer|contractor|tenant|landlord|client|employer|manufacturer|supplier|authority|surveyor)/i.test(
      party,
    )
  )
    return null;
  return party;
}

export function isRedish(hex: string): boolean {
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r > 150 && g < 90 && b < 90;
}

export function detectDeferrals(
  items: Array<{ item: MergedItem; region: Region }>,
  patterns: DeferralPattern[],
): Finding[] {
  const compiled: Array<{ p: DeferralPattern; re: RegExp }> = [];
  for (const p of patterns) {
    try {
      compiled.push({ p, re: new RegExp(p.pattern, "i") });
    } catch {
      // an unusable pattern is skipped, never guessed at
    }
  }

  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const { item, region } of items) {
    if (region === "titleblock") continue;
    const text = item.str.trim();
    if (text.length < 8) continue;
    const isRed = isRedish(item.colour);

    for (const { p, re } of compiled) {
      if (!re.test(text)) continue;
      const key = `${p.category}::${text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const deferredTo = extractDeferredTo(text);
      let severity = (p.default_severity as Finding["severity"]) ?? "medium";
      if (!deferredTo) severity = "high";
      if (isRed) severity = "high";

      findings.push({
        raw_text: text,
        region,
        bbox: { x: item.x, y: item.y, w: item.width, h: item.height },
        colour: item.colour,
        font_size: item.fontSize,
        is_red: isRed,
        deferral_category: p.category,
        deferred_to: deferredTo,
        severity,
        commercial_risk: p.commercial_risk,
        recommended_action: p.recommended_action,
        method: isRed ? "notes_pattern+colour" : "notes_pattern",
      });
    }
  }

  // Stage 4 — colour flag: red text no pattern caught is still a hold.
  for (const { item, region } of items) {
    if (region === "titleblock") continue;
    const text = item.str.trim();
    if (text.length < 8 || !isRedish(item.colour)) continue;
    if (findings.some((f) => f.raw_text === text)) continue;
    findings.push({
      raw_text: text,
      region,
      bbox: { x: item.x, y: item.y, w: item.width, h: item.height },
      colour: item.colour,
      font_size: item.fontSize,
      is_red: true,
      deferral_category: "hold_status",
      deferred_to: extractDeferredTo(text),
      severity: "high",
      commercial_risk: null,
      recommended_action:
        "Marked in red on the drawing. Confirm the item is resolved and re-issued before it is relied upon.",
      method: "colour",
    });
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
