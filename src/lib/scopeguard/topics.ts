// Phase 3 steps 3 and 4 — topic definitions, topic grouping and the topic
// narrative. Pure functions only, so the matching rules and the wording can be
// checked without a database.
//
// The eight topics are seeded in db/phase3-topics.sql. The same list lives here
// so grouping still works before that file has been run; the seed and this list
// must stay identical.

export type TopicSeverity = "high" | "medium" | "low";

export type TopicDef = {
  name: string;
  keywords: string[];
  severity: TopicSeverity;
  /**
   * When present, a text only matches the topic if it also contains one of
   * these terms. Stops broad context words (facade, cladding, panel) from
   * pulling in findings that are really about something else.
   */
  requireAny?: string[];
};

const FIRE_TERMS = [
  "fire",
  "compartment",
  "cavity barrier",
  "fire stopping",
  "encasement",
  "fire seal",
  "siderise",
  "promat",
  "sfs",
];

export const TOPIC_SEEDS: TopicDef[] = [
  {
    name: "Façade / fire interface",
    keywords: [
      "fire",
      "fire protection",
      "fire stopping",
      "cavity barrier",
      "compartment",
      "facade",
      "façade",
      "cladding",
      "sfs",
      "encasement",
      "fire seal",
      "siderise",
      "promat",
      "precast",
      "brick-faced",
      "brick faced",
      "techrete",
      "rainscreen",
      "panel",
      "capping",
      "cassette",
    ],
    requireAny: FIRE_TERMS,
    severity: "high",
  },
  {
    name: "Party wall and boundary",
    keywords: [
      "party wall",
      "flank wall",
      "boundary",
      "adjoining",
      "existing brickwork",
      "site boundary",
    ],
    severity: "high",
  },
  {
    name: "Tenant fit-out boundary",
    keywords: [
      "tenant",
      "fit out",
      "fit-out",
      "demarcation",
      "base build",
      "category a",
      "landlord",
    ],
    severity: "high",
  },
  {
    name: "Structural design responsibility",
    keywords: [
      "str eng",
      "structural engineer",
      "secondary steel",
      "support steel",
      "structural design",
    ],
    severity: "high",
  },
  {
    name: "MEP coordination",
    keywords: ["mep", "m&e", "services", "riser", "containment", "builders work"],
    severity: "medium",
  },
  {
    name: "Security and access control",
    keywords: ["security", "access control", "cctv", "door contact", "maglock"],
    severity: "medium",
  },
  {
    name: "Lighting design",
    keywords: ["lighting", "luminaire", "lighting designer"],
    severity: "medium",
  },
  {
    name: "Waterproofing continuity",
    keywords: [
      "waterproofing",
      "upstand",
      "epdm",
      "pmma",
      "gutter",
      "flashing",
      "dpc",
      "cavity tray",
      "membrane",
      "bauder",
      "single ply",
      "single-ply",
      "falls",
      "tapered insulation",
      "roof outlet",
      "rainwater outlet",
      "vapour barrier",
      "vcl",
      "avcl",
      "sarking",
      "gutter support",
      "weathering",
      "sealant compatibility",
    ],
    severity: "high",
  },
  {
    name: "Site verification and existing conditions",
    keywords: [
      "to be confirmed on site",
      "to confirm on site",
      "adapted to suit site conditions",
      "as built",
      "as-built survey",
      "indicative only",
      "assumed position",
      "verify on site",
    ],
    severity: "high",
  },
];


// Accent- and case-insensitive. "façade" and "facade" are the same word, and a
// keyword only ever matches on whole words, never inside a longer unrelated one.
export function normaliseForMatch(text: string): string {
  return ` ${text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, " ")
    .trim()} `;
}

export function matchedKeywords(text: string, keywords: string[]): string[] {
  const hay = normaliseForMatch(text);
  return keywords.filter((k) => {
    const needle = normaliseForMatch(k);
    return needle.trim().length > 0 && hay.includes(needle);
  });
}

export function matchesTopic(text: string, topic: TopicDef): boolean {
  if (matchedKeywords(text, topic.keywords).length === 0) return false;
  if (topic.requireAny && topic.requireAny.length > 0) {
    return matchedKeywords(text, topic.requireAny).length > 0;
  }
  return true;
}

