-- ScopeGuard Phase 3, step 3 — topic definitions.
-- Safe to run more than once. Reference data: readable by any signed-in user,
-- written only by the service role. The same eight topics are mirrored in
-- src/lib/scopeguard/topics.ts so grouping works before this file is run.

create table if not exists public.corroboration_topics (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  keywords text[] not null,
  severity text not null default 'high'
);

alter table public.corroboration_topics drop constraint if exists corroboration_topics_severity_check;
alter table public.corroboration_topics
  add constraint corroboration_topics_severity_check check (severity in ('low', 'medium', 'high'));

grant select on public.corroboration_topics to authenticated;
grant all on public.corroboration_topics to service_role;

alter table public.corroboration_topics enable row level security;

drop policy if exists "topics readable" on public.corroboration_topics;
create policy "topics readable" on public.corroboration_topics
  for select to authenticated using (true);

insert into public.corroboration_topics (name, keywords, severity) values
('Façade / fire interface',
 '{fire protection,fire stopping,cavity barrier,compartment,facade,façade,cladding,sfs,encasement,fire seal,siderise,promat}','high'),
('Party wall and boundary',
 '{party wall,flank wall,boundary,adjoining,existing brickwork,site boundary}','high'),
('Tenant fit-out boundary',
 '{tenant,fit out,fit-out,demarcation,base build,category a,landlord}','high'),
('Structural design responsibility',
 '{str eng,structural engineer,secondary steel,support steel,structural design}','high'),
('MEP coordination',
 '{mep,m&e,services,riser,containment,builders work}','medium'),
('Security and access control',
 '{security,access control,cctv,door contact,maglock}','medium'),
('Lighting design',
 '{lighting,luminaire,lighting designer}','medium'),
('Waterproofing continuity',
 '{waterproofing,upstand,epdm,pmma,gutter,flashing,dpc,cavity tray}','high')
on conflict (name) do update
  set keywords = excluded.keywords,
      severity = excluded.severity;
