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

/* ---------------------------------------------------------------- */
/* Term matching                                                      */
/* ---------------------------------------------------------------- */

const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/** True when a and b differ by at most one insertion, deletion or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (s.length === l.length) i++;
    j++;
  }
  return true;
}

// Typos in hand-written annotations are normal ("DEFELECTION HEAD"), so a word
// over six characters may be one edit out. Simple plurals are tolerated too.
function wordMatches(sheetWord: string, cueWord: string): boolean {
  if (sheetWord === cueWord) return true;
  if (sheetWord === `${cueWord}s` || sheetWord === `${cueWord}es`) return true;
  if (cueWord.length > 6 && withinOneEdit(sheetWord, cueWord)) return true;
  return false;
}

/** Does the text contain this term, allowing plurals and single-character typos? */
export function containsTerm(hayWords: string[], term: string): boolean {
  const tw = words(term);
  if (!tw.length) return false;
  for (let i = 0; i + tw.length <= hayWords.length; i++) {
    if (tw.every((t, j) => wordMatches(hayWords[i + j]!, t))) return true;
  }
  return false;
}

function scoreCues(text: string, cues: TradeCue[]): Map<string, number> {
  const hay = words(text);
  const scores = new Map<string, number>();
  for (const c of cues) {
    if (c.cue.trim().length < 3) continue;
    if (!containsTerm(hay, c.cue)) continue;
    scores.set(c.trade_code, (scores.get(c.trade_code) ?? 0) + Number(c.weight ?? 1));
  }
  return scores;
}

// Some triggers are ordinary construction words that appear all over a facade
// sheet ("metal angle" on a waterproofing termination). They only count as a
// junction trigger where the item itself also says what they belong to.
const LOOSE_TRIGGERS: Record<string, string[]> = {
  "metal angle": ["facade", "cladding", "curtain wall", "rainscreen"],
  "ms framing": ["facade", "cladding", "curtain wall", "rainscreen"],
  unistrut: ["facade", "cladding", "curtain wall", "rainscreen"],
};

type RuleMatch = { rule: InterfaceRule; strength: number };

function matchRules(text: string, sheetContext: string, rules: InterfaceRule[]): RuleMatch[] {
  // The junction condition is a property of the sheet, not of one line of
  // text: an upstand on a facade detail is the facade junction whether or not
  // the word "facade" appears in that particular annotation. The trigger must
  // be in the item; the context may come from anywhere on the sheet.
  const hay = words(text);
  const context = words(sheetContext);
  const inItem = (term: string) => containsTerm(hay, term);
  const inSheet = (term: string) => containsTerm(context, term);
  const triggers = (r: InterfaceRule) =>
    (r.trigger_terms ?? []).filter((t) => {
      if (!inItem(t)) return false;
      const needs = LOOSE_TRIGGERS[t.toLowerCase()];
      return !needs || needs.some(inItem);
    });

  const out: RuleMatch[] = [];
  for (const r of rules) {
    const hits = triggers(r);
    if (!hits.length) continue;
    const ctx = (r.context_terms ?? []).filter((t) => inItem(t) || inSheet(t));
    if (r.context_terms?.length && !ctx.length) continue;
    // More matched terms means the rule fits this item more closely; matches
    // in the item itself count for more than matches elsewhere on the sheet.
    const itemCtx = ctx.filter(inItem).length;
    out.push({ rule: r, strength: hits.length * 2 + itemCtx + (ctx.length - itemCtx) * 0.25 });
  }
  return out.sort((a, b) => b.strength - a.strength);
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

  // An interface rule always overrides a confident single allocation, and is
  // tested against every item on its own trigger and context terms — an item
  // that scored no cue at all can still be a junction. Where two rules fit
  // equally well the item is more contested, not less: both are shown and
  // their trades are pooled.
  const matches = matchRules(text, reference.sheetContext ?? "", reference.rules);

  if (matches.length) {
    const best = matches[0]!.strength;
    const winners = matches.filter((m) => m.strength === best);
    const tradeCodes = [...new Set(winners.flatMap((m) => m.rule.trade_codes ?? []))];
    const guidance = winners
      .map((m) => m.rule.guidance)
      .filter((g): g is string => Boolean(g))
      .join(" ");
    return {
      ...base,
      allocation_status: "ambiguous",
      allocated_trade_code: null,
      candidate_trades: tradeCodes.map((trade_code) => ({
        trade_code,
        score: scores.find((s) => s.trade_code === trade_code)?.score ?? 0,
      })),
      confidence: null,
      interface_rule_id: winners[0]!.rule.id,
      interface_guidance: guidance || null,
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
    // A contested row with no action is a dead end, so a score tie says what
    // to do even where no interface rule applies.
    interface_guidance: "Two or more trades score equally on this item. Confirm which package carries it.",
    allocation_method: "cue",

  };
}
