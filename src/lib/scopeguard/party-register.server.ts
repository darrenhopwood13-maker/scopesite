// Party register (Phase 3 step 1) and party corroborations (step 2).
// Called at the end of a successful read, inside the same pass.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  corroborationSeverity,
  displayName,
  groupByParty,
  matchParty,
  normalisePartyName,
  type PartyGroupInput,
  type PartyRecord,
} from "./parties";

type Stamp = { project_id: string; owner_id: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, "public", any>;

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
          canonical_name: raw,
          normalised_name: key,
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

  await rebuildPartyCorroborations(db, stamp);
}

async function rebuildPartyCorroborations(db: Db, stamp: Stamp): Promise<void> {
  const { data: rows } = await db
    .from("drawing_items")
    .select("id, party_id, drawing_id, drawings!inner(originator)")
    .eq("project_id", stamp.project_id)
    .eq("item_type", "deferral")
    .not("party_id", "is", null);

  const input: PartyGroupInput[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    item_id: r["id"] as string,
    party_id: r["party_id"] as string,
    drawing_id: r["drawing_id"] as string,
    originator:
      ((r["drawings"] as { originator: string | null } | null)?.originator ?? null) as string | null,
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

  // Rebuilt from scratch each read so a removed finding never leaves a stale group.
  await db.from("corroborations").delete().eq("project_id", stamp.project_id).eq("kind", "party");

  for (const g of groups) {
    const party = byId.get(g.party_id);
    if (!party) continue;
    const severity = corroborationSeverity(g, party.appointed_status);
    const { data: corr } = await db
      .from("corroborations")
      .insert({
        ...stamp,
        kind: "party",
        party_id: g.party_id,
        topic: party.canonical_name,
        severity,
        summary:
          `${party.canonical_name} is named on ${g.drawing_ids.length} drawings` +
          (g.originators.length >= 2 ? ` by ${g.originators.length} originators` : "") +
          (party.appointed_status === "appointed" ? "." : ", and is not recorded as appointed."),
        item_ids: g.item_ids,
        drawing_ids: g.drawing_ids,
        originators: g.originators,
      })
      .select("id")
      .maybeSingle();
    if (!corr) continue;
    const corrId = (corr as { id: string }).id;
    await db
      .from("corroboration_items")
      .insert(g.item_ids.map((itemId) => ({ ...stamp, corroboration_id: corrId, item_id: itemId })));
  }
}