export type TopicItem = {
  item_id: string;
  drawing_id: string;
  drawing_number: string | null;
  revision: string | null;
  originator: string | null;
  raw_text: string;
  /** true for deferrals, false for findings where an interface rule fired */
  is_deferral: boolean;
};

export type TopicGroup = {
  topic: TopicDef;
  severity: TopicSeverity;
  drawing_ids: string[];
  originators: string[];
  /** the deferrals that raised the topic */
  evidence: TopicItem[];
  /** contested interface findings on the same topic, on the same drawings */
  related: TopicItem[];
  item_ids: string[];
};

/**
 * A drawing joins a topic when a deferral on it matches. Interface findings
 * never raise a topic on their own — they are corroborating detail attached to
 * a topic already deferred on that same sheet. A group is only raised where it
 * spans two or more drawings.
 */
export function groupByTopic(items: TopicItem[], topics: TopicDef[] = TOPIC_SEEDS): TopicGroup[] {
  const groups: TopicGroup[] = [];

  for (const topic of topics) {
    const evidence = items.filter((i) => i.is_deferral && matchesTopic(i.raw_text, topic));
    const drawingIds = [...new Set(evidence.map((e) => e.drawing_id))].sort();
    if (drawingIds.length < 2) continue;

    const related = items.filter(
      (i) => !i.is_deferral && drawingIds.includes(i.drawing_id) && matchesTopic(i.raw_text, topic),
    );
    // A sheet with no recorded originator is not counted as one: it must never
    // inflate the count that drives escalation to high.
    const originators = [
      ...new Set(evidence.map((e) => e.originator).filter((o): o is string => !!o)),
    ];

    groups.push({
      topic,
      severity: originators.length >= 2 ? "high" : topic.severity,
      drawing_ids: drawingIds,
      originators,
      evidence,
      related,
      item_ids: [...evidence.map((e) => e.item_id), ...related.map((r) => r.item_id)],
    });
  }

  return groups;
}

/** Deferrals no topic claimed — the misses, which are otherwise invisible. */
export function unmatchedDeferrals(
  items: TopicItem[],
  topics: TopicDef[] = TOPIC_SEEDS,
): TopicItem[] {
  return items.filter((i) => i.is_deferral && !topics.some((t) => matchesTopic(i.raw_text, t)));
}

function sheet(i: TopicItem): string {
  return [i.drawing_number ?? "Unknown drawing", i.revision ? `Rev ${i.revision}` : null]
    .filter(Boolean)
    .join(" ");
}

export function relatedFindingsLine(related: TopicItem[]): string | null {
  if (!related.length) return null;
  const byDrawing = new Map<string, string[]>();
  for (const r of related) {
    const key = r.drawing_number ?? "Unknown drawing";
    byDrawing.set(key, [...(byDrawing.get(key) ?? []), r.raw_text]);
  }
  return [...byDrawing.entries()]
    .map(([drawing, texts]) => `Related contested items on ${drawing}: ${texts.join(", ")}.`)
    .join("\n");
}

// Templated narrative only — deterministic, and it cannot fabricate. Severity
// is stated in the text itself, so a printed card says it is high without
// depending on a badge somewhere else.
export function topicNarrative(group: TopicGroup): string {
  const n = group.drawing_ids.length;
  const m = group.originators.length;
  const lines = group.evidence.map((e) => {
    const who = e.originator ?? "An unidentified originator";
    return `  • ${who} defers this on ${sheet(e)}: “${e.raw_text}”`;
  });
  const related = relatedFindingsLine(group.related);
  return [
    `${group.topic.name} is left open across ${n} drawing${n === 1 ? "" : "s"} from ${m} originator${m === 1 ? "" : "s"}.`,
    `Severity: ${group.severity}${m >= 2 ? " — the same interface is left open by two or more originators." : "."}`,
    "",
    ...lines,
    ...(related ? ["", related] : []),
    "",
    "No package currently owns this scope.",
  ].join("\n");
}

export function topicSummary(group: TopicGroup): string {
  const n = group.drawing_ids.length;
  const m = group.originators.length;
  return `${group.topic.name} — ${group.severity} severity, open on ${n} drawing${n === 1 ? "" : "s"} from ${m} originator${m === 1 ? "" : "s"}.`;
}
