# Drawing viewer — Phase 2 Part B

Build the findings-linked viewer from the uploaded specification, in the order it sets out, with the coordinate proof as a gate before anything else is wired up.

## What you'll get

A split drawing page: the findings register on the left, the sheet itself on the right. Click a finding and the sheet moves to the exact words it was read from, highlighted in the severity colour. Click an annotation on the sheet and the matching row is selected in the list. Below a narrow screen the two swap to tabs instead of a cramped split.

## Build order

1. **Sheet on screen.** The PDF is loaded through a short-lived private link and drawn to a canvas, with wheel/pinch zoom about the cursor, drag to pan, and buttons for in, out, fit page, fit width, reset (`+`, `-`, `0` on the keyboard). Re-draw only on zoom, never on pan, so the 46,000-path Foster sheet stays smooth. Loading state while the first draw completes. Page 1 only, with the page count noted if there are more.
2. **The coordinate gate.** Before any finding is wired up, the Veretec 2746 sheet is rendered and one known box — the red abeyance note — is drawn from stored coordinates. I take a screenshot and show it to you. If the box does not sit exactly on the red text, nothing else is built until it does.
3. **Selection.** Clicking a finding animates the view (about 300ms) so its box is centred and framed at roughly a quarter of the viewport width, clamped between fit-page and 4x, with a short pulse then a steady highlight.
4. **Hover and reverse click.** Hovering a row faintly outlines its box without moving the view; clicking inside a box on the sheet selects that row and scrolls the list to it.
5. **Severity overlay.** A toggle, off by default, marking every finding's box at once in its severity colour with no zoom change.
6. **Responsive tabs** below 1024px, and a draggable divider above it whose position is remembered.

## Honesty rules

- A finding with no recorded location reads "Location not available on sheet" and clicking it does nothing to the view. Never a guessed position.
- No highlight is ever drawn outside the page edge.
- The count of location-less findings is logged, since a rise in it means extraction has regressed.

## Not in this build, now or later

Measuring, markup or comments, revision comparison, printing, layer toggling, editing the file.

## Technical notes

- New `src/components/DrawingViewer.tsx` (canvas render, transform state, overlay layer) plus a small `src/lib/scopeguard/viewer-transform.ts` holding the pure page-point-to-canvas-point conversion so it can be reasoned about and tested on its own.
- `pdfjs-dist` in the browser gets its **own** worker via `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)`. The server reader's worker configuration in `extract.server.ts` is left untouched — the two are never shared.
- Signed URL for the private `drawings` bucket minted in a server function from `storage_path`, short expiry, never public.
- Transform uses `drawings.page_rotation`, `page_width`, `page_height` and each item's `bbox_frame` (`rotated` for everything written by the current reader) rather than assuming the frames already agree.
- Wheel zoom scales by delta magnitude with `deltaMode` normalised, anchored on the cursor, via a non-passive native listener.
- All four existing sheets already have `bbox_frame` recorded, so nothing needs re-reading.
- The drawing page (`drawings.$drawingId.tsx`) keeps its tabs; the register and viewer sit side by side beneath them.

## Acceptance

Checked against Veretec 2746 (upright, red note highlighted across both merged lines, overlay all inside the page), Foster 0002 (renders smoothly, fire specialist deferral frames note 14, all ten in the notes region), and Veretec 2144 (party wall TBC highlights in the body not the titleblock, and clicking it on the sheet selects its row).
