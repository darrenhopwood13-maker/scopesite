// Topic corroborations (Phase 3 step 3) and their narrative (step 4).
// Runs immediately after the party register, in the same read pass, so one
// read produces both axes.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  groupByTopic,
  topicNarrative,
  topicSummary,
  TOPIC_SEEDS,
  type TopicDef,
  type TopicItem,
} from "./topics";

type Stamp = { project_id: string; owner_id: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, "public", any>;

function fingerprint(topicName: string, drawingIds: string[]): string {
  const sorted = [...drawingIds].sort().join(",");
  return createHash("sha256").update(`topic|${topicName}|${sorted}`).digest("hex");
}

/** Seeded topics from the database, falling back to the mirrored list in code. */
export async function loadTopics(db: Db): Promise<TopicDef[]> {
  const { data, error } = await db
    .from("corroboration_topics")
    .select("name, keywords, severity, require_any");
  if (error || !data || !data.length) return TOPIC_SEEDS;
  return (
    data as Array<{ name: string; keywords: string[]; severity: string; require_any?: string[] }>
  ).map((t) => ({
    name: t.name,
    keywords: t.keywords ?? [],
    requireAny: t.require_any ?? [],
    severity: (t.severity === "medium" || t.severity === "low" ? t.severity : "high") as TopicDef["severity"],
  }));

}

/** Every deferral and every interface finding in the project, in match shape. */
export async function loadTopicItems(db: Db, projectId: string): Promise<TopicItem[]> {
  const { data } = await db
    .from("drawing_items")
    .select(
      "id, drawing_id, raw_text, item_type, interface_rule_id, drawings!inner(drawing_number, revision, originator)",
    )
    .eq("project_id", projectId);

  type Row = {
    id: string;
    drawing_id: string;
    raw_text: string;
    item_type: string;
    interface_rule_id: string | null;
    drawings: { drawing_number: string | null; revision: string | null; originator: string | null } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.item_type === "deferral" || r.interface_rule_id)
    .map((r) => ({
      item_id: r.id,
      drawing_id: r.drawing_id,
      drawing_number: r.drawings?.drawing_number ?? null,
      revision: r.drawings?.revision ?? null,
      originator: r.drawings?.originator ?? null,
      raw_text: r.raw_text,
      is_deferral: r.item_type === "deferral",
    }));
}

export async function rebuildTopicCorroborations(client: unknown, stamp: Stamp): Promise<void> {
  const db = client as Db;

  const [topics, items] = await Promise.all([loadTopics(db), loadTopicItems(db, stamp.project_id)]);
  const groups = groupByTopic(items, topics);

  // Fingerprinted records: a re-read updates last_seen_at rather than
  // duplicating, and resolved / dismissed decisions survive a re-read.
  const { data: existingRows } = await db
    .from("corroborations")
    .select("id, fingerprint, status")
    .eq("project_id", stamp.project_id)
    .eq("kind", "topic");
  const existing = new Map(
    ((existingRows ?? []) as Array<{ id: string; fingerprint: string | null; status: string }>)
      .filter((c) => c.fingerprint)
      .map((c) => [c.fingerprint as string, c]),
  );
  const seen = new Set<string>();

  for (const g of groups) {
    const fp = fingerprint(g.topic.name, g.drawing_ids);
    seen.add(fp);

    const payload = {
      ...stamp,
      kind: "topic",
      group_type: "topic",
      party_id: null,
      topic: g.topic.name,
      severity: g.severity,
      narrative: topicNarrative(g),
      summary: topicSummary(g),
      item_ids: g.item_ids,
      drawing_ids: g.drawing_ids,
      originators: g.originators,
      drawing_count: g.drawing_ids.length,
      originator_count: g.originators.length,
      fingerprint: fp,
      last_seen_at: new Date().toISOString(),
    };

    const prior = existing.get(fp);
    let corrId: string | null = null;
    if (prior) {
      // Status and resolved_note are the user's decisions — never overwritten.
      const { data: updated } = await db
        .from("corroborations")
        .update(payload)
        .eq("id", prior.id)
        .select("id")
        .maybeSingle();
      corrId = (updated as { id: string } | null)?.id ?? prior.id;
      await db.from("corroboration_items").delete().eq("corroboration_id", corrId);
    } else {
      const { data: corr } = await db
        .from("corroborations")
        .insert({ ...payload, status: "open" })
        .select("id")
        .maybeSingle();
      corrId = (corr as { id: string } | null)?.id ?? null;
    }
    if (!corrId) continue;

    const uniqueItems = [...new Set(g.item_ids)];
    if (uniqueItems.length) {
      await db
        .from("corroboration_items")
        .insert(uniqueItems.map((itemId) => ({ ...stamp, corroboration_id: corrId, item_id: itemId })));
    }
  }

  // Open records for groups that no longer exist are stale; remove them.
  // Resolved and dismissed records are kept as the user's record. The party
  // axis is untouched — only kind = 'topic' was loaded.
  const stale = [...existing.entries()].filter(([fp, c]) => !seen.has(fp) && c.status === "open");
  for (const [, c] of stale) {
    await db.from("corroborations").delete().eq("id", c.id);
  }
}
