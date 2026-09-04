// Single source of truth for every status / enum-style vocabulary in ScopeGuard.
// The database check constraints are generated from these exact lists
// (see the "align status vocabularies" migration). Never write a literal
// status string anywhere else — import from here so the two cannot drift.

export const DRAWING_STATUSES = ["queued", "reading", "complete", "failed"] as const;
export type DrawingStatus = (typeof DRAWING_STATUSES)[number];

export const TRIAGE_CLASSES = [
  "annotation_rich",
  "notes_only",
  "graphical_only",
  "unreadable",
] as const;
export type TriageClassName = (typeof TRIAGE_CLASSES)[number];

export const ITEM_TYPES = ["body", "note", "deferral"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const COVERAGE_STATUSES = ["present", "expected_missing", "not_applicable"] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export const ALLOCATION_STATUSES = ["allocated", "ambiguous", "unallocated"] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export const PREFIX_SCOPES = ["global", "project"] as const;
export type PrefixScope = (typeof PREFIX_SCOPES)[number];

export const DRAWING_STATUS_LABELS: Record<DrawingStatus, string> = {
  queued: "Queued",
  reading: "Reading",
  complete: "Read",
  failed: "Failed",
};
