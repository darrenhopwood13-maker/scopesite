# Phase 2 — Allocation, plus the drawing viewer

Two pieces of work, in this order: get allocation working, then build the viewer that lets you see each finding on the sheet.

## Part A — Allocation

**System code matching.** Each finding's text is checked against the project's prefix register (the ten global prefixes plus any this project has learned). When a code prefix appears that the register does not know, the row shows a "new prefix found — what does this mean?" prompt; answering it saves the prefix for this project only, never globally.

**Cue scoring.** The validated cue list from the brief scores candidate trades for each finding. A clear winner allocates; two or more close scores land in a contested band; nothing scoring lands unclaimed. No invented cues.

**Interface rules.** The fifteen seeded interface rules always override a confident single allocation, so junction work never collapses to one trade.

**Three tabs on the drawing page** — Clear, Contested, Unclaimed — each row correctable: change trade, accept, or dismiss with a note. Every correction is stored against the finding with who made it and when.

**Acceptance:** on the Veretec sheet, cavity barrier, secondary steel, beam encasement and waterproofing upstand all come back contested, none collapsed to a single trade.

## Part B — Drawing viewer

Built after the allocation tabs work.

**Layout.** Split view on the drawing page: register left at 40%, drawing right at 60%, draggable divider whose position is remembered per user. Titleblock summary stays above both. Under 1024px wide it becomes two tabs, Findings and Drawing, rather than a cramped split.

**Rendering.** The sheet is drawn in the browser from a short-lived signed link to the private store — the file is never made public. Rendered once per zoom level and cached, never redrawn while panning, with a loading state on first render. Page one only; if a file has more pages, the count is stated.

**The coordinate gate.** Before anything else in the viewer is built: store which frame each location belongs to (rotated or unrotated page space) alongside the page rotation and page size already held on the drawing record, then prove the transform on the Veretec 2746 sheet with one hardcoded box — the red abeyance annotation must be covered exactly, across both merged lines. Nothing further gets built until that lands on the money. Where several lines merged into one finding, the stored box is the union of those lines.

**Interactions.** Click a finding: the view eases to it over about 300ms, framed at roughly a quarter of the viewport width, clamped between fit-page and 4x, with the box filled at low opacity and outlined in its severity colour — red, amber, blue — pulsing once then steady. Hovering a row outlines its box without moving the view. Clicking the sheet inside a box selects that row and scrolls the register to it. A toggle (off by default) marks every finding's box at once with no zoom change. Wheel and pinch zoom about the cursor, drag to pan, buttons for in, out, fit page, fit width, reset, and keyboard + - 0.

**No location.** A finding without a stored box shows "Location not available on sheet" instead of the locate control, clicking does nothing to the view, and the occurrence is counted so a rise in them is visible.

**Explicitly not built, now or later:** measuring, markup or comments, revision overlay or comparison, printing, layer toggling, any editing of the file.

**Acceptance:** Veretec 2746 renders upright, the red abeyance finding frames and highlights exactly, and the overlay puts every finding inside the page. Foster 0002 renders despite its very heavy linework and stays smooth, the fire specialist deferral frames note 14, and all ten findings sit in the notes strip. Veretec 2144's party wall TBC highlights on the body annotation, not the titleblock, and clicking that annotation selects its row.

## Technical notes

- Allocation runs server-side in a TanStack server function against the project's Supabase data; corrections written through RLS as the signed-in user.
- Migration adds `bbox_frame` to `drawing_items` and an allocation/correction table with grants and RLS; `page_rotation`, `page_width`, `page_height` already exist on `drawings`.
- Viewer uses the already-installed `pdfjs-dist` client-side, canvas cached per zoom, non-passive wheel listener with cursor-anchored exponential zoom.
- Re-reading a sheet is required after the migration so boxes carry their frame.
