// Party normalisation for the register. Pure functions only, so the matching
// rules can be tested without a database.

export type PartyRecord = {
  id: string;
  canonical_name: string;
  normalised_name: string;
  party_type?: string;
};

// Unqualified terms defer to nobody: "BY SPECIALIST", "specialist subcontractor",
// "others". They must not create a party — the deferral stays party-less, which
// under the standing rule raises its severity to high. Only qualified forms
// ("cladding specialist", "fire specialist") become parties.
const GENERIC_PARTY_TERMS = new Set(["specialist", "specialist subcontractor", "others"]);

export function isGenericPartyTerm(raw: string): boolean {
  return GENERIC_PARTY_TERMS.has(normalisePartyName(raw));
}

// Wording-based type inference. A bare company name attached to a product is a
// supplier (Techrete, AMR); where the wording is unclear, leave it unknown.
export function inferPartyType(raw: string): string {
  const k = normalisePartyName(raw);
  if (!k) return "unknown";
  if (/\b(tenant|landlord|client|employer)\b/.test(k)) return "client_side";
  if (/\b(engineer|architect|surveyor|survey|designer|consultant|fire|acoustic)\b/.test(k))
    return "consultant";
  if (/\b(specialist|subcontractor|installer|contractor)\b/.test(k))
    return "specialist_subcontractor";
  if (k.split(" ").length <= 2) return "supplier";
  return "unknown";
}

const QUALIFIERS =
  /\b(?:the|a|an|appointed|nominated|agreed|relevant|proposed|main|principal|approved)\b/g;

const SUFFIXES = /\b(?:ltd|ltd\.|limited|llp|l\.l\.p\.|plc|inc|incorporated|co|company)\b/g;

// "specialist" is a party in its own right ("BY SPECIALIST") but an adjective
// in "specialist lighting designer" — only strip it when other words follow.
function stripAdjectivalSpecialist(s: string): string {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 1 && /^specialists?$/.test(words[0]!)) return words.slice(1).join(" ");
  return s;
}

export function normalisePartyName(raw: string): string {
  let s = raw.toLowerCase().replace(/[’']s\b/g, "");
  s = s.replace(/[^a-z0-9+&\s-]/g, " ");
  s = s.replace(QUALIFIERS, " ");
  s = s.replace(SUFFIXES, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = stripAdjectivalSpecialist(s);
  // Plain plurals collapse: "specialists" and "specialist" are one party.
  s = s
    .split(" ")
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
  return s.trim();
}

// A tidy display name: the longest wording seen for this party, trimmed.
export function displayName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

export type MatchResult =
  | { kind: "exact"; party: PartyRecord }
  | { kind: "uncertain"; party: PartyRecord }
  | { kind: "new" };

// Exact on the normalised form, otherwise a close-but-not-certain candidate is
// flagged for the user to merge. Nothing is ever merged automatically.
export function matchParty(
  raw: string,
  existing: PartyRecord[],
  aliases: Array<{ normalised_alias: string; party_id: string }> = [],
): MatchResult {
  const key = normalisePartyName(raw);
  if (!key) return { kind: "new" };

  const byAlias = aliases.find((a) => a.normalised_alias === key);
  if (byAlias) {
    const party = existing.find((p) => p.id === byAlias.party_id);
    if (party) return { kind: "exact", party };
  }

  const exact = existing.find((p) => p.normalised_name === key);
  if (exact) return { kind: "exact", party: exact };

  for (const p of existing) {
    const other = p.normalised_name;
    const contains =
      (key.includes(other) || other.includes(key)) && Math.min(key.length, other.length) >= 4;
    const close = Math.abs(key.length - other.length) <= 3 && editDistance(key, other) <= 2;
    if (contains || close) return { kind: "uncertain", party: p };
  }

  return { kind: "new" };
}

export type PartyGroupInput = {
  item_id: string;
  party_id: string;
  drawing_id: string;
  originator: string | null;
};

export type PartyGroup = {
  party_id: string;
  item_ids: string[];
  drawing_ids: string[];
  originators: string[];
};

// A party named on two or more drawings is a corroboration: the same party is
// carrying scope across the set, not just on one sheet.
export function groupByParty(rows: PartyGroupInput[]): PartyGroup[] {
  const byParty = new Map<string, PartyGroup>();
  for (const r of rows) {
    const g =
      byParty.get(r.party_id) ??
      { party_id: r.party_id, item_ids: [], drawing_ids: [], originators: [] };
    g.item_ids.push(r.item_id);
    if (!g.drawing_ids.includes(r.drawing_id)) g.drawing_ids.push(r.drawing_id);
    if (r.originator && !g.originators.includes(r.originator)) g.originators.push(r.originator);
    byParty.set(r.party_id, g);
  }
  return [...byParty.values()].filter((g) => g.drawing_ids.length >= 2);
}

export function corroborationSeverity(
  group: PartyGroup,
  appointed: string,
): "high" | "medium" | "low" {
  if (group.originators.length >= 2) return "high";
  if (appointed !== "yes") return "high";
  if (group.drawing_ids.length >= 2) return "medium";
  return "low";
}

export type PartyEvidence = {
  drawing_number: string | null;
  revision: string | null;
  originator: string | null;
  text: string;
};

// Templated narrative only — deterministic, and it cannot fabricate.
export function partyNarrative(
  canonicalName: string,
  appointed: string,
  drawingCount: number,
  originators: string[],
  evidence: PartyEvidence[],
): string {
  const m = originators.length;
  const appointmentLine =
    appointed === "yes"
      ? "This party is appointed."
      : appointed === "no"
        ? "This party is not appointed."
        : "Appointment status is not recorded.";
  const lines = evidence.map((e) => {
    const sheet = [e.drawing_number, e.revision ? `Rev ${e.revision}` : null]
      .filter(Boolean)
      .join(" ");
    const by = e.originator ? ` (${e.originator})` : "";
    return `  • ${sheet}${by} — “${e.text}”`;
  });
  return [
    `${canonicalName} carries deferred scope on ${drawingCount} drawing${drawingCount === 1 ? "" : "s"} from ${m} originator${m === 1 ? "" : "s"}.`,
    appointmentLine,
    "",
    "Deferred on:",
    ...lines,
    "",
    "Confirm this party is appointed and that their scope covers every item above.",
  ].join("\n");
}
