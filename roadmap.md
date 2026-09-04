# ScopeGuard roadmap

## Prerequisites
- [x] User's Supabase project connected (pwsmewzaybahczjtdikd)
- [x] Two Grafton Street PDFs received (Veretec GST-VER-...-2746, Foster + Partners GST-FSP-...-0002)

## Phase 1 — Foundation and deferrals
- [x] instructSite design system (navy console, blue/orange)
- [x] Branded landing / sign-in screen shell
- [ ] Schema (all tables, RLS, owner-writable project system prefixes)
- [ ] Seed reference data (disciplines, trades, brief-only cues, deferral patterns, prefixes, interface rules)
- [ ] Private `drawings` storage bucket
- [ ] Magic-link auth wired
- [ ] Projects list + create
- [ ] Drawing upload (multi-PDF, hash dedupe; same hash in same project clones items and skips analysis, different project analyses normally)
- [ ] `analyse-drawing`: owner_id + project_id copied from the parent drawing row on EVERY insert (drawing_items, coverage, corroborations) — service role bypasses RLS, not-null is only the safety net; rotation normalisation, coordinate-frame proof, titleblock-border notes strip, line merging, annotation-filtered triage + vector path count, diagnostics (text_span_count, body_text_count, path_count, layers_present), titleblock parse incl. drawing_type/discipline_code, deferral detection, colour flags, fail-closed
- [ ] Deferrals screen with disclaimer
- [ ] Excel export of deferrals
- [ ] Acceptance check on both sheets (deferrals AND triage class) — then stop

## Later phases (not started)
- Phase 2 allocation, Phase 3 corroboration/coverage, Phase 4 AI residual, Phase 5 polish
