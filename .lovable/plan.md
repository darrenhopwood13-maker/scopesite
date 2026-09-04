# ScopeGuard Phase 1 — build order

Your Supabase project is connected and empty, so Phase 1 starts from the database and finishes at the acceptance check. Nothing from Phase 2 onwards is built.

## 1. Database (two migrations)

Migration A — structure: disciplines, trades, trade cues, deferral patterns, system code prefixes, interface rules, projects, drawings, drawing items, coverage, corroborations. All tables created now; later phases only fill them.

Access rules:
- Project data (projects, drawings, items, coverage, corroborations) readable and writable only by the account that owns the project.
- Reference lists readable by any signed-in user, writable by nobody — except that a project owner may add their own project-scoped system prefixes. Global prefix rows stay read-only.

Migration B — seed data: the 10 disciplines, 34 trades, the deferral patterns, 10 global system prefixes, 15 interface rules, and the cue list exactly as written in the brief. No invented cues.

## 2. Storage

Private `drawings` bucket, uploads and reads scoped to the owning account, files reached only through short-lived signed links.

## 3. Sign in

Magic-link email sign in, a signed-in area that is gated properly, and sign out.

## 4. Screens

- Projects list and create project.
- Project page: drag-and-drop upload of one or many PDFs, duplicate detection by file fingerprint, per-drawing status (queued, reading, done, failed).
- Duplicate handling: the same file fingerprint already in the same project clones the existing findings onto the new drawing record and skips re-reading. The same file uploaded into a different project is read normally.
- Deferrals register for a drawing: severity ordered, each row showing the exact wording, where on the sheet it came from, who it was deferred to, the commercial consequence and the action to take. Advisory disclaimer on screen and in the export.
- Excel export of the register.


## 5. The reading step

An `analyse-drawing` function on your Supabase project does all PDF work; nothing is read in the browser.

Order of work inside it:
1. Page rotation normalised first, and the text positions confirmed to sit in the same frame as the page size before anything is split into regions. Proved against the Veretec sheet.
2. Notes strip located from the titleblock border rectangle; the fixed right-hand 28% is used only when no border is found.
3. Line merging — vertically when left edges are within 3pt, the gap is 0–6pt, font sizes within 0.3pt and the colour matches; horizontally on the same baseline when the gap is under 2pt.
4. Triage: annotation rich / notes only / graphical only / unreadable, stated plainly on screen. No findings are ever produced from an empty extraction.
5. Titleblock parse: drawing number, revision, date, scale, title, client, originator, issue status, plus drawing type and discipline code. Missing fields recorded blank, never guessed.
6. Deferral detection across all text, plus the colour rule flagging red text as a high-severity hold. Where no responsible party is named, the party is left blank and the severity raised to high.
7. On any failure: the drawing is marked failed, the error recorded, zero items created.

## 6. Acceptance check, then stop

Run both Grafton Street sheets:
- Foster + Partners sheet returns at least seven deferrals including the fire specialist note.
- Veretec sheet returns the red abeyance note as high severity.
- Both titleblocks parse, including type and discipline.
- No finding without quoted evidence.

I still need those two PDFs to run this check. I can build everything above first and hold at the check until they arrive.

## Technical notes

- Schema and seed applied as Supabase migrations only; migrations are the source of truth.
- Extraction runs server-side on your Supabase project as a Deno Edge Function using `pdfjs-dist` for text with coordinates, colours and font sizes, as the brief specifies. Front end uses the publishable key under row-level security only; the service key never appears in app code.
- Excel export generated client-side with SheetJS from data already fetched under RLS.
- Superseded revisions retained; nothing deleted.
- Out of scope throughout: BIM/IFC, clash detection, cost or programme data, OCR/vision of geometry, RFI issue, any claim of compliance or approval.
