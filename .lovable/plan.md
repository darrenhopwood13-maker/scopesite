# ScopeGuard — build plan

Staged exactly as the brief sets out. Each phase ships and is checked against the two Grafton Street drawings before the next one starts. Nothing from a later phase is built early.

## Before Phase 1 — connect your own backend

The brief requires your own Supabase Pro project, not a managed Lovable backend. I cannot link it from this chat: you connect it yourself in Lovable under Project Settings → Connectors → Supabase (a browser sign-in). Once it is connected I will:

- create the private `drawings` storage bucket,
- apply the full schema as a migration, and the seed data as a separate migration,
- deploy the analysis edge functions there,
- store the AI provider key as an edge function secret.

The front end will only ever use the public key under row-level security. The service key never appears in app code, and no PDF reading or AI call ever happens in the browser.

## Phase 1 — Foundation and deferrals (the only phase being built now)

What you get: sign in, projects, drawing upload, reading the PDF, honest triage, titleblock details, deferral findings, and an Excel export of them. Work stops at the acceptance check below.

- Database on your Supabase project: disciplines, trades, trade cues, deferral patterns, system code prefixes, interface rules, projects, drawings, drawing items, coverage, corroborations. All tables created up front; later phases only fill them.
- Seeded reference data: the 10 disciplines, 34 trades, all deferral patterns, 10 global system prefixes, 15 interface rules, and the cue list exactly as written in the brief. No invented cues.
- Every project's data is private to the account that owns it. Reference lists are readable by signed-in users and editable by nobody, with one exception: the project owner may add their own project-scoped system prefixes. Global prefix rows stay read-only.
- Upload screen: drag and drop one or many PDFs, duplicate detection by file fingerprint.
- Reading the sheet: page rotation handled first — text positions and page size are confirmed to be in the same frame before anything is split into regions, and this is proved against the Veretec sheet. The notes strip is found from the titleblock border rectangle; the fixed right-hand 28% is only a fallback when no border is detected.
- Line merging with the stated tolerances: vertically when left edges are within 3pt, the gap is 0–6pt, font sizes within 0.3pt and the colour matches; horizontally on the same baseline when the gap is under 2pt.
- Triage: annotation rich / notes only / graphical only / unreadable, stated plainly on screen. Never findings from an empty extraction.
- Titleblock parse: drawing number, revision, date, scale, title, client, originator, issue status, plus drawing type and discipline code (Phase 3 coverage depends on those two). Missing fields recorded as blank, never guessed.
- Deferral detection over all text, plus the colour rule flagging red text as a high-severity hold. Where no responsible party is named, the party is recorded as blank and the severity raised to high.
- If extraction fails: the drawing is marked failed with the error recorded and zero items created. Never partial findings.
- Deferrals screen: severity ordered, each row showing the exact wording, where on the sheet it came from, who it was deferred to, the commercial consequence and the action to take. Advisory disclaimer on screen and on every export.
- Excel export of the deferrals register.

Acceptance check, then stop: Foster + Partners sheet returns at least seven deferrals including the fire specialist note; Veretec sheet returns the red abeyance note as high severity; both titleblocks parse including type and discipline; no finding without quoted evidence.


## Phase 2 — Allocation

System code matching against the project's prefix register, with the "new prefix found — what does this mean?" prompt that teaches the register per project. Cue scoring with the contested band. Interface rules that always override a confident single allocation. The Clear, Contested and Unclaimed tabs, each row correctable — change trade, accept, or dismiss with a note — and every correction stored.

Check: the Veretec sheet returns cavity barrier, secondary steel, beam encasement and waterproofing upstand as contested, none collapsed to one trade.

## Phase 3 — Corroboration and coverage

Coverage tab (trades expected on this sheet type with no items, in amber). Cross-document grouping of deferrals by topic across drawings and originators, and the corroborations screen quoting both sources side by side. Full five-sheet Excel workbook.

Check: the two drawings produce a high-severity façade/fire corroboration quoting both notes verbatim.

## Phase 4 — AI residual

One batched AI pass over unclaimed body items only, each supplied with its five best candidate trades, allowed to return two or more trades or none. Never the full trade list, never position-based inference.

Check: unclaimed count at least halves with no loss of precision elsewhere.

## Phase 5 — Polish

Read-only rule-base viewer, batch upload, project dashboard, guided tour.

## Look and voice

instructSite styling: dark navy console, blue and orange accents on white. Professional, verdict-first, plain English, UK construction terms. Findings follow the fixed template — Finding, Evidence, Source, Deferred to, Commercial risk, Action.

## Technical notes

- All extraction and analysis runs as Supabase Edge Functions on your project (`analyse-drawing`, project-level corroboration), using `pdfjs-dist` in Deno for text with coordinates, colours and font sizes. No PDF work in the browser.
- Schema and seed data applied as migrations on your project; migrations are the only way schema changes are made.
- Private `drawings` bucket; PDFs read via signed URLs, uploads scoped per user.
- Phase 4 calls the AI provider from an edge function using a key held as an edge function secret, with a strict JSON schema and the brief's system prompt.

- Superseded revisions retained; nothing deleted.
- Out of scope throughout: BIM/IFC, clash detection, cost or programme data, OCR/vision of geometry, RFI issue, any claim of compliance or approval.
