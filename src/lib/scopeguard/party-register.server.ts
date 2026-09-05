// Party register (Phase 3 step 1) and party corroborations (step 2).
// Called at the end of a successful read, inside the same pass.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  corroborationSeverity,
  displayName,
  groupByParty,
  inferPartyType,
  isGenericPartyTerm,
  isPartyNameLike,
  matchParty,
  normalisePartyName,
  partyNarrative,
  titleCaseName,
  type PartyEvidence,
  type PartyGroupInput,
  type PartyRecord,
} from "./parties";

type Stamp = { project_id: string; owner_id: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, "public", any>;

function fingerprint(groupType: string, partyId: string, drawingIds: string[]): string {
  const sorted = [...drawingIds].sort().join(",");
  return createHash("sha256").update(`${groupType}|${partyId}|${sorted}`).digest("hex");
}

export async function refreshPartyRegister(
  client: unknown,
  drawingId: string,
  stamp: Stamp,
): Promise<void> {
  const db = client as Db;

  // 1. Every party named in a deferral on this drawing.
  const { data: items } = await db
    .from("drawing_items")
    .select("id, deferred_to")
    .eq("drawing_id", drawingId)
    .eq("item_type", "deferral")
    .not("deferred_to", "is", null);

  const { data: partyRows } = await db
    .from("parties")
    .select("id, canonical_name, normalised_name")
    .eq("project_id", stamp.project_id);
  const parties: PartyRecord[] = (partyRows ?? []) as PartyRecord[];

  const { data: aliasRows } = await db
    .from("party_aliases")
    .select("party_id, normalised_alias")
    .eq("project_id", stamp.project_id);
  const aliases = (aliasRows ?? []) as Array<{ party_id: string; normalised_alias: string }>;

  for (const item of (items ?? []) as Array<{ id: string; deferred_to: string }>) {
    const raw = displayName(item.deferred_to);
    const key = normalisePartyName(raw);
    if (!key) continue;

    // Generic "specialist" / "others" defers to nobody: no party is created,
    // and the deferral reverts to unnamed, which carries high severity.
    // Generic terms, and sentence fragments that are not a name at all, name
    // nobody: the deferral reverts to unnamed and carries high severity.
    if (isGenericPartyTerm(raw) || !isPartyNameLike(raw)) {
      await db
        .from("drawing_items")
        .update({ party_id: null, deferred_to: null, severity: "high" })
        .eq("id", item.id);
      continue;
    }

    const match = matchParty(raw, parties, aliases);
    let partyId: string | null = null;

    if (match.kind === "exact") {
      partyId = match.party.id;
    } else {
      // Uncertain matches are never merged: the party is created and the
      // possible duplicate is surfaced for the user to decide.
      const review =
        match.kind === "uncertain"
          ? { needs_review: true, review_reason: `Possibly the same as “${match.party.canonical_name}”.` }
          : { needs_review: false, review_reason: null };
      const { data: created } = await db
        .from("parties")
        .insert({
          ...stamp,
          canonical_name: titleCaseName(raw),
          normalised_name: key,
          party_type: inferPartyType(raw),
          appointed_status: "unknown",
          ...review,
        })
        .select("id, canonical_name, normalised_name")
        .maybeSingle();
      if (created) {
        parties.push(created as PartyRecord);
        partyId = (created as PartyRecord).id;
      } else {
        // Another sheet in the same read created it first.
        const { data: existing } = await db
          .from("parties")
          .select("id, canonical_name, normalised_name")
          .eq("project_id", stamp.project_id)
          .eq("normalised_name", key)
          .maybeSingle();
        if (existing) {
          parties.push(existing as PartyRecord);
          partyId = (existing as PartyRecord).id;
        }
      }
    }

    if (!partyId) continue;

    if (!aliases.some((a) => a.normalised_alias === key)) {
      await db
        .from("party_aliases")
        .insert({ ...stamp, party_id: partyId, alias: raw, normalised_alias: key, source: "extraction" });
      aliases.push({ party_id: partyId, normalised_alias: key });
    }

    await db.from("drawing_items").update({ party_id: partyId }).eq("id", item.id);
  }

  await rebuildPartyCorroborationsImpl(db, stamp);
}

export async function rebuildPartyCorroborations(client: unknown, stampArg: Stamp): Promise<void> {
  return rebuildPartyCorroborationsImpl(client as Db, stampArg);
}

async function rebuildPartyCorroborationsImpl(db: Db, stamp: Stamp): Promise<void> {
  const { data: rows } = await db
    .from("drawing_items")
    .select("id, party_id, drawing_id, raw_text, drawings!inner(originator, drawing_number, revision)")
    .eq("project_id", stamp.project_id)
    .eq("item_type", "deferral")
    .not("party_id", "is", null);

  type Row = {
    id: string;
    party_id: string;
    drawing_id: string;
    raw_text: string;
    drawings: { originator: string | null; drawing_number: string | null; revision: string | null } | null;
  };

  const typed = (rows ?? []) as unknown as Row[];

  const input: PartyGroupInput[] = typed.map((r) => ({
    item_id: r.id,
    party_id: r.party_id,
    drawing_id: r.drawing_id,
    originator: r.drawings?.originator ?? null,
  }));

  const groups = groupByParty(input);

  const { data: partyRows } = await db
    .from("parties")
    .select("id, canonical_name, appointed_status")
    .eq("project_id", stamp.project_id);
  const byId = new Map(
    ((partyRows ?? []) as Array<{ id: string; canonical_name: string; appointed_status: string }>).map(
      (p) => [p.id, p],
    ),
  );

  // Fingerprinted records: a re-read updates last_seen_at rather than
  // duplicating, and resolved / dismissed decisions survive a re-read.
  const { data: existingRows } = await db
    .from("corroborations")
    .select("id, fingerprint, status")
    .eq("project_id", stamp.project_id)
    .eq("kind", "party");
  const existing = new Map(
    ((existingRows ?? []) as Array<{ id: string; fingerprint: string | null; status: string }>)
      .filter((c) => c.fingerprint)
      .map((c) => [c.fingerprint as string, c]),
  );
  const seen = new Set<string>();

  for (const g of groups) {
    const party = byId.get(g.party_id);
    if (!party) continue;

    const fp = fingerprint("party", g.party_id, g.drawing_ids);
    seen.add(fp);

    const severity = corroborationSeverity(g, party.appointed_status);
    const evidence: PartyEvidence[] = typed
      .filter((r) => r.party_id === g.party_id)
      .map((r) => ({
        drawing_number: r.drawings?.drawing_number ?? null,
        revision: r.drawings?.revision ?? null,
        originator: r.drawings?.originator ?? null,
        text: r.raw_text,
      }));
    const narrative = partyNarrative(
      party.canonical_name,
      party.appointed_status,
      g.drawing_ids.length,
      g.originators,
      evidence,
    );

    const payload = {
      ...stamp,
      kind: "party",
      group_type: "party",
      party_id: g.party_id,
      topic: party.canonical_name,
      severity,
      narrative,
      summary:
        `${party.canonical_name} is named on ${g.drawing_ids.length} drawings` +
        (g.originators.length >= 2 ? ` by ${g.originators.length} originators` : "") +
        (party.appointed_status === "yes" ? "." : ", and is not recorded as appointed."),
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
    await db
      .from("corroboration_items")
      .insert(g.item_ids.map((itemId) => ({ ...stamp, corroboration_id: corrId, item_id: itemId })));
  }

  // Open records for groups that no longer exist are stale; remove them.
  // Resolved and dismissed records are kept as the user's record.
  const stale = [...existing.entries()].filter(([fp, c]) => !seen.has(fp) && c.status === "open");
  for (const [, c] of stale) {
    await db.from("corroborations").delete().eq("id", c.id);
  }

  // The topic axis is derived from the same findings and is rebuilt in the
  // same pass, so a read or a deletion re-derives both axes together.
  const { rebuildTopicCorroborations } = await import("./topic-corroboration.server");
  await rebuildTopicCorroborations(db, stamp);
}
