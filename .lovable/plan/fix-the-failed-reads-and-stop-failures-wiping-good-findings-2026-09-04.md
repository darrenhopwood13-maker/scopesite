# Fix the failed reads and stop failures wiping good findings

Both sheets currently fail with a PDF worker error and end up with zero findings. Two separate fixes, then a re-run of both sheets before any viewer work.

## 1. Make the PDF reader work in the deployed environment

The reader runs on the server. Nothing in the code tells the PDF library where its worker script lives, so it falls back to loading one by guessing a path — that guess does not exist in the deployed bundle, which is the `No such module '_libs/pdf.worker.mjs'` error.

Fix in `src/lib/scopeguard/extract.server.ts`:

- Import the worker module explicitly (`pdfjs-dist/legacy/build/pdf.worker.mjs`) so the bundler includes it in the deployed output instead of resolving it at runtime.
- Hand that module to pdf.js before opening a document by assigning it to `globalThis.pdfjsWorker` and setting `GlobalWorkerOptions.workerSrc` to a non-empty value, so the library uses the already-bundled worker and never attempts a runtime path lookup.
- Keep this setup in a single server-only initialiser that runs once per process.

Server vs client: this configuration stays inside `extract.server.ts` and applies to the reader only. When the Part B viewer renders PDFs in the browser it will need its own worker setup (a bundled worker URL via `new URL(..., import.meta.url)`); the two must not share one configuration.

Verification: run both sheets through the deployed preview (not just the local harness) and confirm the worker error is gone and the reader completes.

## 2. A failed read must leave previous findings intact

Rework `src/lib/scopeguard/analyse.functions.ts` so replacement is the last step, not the first:

1. Mark the drawing as reading. Do not delete anything.
2. Download, extract, detect deferrals, allocate — all in memory.
3. Only once the full new set is built: delete the previous items and insert the new ones, then write the titleblock/diagnostics and the complete status.
4. On any failure at any point: leave the existing items untouched, record the error, set status failed.

The duplicate-clone path follows the same order: build the cloned rows first, replace only on success.

Failure display on the drawing page keeps the existing behaviour and makes it explicit: the error banner states the read failed and produced nothing, and any findings shown below are labelled as coming from the earlier successful read.

## 3. Acceptance before Part B

- Foster: 10 deferrals, `notes_only`, Rev 02 / 11/03/2024.
- Veretec: 4 deferrals, 14 contested, 16 clear, 3 unclaimed, `annotation_rich`, Rev P01 / 11/06/25.
- A deliberately failed read leaves the previous findings in place.

Part B (the drawing viewer) does not start until both sheets read cleanly.
