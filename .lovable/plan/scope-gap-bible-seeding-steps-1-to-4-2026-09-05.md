# Scope Gap Bible — seeding steps 1 to 4

Turns the bible into detection data: trades, interface rules, deferral language, and the life-safety severity rule. Steps 5 to 7 (cues, nine-category taxonomy, gap register fields) are not in this build.

## 1. Trade register

Add ten trades: Civil Engineering & Drainage (CIVL), Paving & External Hard Landscaping (PAVE), Timber Frame (TIMB), Render & EWI (REND), Plastering (PLAS), Tiling (TILE), Acoustic Flooring (ACFL), Lighting (LTNG), Waterproofing & Tanking (WPRF), Temporary Works (TMPW).

Lighting is deliberately separate from Electrical, and Waterproofing separate from Roofing, because those are exactly the boundaries scope falls through. Existing 34 trades are untouched, so nothing already allocated changes.

## 2. Interface rules — merge, never narrow

The 22 bible interfaces are merged with the 15 live rules under fixed rules:

- Where a bible rule covers the same junction as an existing one: keep the existing trigger and context terms exactly as they are, take the bible's guidance sentence, and union the trade codes.
- Never remove a trigger term. If the existing rule fires on a word the bible does not list, that word stays.
- Bible rules with no existing equivalent are added new — roughly a dozen: tanking behind wet-area tiling, paving over podium, acoustic floor perimeter isolation, power and data separation, temporary works design responsibility, fire alarm cause and effect, lift lobby threshold, feature and external lighting allocation, site levels at the platform, substrate handover before decoration, foundation to slab handover, base plate setting out.

Junctions treated as already covered (guidance and trades updated, terms kept): cavity barrier at facade, deflection head, beam encasement / fire protection to steel, secondary steel and facade brackets, fire stopping to penetrations, builders work openings, waterproofing upstands, containment for security and data, access panels, ceiling void coordination.

## 3. Deferral language

Add the bible's vague-scope patterns: "as required", "to suit", "refer to specialist design", assumed or approximate position, pending survey / GI / approval, "to be agreed" / TBA, "to engineer's design", "manufacturer's details", "subject to approval". Plus explicit exclusions (exclude / excludes / excluding) as high — the bible's point being that an exclusion nobody picks up is the most reliable variation on a job.
Plus warranty and guarantee responsibility — warranty / warranties, guarantee, single point responsibility, system warranty — high where no party is named. Warranty responsibility for a waterproofing, roofing, facade or tanking system is routinely unstated, so nobody has taken design responsibility for it as installed.

Each carries the bible's own sentence as the recommended action, and its commercial risk where the bible states one. Patterns are checked against the existing set first so no duplicate wording is seeded.


## 4. Severity model

Severity stops being whatever the matched pattern says. After matching:

- Escalate to high, whatever the base, when the finding or its interface rule touches life safety or statute: fire, compartmentation, means of escape, refuge, cavity barrier, fire stopping, smoke, sprinkler, alarm, accessibility, Part B, Part M, building regulations, fire strategy.
- No responsible party named stays high (already the rule).
- Escalate one level where the finding names a long-lead or structural element.
- De-escalate to low only for documentation tidy-up — a superseded or duplicate reference that changes neither price nor method.

## Acceptance

Re-read all four Grafton sheets, then confirm:

- Veretec 2746 contested count has not fallen. A rise is expected and fine; a fall is a regression.
- Cavity barrier, deflection head, beam encasement and waterproofing upstand items all still fire.
- Foster note 14 and the Veretec abeyance note are high on the life-safety rule, not only on the party rule.
- Every new interface rule references a trade code that exists.

Before and after counts for each sheet are printed for you.

## Technical notes

- Steps 1 to 4 are reference-data changes only — no schema change. Written as a repeatable, idempotent `db/bible-seed.sql` and applied to the live project, with `db/schema.sql` left as the structural source of truth.
- Column mapping for the bible's pattern rows: `claim_type` to `category`, `severity` to `default_severity`, `guidance` to `recommended_action`.
- Severity escalation is implemented in `src/lib/scopeguard/pipeline.ts` as a single post-match function with the life-safety term list held next to it, so it applies on every write path.
- The nine-category taxonomy and the gap register fields (`open | in_query | resolved_pending_reissue | closed`) are recorded as the next step and not built here.
