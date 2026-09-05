# Phase 3, steps 1 and 2 — bring the party register up to the specification

Steps 1 and 2 already exist in a first-cut form (a party register, aliases, and party-based groupings built during the last turn). This plan reconciles that work with the specification you have just given, which differs in several places, and stops after step 2 so you can look at the output before the topic axis is built.

Two things to flag before anything is built:

- The database-change tool is still unavailable in this session, so the new tables and columns cannot be applied from here. As before, the change will be written to a SQL file in the repo for you to run once in the Supabase SQL editor, and `db/schema.sql` will be updated to match. Nothing will be applied silently.
- Only two of the three Grafton Street sheets have been shared with me: Foster 0002 and Veretec 2746. Veretec 2144 (party wall, "TBC by Str Eng") is not here, so the party-wall corroboration in your acceptance criteria cannot be produced until that sheet is uploaded to the project.

## What changes

### 1. Party register brought to spec

- `party_type` on each party: consultant, specialist subcontractor, client side, supplier, unknown. Consultant only where the wording carries a clear role (engineer, architect, surveyor, designer, consultant, fire and similar). A bare company name attached to a product is a supplier — Techrete (precast system) and AMR (aluminium capping) classify as suppliers, not consultants. "Tenant fit out architect" reads as client side. Where the wording is unclear the type is left unknown, never defaulted to consultant.
- Generic "specialist" is not a party. Unqualified terms — "specialist", "the specialist", "specialist subcontractor", "others" — create no party. The deferral is treated as naming no responsible party, which under the existing rule raises its severity to high. Only qualified forms such as "cladding specialist" or "fire specialist" become parties. "EWS-701 ALUMINIUM RAINSCREEN CLADDING SYSTEM BY SPECIALIST" therefore stays a high-severity deferral with no party, and no party called Specialist is invented.
- Appointment status uses the specified values yes / no / unknown, with a free-text note, replacing the current three-way wording. Set only by you — nothing infers it.
- Normalisation keeps the existing qualifier stripping and extends it to trailing possessives and punctuation, then matches exact alias, case-insensitive alias, then normalised form, before creating anything new.
- Uncertain matches still create the party and raise a merge prompt ("Is 'cladding specialist' the same as 'facade specialist'?") with Merge or Keep separate. No automatic merging.

### 2. Corroborations brought to spec

- Records gain: group type (party now, topic later), severity, a written narrative, drawing count, originator count, status (open / resolved / dismissed) with a note, a fingerprint, and first/last seen timestamps.
- Fingerprint = group type + party + the sorted drawings in the group. Re-reading a sheet updates the existing record's last-seen time instead of duplicating it, and a resolved or dismissed card stays that way. Adding a new drawing to a group correctly produces a new card.
- This replaces the current delete-and-rebuild behaviour, which loses resolved and dismissed decisions.
- A group is only raised when it spans two or more drawings. Severity: high where two or more originators are involved or the party is not appointed; medium for multiple drawings, one originator, party appointed; low otherwise.
- Narrative is generated from the fixed template in your spec — party name, drawing and originator counts, the appointment line, then each source quoted verbatim with drawing number, revision and originator, and the closing confirmation sentence. Templated only; nothing is written by AI.

### 3. Screen

The project page keeps the party register and gains, per party card: type, appointment status (editable inline), alias list, and the count of drawings depending on them. Party corroborations are listed with severity, counts, the narrative, verbatim evidence linked to the drawing it came from, and Resolve / Dismiss with a note.

The Corroborations tab with the topic view, the standalone Parties screen, coverage, and the extra export sheets are steps 3 to 8 and are not in this plan.

## Acceptance for this slice

- "appointed fire specialist" and "fire specialist" resolve to one party.
- No party merged on a fuzzy match without a prompt.
- A Fire Specialist card showing deferred scope across the sheets that name it, appointment status not known, asking you to confirm.
- No card raised from a single drawing; every quote verbatim and traceable to drawing number and revision.
- Reading a sheet again does not duplicate cards, and a dismissed card stays dismissed.
- Party-wall coverage of the acceptance list is reported as not yet testable until Veretec 2144 is uploaded.

## Technical notes

New SQL file `db/phase3-parties.sql` extended (safe to re-run): `parties.party_type`, `parties.appointed` (yes/no/unknown) and `appointed_note`; `corroborations.group_type`, `narrative`, `drawing_count`, `originator_count`, `status`, `resolved_note`, `fingerprint` with a unique index on (project_id, fingerprint), `first_seen_at`, `last_seen_at`. Grants and owner-scoped RLS on every new table, matching the existing pattern. Register and grouping logic stay in the same server-side read pass (`party-register.server.ts`), so Read again re-reads and re-groups together.
