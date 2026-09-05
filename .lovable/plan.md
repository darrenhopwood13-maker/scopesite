# Phase 3, steps 3 and 4 — the topic axis and its narrative

Everything the two acceptance corroborations need is already in the database: the Foster note 14 fire text, the Veretec 2746 abeyance note, the Foster party wall note, and the 2144 outer-face note, plus the Siderise cavity barrier, FPS-204 beam encasement, plasterboard closure and fire seal items on 2746 as contested interface findings. Veretec 2144 is now read, so both acceptance cases are testable this time.

This plan stops after the narrative. No corroborations screen.

## What gets built

### Step 3 — topic definitions and topic grouping

- A new `corroboration_topics` table, seeded with the eight topics exactly as written in the specification (Façade / fire interface, Party wall and boundary, Tenant fit-out boundary, Structural design responsibility, MEP coordination, Security and access control, Lighting design, Waterproofing continuity), with their keyword sets and base severities unchanged. Seeding is idempotent so a re-run does not duplicate.
- Matching runs over two sources per drawing: the text of each deferral, and the text of each finding on that drawing where an interface rule fired. Matching is case- and accent-insensitive, on whole words or phrases, so "facade" and "façade" both hit and a keyword never matches inside a longer unrelated word.
- A drawing belongs to a topic when at least one deferral on it matches. Interface findings alone do not raise a topic — they are corroborating detail attached to a topic already raised by a deferral on that sheet. This keeps a purely graphical sheet from creating a card with nothing deferred on it.
- A corroboration is raised only where a topic covers two or more drawings. Severity is the topic's seeded severity, escalated to high where the group spans two or more originators. A drawing with no recorded originator counts as its own unknown originator and never inflates the count.
- Same fingerprint rule as the party axis: group type, topic, and the sorted drawings. A re-read updates the last-seen time; resolved and dismissed cards stay as the user left them; a new drawing joining the group correctly produces a new card. Stale open topic cards are cleared, and the party axis is untouched.
- Runs in the same pass as the party register, immediately after it, so one read produces both axes.

### Step 4 — the topic narrative

Templated, deterministic, nothing written by AI. Exactly the specification's shape:

- Opening line: topic name, drawing count, originator count.
- One bullet per source, naming the originator, the drawing number and revision, and quoting the deferral verbatim.
- The related-findings line, listing the contested interface items on the same topic from the same drawings, named by their drawing and quoted as written — for the façade/fire card this is the Siderise cavity barrier, the FPS-204 beam encasement, the plasterboard closing the gap and the fire seal on 2746.
- Closing line: "No package currently owns this scope."

Where a topic has no contested interface items, the related-findings line is omitted rather than written empty.

## What you will see when it is done

Both narratives printed in chat for you to read before anything is put on screen:

- **Façade / fire interface** — high, Foster 0002 and Veretec 2746, two originators, quoting note 14 and the abeyance note verbatim, with the related findings line naming the four 2746 items.
- **Party wall and boundary** — high, Foster 0002 and Veretec 2144, two originators, quoting the MB Survey Solutions note and the outer-face condition note.

Other topics may also raise cards from the four sheets; those will be listed too so you can judge whether the keyword sets are firing too widely.

## Technical notes

New repeatable SQL file `db/phase3-topics.sql`: `corroboration_topics` with grants and RLS matching the existing pattern (seeded rows are global reference data, readable by authenticated users, writable only by service role), plus the idempotent seed. `db/schema.sql` updated to match. Topic matching and the narrative template go into `src/lib/scopeguard/topics.ts` as pure functions; the grouping pass into `src/lib/scopeguard/topic-corroboration.server.ts`, called from `party-register.server.ts` right after the party rebuild and from the post-delete rebuild so deletions re-derive both axes. No change to extraction, allocation, the party axis or the viewer.
