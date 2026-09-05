-- ScopeGuard Phase 3 hygiene — appointment status, party names, false parties.
--
-- Run once against instructScopeV1 (already applied through the data tool on
-- 2026-09-05). Safe to re-run.

-- 1. Appointment is only ever set by the user. Nothing infers it, so every
--    party goes back to unknown.
update public.parties set appointed_status = 'unknown' where appointed_status <> 'unknown';

-- 2. Truncated drawing notes are not parties. This one came from
--    "EMPHASISE AMR WORKS ONLY USING ARCHITECT'S"; the deferral reverts to
--    unnamed, which carries high severity.
update public.drawing_items
  set party_id = null, deferred_to = null, severity = 'high'
  where party_id in (select id from public.parties where canonical_name like 'EMPHASISE %');
delete from public.party_aliases
  where party_id in (select id from public.parties where canonical_name like 'EMPHASISE %');
delete from public.corroboration_items where corroboration_id in (
  select id from public.corroborations
  where party_id in (select id from public.parties where canonical_name like 'EMPHASISE %'));
delete from public.corroborations
  where party_id in (select id from public.parties where canonical_name like 'EMPHASISE %');
delete from public.parties where canonical_name like 'EMPHASISE %';

-- 3. Canonical names read as names; the drawing's own wording stays in
--    party_aliases. New parties are title cased in code (titleCaseName).
update public.parties set canonical_name = 'Techrete' where canonical_name = 'TECHRETE';
update public.parties set canonical_name = 'Cladding Specialist' where canonical_name = 'CLADDING SPECIALIST';
update public.parties set canonical_name = 'Fire Specialist' where canonical_name = 'fire specialist';
update public.parties set canonical_name = 'Tenant' where canonical_name = 'TENANT';
update public.parties set canonical_name = 'Security Consultant' where canonical_name = 'security consultant';
update public.parties set canonical_name = 'Specialist Lighting Designer' where canonical_name = 'specialist lighting designer';
update public.parties set canonical_name = 'Tenant Fit Out Architect' where canonical_name = 'tenant fit out architect';
update public.parties set canonical_name = 'Reconal' where canonical_name = 'RECONAL';
