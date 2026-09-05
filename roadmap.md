# ScopeGuard roadmap

## Prerequisites
- [x] User's Supabase project connected (pwsmewzaybahczjtdikd)
- [x] Two Grafton Street PDFs received (Veretec GST-VER-...-2746, Foster + Partners GST-FSP-...-0002)

## Phase 1 — Foundation and deferrals
- [x] instructSite design system (navy console, blue/orange)
- [x] Branded landing / sign-in screen shell
- [x] Schema (all tables, RLS, owner-writable project system prefixes)
- [x] Seed reference data (disciplines, trades, brief-only cues, deferral patterns, prefixes, interface rules)
- [x] Private `drawings` storage bucket
- [x] Magic-link auth wired
- [x] Projects list + create
- [x] Drawing upload (multi-PDF, hash dedupe; same hash in same project clones items and skips analysis, different project analyses normally)
- [x] `analyse-drawing`: owner_id + project_id copied from the parent drawing row on EVERY insert (drawing_items, coverage, corroborations) — service role bypasses RLS, not-null is only the safety net; rotation normalisation, coordinate-frame proof, titleblock-border notes strip, line merging, annotation-filtered triage + vector path count, diagnostics (text_span_count, body_text_count, path_count, layers_present), titleblock parse incl. drawing_type/discipline_code, deferral detection, colour flags, fail-closed
- [x] Deferrals screen with disclaimer
- [x] Excel export of deferrals
- [x] Reading fixes: numbered-note splitting, one finding per note with other matched types listed, severity caps for generic pointers, wrapped-word repair, titleblock/triage written before findings, blank commercial risk replaced
- [~] Acceptance check — run against the reading step directly on both PDFs (Veretec annotation_rich + red abeyance high; Foster notes_only + 12 deferrals incl. fire specialist; both titleblocks incl. type and discipline). NOT yet run end to end through the app screens (upload → database → register), because there is no way to sign in to the user's Supabase project from here. User is running both drawings through the app.

## Scope Gap Bible seeding
- [x] Step 1 — ten new trades (CIVL, PAVE, TIMB, WPRF, REND, ACFL, TILE, PLAS, LTNG, TMPW)
- [x] Step 2 — 15 new interface rules; 8 existing rules merged (guidance + trade union only, no trigger terms removed)
- [x] Step 3 — 11 new deferral patterns incl. exclusions and warranty/guarantee responsibility
- [x] Step 4 — severity model: life-safety escalation, programme sensitivity, tidy-up de-escalation (`applySeverityModel`)
- [ ] Step 5 — trade cues per trade, drawing language only
- [ ] Step 6 — nine-category findings taxonomy, five marked not yet detected
- [ ] Step 7 — gap register fields incl. `resolved_pending_reissue`

## Later phases (not started)
- Phase 4 AI residual, Phase 5 polish

