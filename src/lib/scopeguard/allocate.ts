// Stages 5-7 of the reading pipeline: system code match, cue scoring,
// interface rules. Pure functions — no database, no network. Runs inside the
// same reading step as extraction so "Read again" re-reads and re-allocates
// in one pass.
import { ALLOCATION_STATUSES } from "./vocab";

export type TradeCue = { trade_code: string; cue: string; weight: number };
export type CodePrefix = { prefix: string; trade_code: string | null };
export type InterfaceRule = {
  id: string;
  name: string | null;
  trigger_terms: string[];
  context_terms: string[];
  trade_codes: string[];
  severity: string;
  guidance: string | null;
};

export type AllocationStatusName = (typeof ALLOCATION_STATUSES)[number];

export type Allocation = {
  allocation_status: AllocationStatusName;
  allocated_trade_code: string | null;
  candidate_trades: Array<{ trade_code: string; score: number }>;
  confidence: number | null;
  system_code: string | null;
  unknown_prefix: string | null;
  interface_rule_id: string | null;
  interface_guidance: string | null;
  allocation_method: "system_code" | "cue" | "interface_rule" | "none";
};

const CODE_TOKEN = /\b([A-Z]{2,4})[-\s]?(\d{2,4})\b/g;

/** Codes such as "EWS-01" or "FPS 210" seen in the text, with their prefix. */
export function findSystemCodes(text: string): Array<{ code: string; prefix: string }> {
  const out: Array<{ code: string; prefix: string }> = [];
  for (const m of text.matchAll(CODE_TOKEN)) {
    out.push({ code: `${m[1]}-${m[2]}`, prefix: m[1]! });
  }
  return out;
}

function scoreCues(text: string, cues: TradeCue[]): Map<string, number> {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const scores = new Map<string, number>();
  for (const c of cues) {
    const needle = ` ${c.cue.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
    if (needle.trim().length < 3) continue;
    // Sheets write "barriers" where the cue says "barrier".
    const variants = [needle, `${needle.trimEnd()}s `, `${needle.trimEnd()}es `];
    if (!variants.some((v) => hay.includes(v))) continue;
    scores.set(c.trade_code, (scores.get(c.trade_code) ?? 0) + Number(c.weight ?? 1));
  }
  return scores;
}

function matchRule(text: string, sheetContext: string, rules: InterfaceRule[]): InterfaceRule | null {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  // The junction condition is a property of the sheet, not of one line of
  // text: an upstand on a facade detail is the facade junction whether or not
  // the word "facade" appears in that particular annotation. The trigger must
  // be in the item; the context may come from anywhere on the sheet.
  const context = ` ${sheetContext.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const norm = (term: string) => ` ${term.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  // Tolerate a simple plural: sheets write "upstands" where the rule says "upstand".
  const forms = (term: string) => {
    const n = norm(term);
    return [n, `${n.trimEnd()}s `, `${n.trimEnd()}es `];
  };
  const inItem = (term: string) => forms(term).some((f) => hay.includes(f));
  const inSheet = (term: string) => forms(term).some((f) => context.includes(f));
  for (const r of rules) {
    if (!r.trigger_terms?.some(inItem)) continue;
    if (r.context_terms?.length && !r.context_terms.some((t) => inItem(t) || inSheet(t))) continue;
    return r;
  }
  return null;
}

export function allocate(
  text: string,
  reference: { cues: TradeCue[]; prefixes: CodePrefix[]; rules: InterfaceRule[]; sheetContext?: string },
): Allocation {
  const base: Allocation = {
    allocation_status: "unallocated",
    allocated_trade_code: null,
    candidate_trades: [],
    confidence: null,
    system_code: null,
    unknown_prefix: null,
    interface_rule_id: null,
    interface_guidance: null,
    allocation_method: "none",
  };

  const known = new Map(reference.prefixes.map((p) => [p.prefix.toUpperCase(), p.trade_code]));
  const codes = findSystemCodes(text);
  const matchedCode = codes.find((c) => known.get(c.prefix.toUpperCase()));
  const unknownCode = codes.find((c) => !known.has(c.prefix.toUpperCase()));
  base.system_code = matchedCode?.code ?? unknownCode?.code ?? null;
  base.unknown_prefix = matchedCode ? null : (unknownCode?.prefix ?? null);

  const scores = [...scoreCues(text, reference.cues)]
    .map(([trade_code, score]) => ({ trade_code, score: Math.round(score * 100) / 100 }))
    .sort((a, b) => b.score - a.score);

  // An interface rule always overrides a confident single allocation, but only
  // where the item itself shows work belonging to one of the rule's trades —
  // otherwise a stray trigger word turns an unrelated note into a junction.
  const rulesInPlay = reference.rules.filter((r) =>
    r.trade_codes?.some((t) => scores.some((s) => s.trade_code === t && s.score > 0)),
  );
  const rule = matchRule(text, reference.sheetContext ?? "", rulesInPlay);
  if (rule) {
    return {
      ...base,
      allocation_status: "ambiguous",
      allocated_trade_code: null,
      candidate_trades: rule.trade_codes.map((trade_code) => ({
        trade_code,
        score: scores.find((s) => s.trade_code === trade_code)?.score ?? 0,
      })),
      confidence: null,
      interface_rule_id: rule.id,
      interface_guidance: rule.guidance,
      allocation_method: "interface_rule",
    };
  }

  if (matchedCode) {
    const trade = known.get(matchedCode.prefix.toUpperCase())!;
    return {
      ...base,
      allocation_status: "allocated",
      allocated_trade_code: trade,
      candidate_trades: [{ trade_code: trade, score: 1 }, ...scores.filter((s) => s.trade_code !== trade).slice(0, 2)],
      confidence: 0.95,
      allocation_method: "system_code",
    };
  }

  const top = scores[0];
  if (!top) return base;
  const second = scores[1];
  const clear = top.score >= 0.8 && (!second || top.score - second.score >= 0.4);

  if (clear) {
    return {
      ...base,
      allocation_status: "allocated",
      allocated_trade_code: top.trade_code,
      candidate_trades: scores.slice(0, 3),
      confidence: Math.min(0.9, 0.5 + top.score / 4),
      allocation_method: "cue",
    };
  }

  return {
    ...base,
    allocation_status: "ambiguous",
    candidate_trades: scores.slice(0, 3),
    confidence: Math.min(0.6, top.score / 2),
    allocation_method: "cue",
  };
}
