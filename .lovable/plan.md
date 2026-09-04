# ScopeGuard — build plan

Staged exactly as the brief sets out. Each phase ships and is checked against the two Grafton Street drawings before the next one starts. Nothing from a later phase is built early.

## Phase 1 — Foundation and deferrals

What you get: sign in, projects, drawing upload, reading the PDF, honest triage, titleblock details, deferral findings, and an Excel export of them.

- Backend enabled (Lovable Cloud): sign-in by emailed link, private file storage for PDFs, and the full data model from the brief — disciplines, trades, trade cues, deferral patterns, system code prefixes, interface rules, projects, drawings, drawing items, coverage, corroborations. All tables created up front; later phases only fill them.
- Seeded reference data: all 10 disciplines, all 34 trades, all deferral patterns, all 10 system prefixes, all 15 interface rules, and the cue list — expanded beyond the brief so every trade has cues, not just the validated subset.
- Every project's data is private to the account that owns it. Reference lists are readable by signed-in users and editable by nobody.
- Upload screen: drag and drop one or many PDFs, duplicate detection by file fingerprint.
- Analysis run 1: extract text with positions, colours and sizes; count vector paths; split the sheet into notes strip vs drawing body; classify the sheet as annotation rich / notes only / graphical only / unreadable and say so plainly on screen; merge wrapped lines and split codes; parse the titleblock (number, revision, date, scale, title, client, originator, issue status), recording blanks as blank rather than guessing.
- Deferral detection over all text, plus the colour rule that flags red text as a high-severity hold.
- Deferrals screen: severity ordered, each row showing the exact wording, where on the sheet it came from, who it was deferred to, the commercial consequence and the action to take. Advisory disclaimer on screen and on every export.
- Excel export of the deferrals register.

Check before moving on: Foster + Partners sheet returns at least seven deferrals including the fire specialist note; Veretec sheet returns the red abeyance note as high severity; both titleblocks parse; no finding without quoted evidence.

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

- Stack is TanStack Start, so the analysis runs as a server function (`POST`-style typed call) rather than an edge function; behaviour is identical to the brief's pipeline. `pdfjs-dist` handles text extraction with coordinates and colours in the server runtime.
- Storage is a private bucket; PDFs served through signed URLs.
- Phase 4 uses the Lovable AI gateway with a strict JSON schema and the brief's system prompt.
- Superseded revisions retained; nothing deleted.
- Out of scope throughout: BIM/IFC, clash detection, cost or programme data, OCR/vision of geometry, RFI issue, any claim of compliance or approval.
