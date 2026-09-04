# ScopeGuard roadmap

## Blocked — needs the user
- [ ] Connect the user's own Supabase Pro project (Project Settings → Connectors → Supabase)
- [ ] Receive the two Grafton Street PDFs for the rotation proof and acceptance check

## Phase 1 — Foundation and deferrals
- [x] instructSite design system (navy console, blue/orange)
- [x] Branded landing / sign-in screen shell
- [ ] Schema migration (all tables, RLS, owner-writable project system prefixes)
- [ ] Seed migration (disciplines, trades, brief-only cues, deferral patterns, prefixes, interface rules)
- [ ] Private `drawings` storage bucket
- [ ] Magic-link auth wired
- [ ] Projects list + create
- [ ] Drawing upload (multi-PDF, hash dedupe)
- [ ] `analyse-drawing` edge function: rotation normalisation, titleblock-border notes strip, line merging, triage, titleblock parse (incl. drawing_type, discipline_code), deferral detection, colour flags, fail-closed error handling
- [ ] Deferrals screen with disclaimer
- [ ] Excel export of deferrals
- [ ] Acceptance check on the two Grafton Street sheets — then stop

## Later phases (not started)
- Phase 2 allocation, Phase 3 corroboration/coverage, Phase 4 AI residual, Phase 5 polish
