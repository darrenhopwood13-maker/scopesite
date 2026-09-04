-- ScopeGuard database schema — full reproduction script.
--
-- Why this file is not in supabase/migrations/: that folder is managed by the
-- platform's migration tool, which is not available in this session, and the
-- folder rejects direct writes. This file is the repo's source of truth in the
-- meantime. It was reconstructed from the live instructScopeV1 database
-- (catalog dump of tables, constraints, indexes, grants, policies), so running
-- it on an empty project reproduces the database. Every statement is written
-- to be safe to re-run.
--
-- When the migration tool is available again, this script should be replayed
-- through it so the migration history matches.

-- ---------------------------------------------------------------- reference
create table if not exists public.disciplines (
  code text primary key,
  name text not null,
  sort_order integer not null default 0
);

create table if not exists public.trades (
  code text primary key,
  name text not null,
  discipline_code text references public.disciplines(code),
  sort_order integer not null default 0,
  typical_drawing_types text[] not null default '{}'::text[]
);

create table if not exists public.trade_cues (
  id uuid primary key default gen_random_uuid(),
  trade_code text not null references public.trades(code) on delete cascade,
  cue text not null,
  weight numeric not null default 1,
  cue_type text not null default 'keyword',
  unique (trade_code, cue)
);

create table if not exists public.deferral_patterns (
  id uuid primary key default gen_random_uuid(),
  pattern text not null unique,
  category text not null,
  default_severity text not null default 'medium',
  commercial_risk text,
  recommended_action text
);

create table if not exists public.interface_rules (
  id uuid primary key default gen_random_uuid(),
  topic text,
  trade_a text references public.trades(code),
  trade_b text references public.trades(code),
  note text,
  name text,
  trigger_terms text[] not null default '{}'::text[],
  context_terms text[] not null default '{}'::text[],
  trade_codes text[] not null default '{}'::text[],
  severity text not null default 'high',
  guidance text,
  unique (topic, trade_a, trade_b)
);

-- --------------------------------------------------------------- user data
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  client text,
  project_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null,
  file_name text not null,
  storage_path text not null,
  file_hash text not null,
  status text not null default 'queued'
    check (status in ('queued', 'reading', 'complete', 'failed')),
  error_message text,
  triage_class text
    check (triage_class in ('annotation_rich', 'notes_only', 'graphical_only', 'unreadable')),
  text_span_count integer,
  body_text_count integer,
  path_count integer,
  layers_present text[],
  page_width numeric,
  page_height numeric,
  page_rotation integer,
  coordinate_frame_ok boolean,
  notes_strip_source text,
  drawing_number text,
  revision text,
  drawing_date text,
  drawing_scale text,
  title text,
  drawing_client text,
  originator text,
  issue_status text,
  drawing_type text,
  discipline_code text,
  cloned_from_drawing_id uuid references public.drawings(id) on delete set null,
  created_at timestamptz not null default now(),
  analysed_at timestamptz
);

create table if not exists public.drawing_items (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null,
  item_type text not null default 'body'
    check (item_type in ('body', 'note', 'deferral')),
  raw_text text not null,
  region text,
  page_number integer not null default 1,
  bbox jsonb,
  colour text,
  font_size numeric,
  is_red boolean not null default false,
  deferral_category text,
  also_categories text[] not null default '{}'::text[],
  deferred_to text,
  severity text check (severity in ('low', 'medium', 'high')),
  commercial_risk text,
  recommended_action text,
  allocated_trade_code text references public.trades(code),
  allocation_status text,
  system_code text,
  method text,
  confidence numeric,
  deferral_pattern_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.coverage (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null,
  trade_code text not null references public.trades(code),
  status text not null default 'expected_missing'
    check (status in ('present', 'expected_missing', 'not_applicable')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.corroborations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null,
  topic text not null,
  severity text check (severity in ('low', 'medium', 'high')),
  summary text,
  item_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);

create table if not exists public.system_code_prefixes (
  id uuid primary key default gen_random_uuid(),
  prefix text not null,
  trade_code text references public.trades(code),
  description text,
  scope text not null default 'global' check (scope in ('global', 'project')),
  project_id uuid references public.projects(id) on delete cascade,
  created_by uuid,
  confidence numeric not null default 0.9,
  created_at timestamptz not null default now()
);

-- ------------------------------------------- Phase 2: allocation and viewer
-- Applied directly to the live database on 4 September 2026; recorded here.
alter table public.drawing_items
  add column if not exists candidate_trades jsonb not null default '[]'::jsonb,
  add column if not exists interface_rule_id uuid references public.interface_rules(id),
  add column if not exists interface_guidance text,
  add column if not exists allocation_method text,
  add column if not exists corrected_trade_code text,
  add column if not exists correction_status text,
  add column if not exists correction_note text,
  add column if not exists corrected_at timestamptz,
  add column if not exists corrected_by uuid,
  add column if not exists bbox_frame text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drawing_items_allocation_status_check') then
    alter table public.drawing_items add constraint drawing_items_allocation_status_check
      check (allocation_status is null or allocation_status in ('allocated', 'ambiguous', 'unallocated'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drawing_items_correction_status_check') then
    alter table public.drawing_items add constraint drawing_items_correction_status_check
      check (correction_status is null or correction_status in ('accepted', 'changed', 'dismissed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drawing_items_bbox_frame_check') then
    alter table public.drawing_items add constraint drawing_items_bbox_frame_check
      check (bbox_frame is null or bbox_frame in ('rotated', 'unrotated'));
  end if;
end $$;

-- ----------------------------------------------------------------- indexes
create index if not exists projects_owner_idx on public.projects (owner_id);
create index if not exists drawings_owner_idx on public.drawings (owner_id);
create index if not exists drawings_project_idx on public.drawings (project_id);
create index if not exists drawings_hash_idx on public.drawings (project_id, file_hash);
create index if not exists drawing_items_owner_idx on public.drawing_items (owner_id);
create index if not exists drawing_items_drawing_idx on public.drawing_items (drawing_id);
create index if not exists coverage_owner_idx on public.coverage (owner_id);
create index if not exists corroborations_owner_idx on public.corroborations (owner_id);
create unique index if not exists system_code_prefixes_global_uniq
  on public.system_code_prefixes (prefix) where scope = 'global';
create unique index if not exists system_code_prefixes_project_uniq
  on public.system_code_prefixes (project_id, prefix) where scope = 'project';

-- ------------------------------------------------------------------ grants
grant select on public.disciplines to authenticated;
grant select on public.trades to authenticated;
grant select on public.trade_cues to authenticated;
grant select on public.deferral_patterns to authenticated;
grant select on public.interface_rules to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.drawings to authenticated;
grant select, insert, update, delete on public.drawing_items to authenticated;
grant select, insert, update, delete on public.coverage to authenticated;
grant select, insert, update, delete on public.corroborations to authenticated;
grant select, insert, update, delete on public.system_code_prefixes to authenticated;
grant all on public.disciplines, public.trades, public.trade_cues,
  public.deferral_patterns, public.interface_rules, public.projects,
  public.drawings, public.drawing_items, public.coverage,
  public.corroborations, public.system_code_prefixes to service_role;

-- --------------------------------------------------------------------- rls
alter table public.disciplines enable row level security;
alter table public.trades enable row level security;
alter table public.trade_cues enable row level security;
alter table public.deferral_patterns enable row level security;
alter table public.interface_rules enable row level security;
alter table public.projects enable row level security;
alter table public.drawings enable row level security;
alter table public.drawing_items enable row level security;
alter table public.coverage enable row level security;
alter table public.corroborations enable row level security;
alter table public.system_code_prefixes enable row level security;

drop policy if exists "reference readable" on public.disciplines;
create policy "reference readable" on public.disciplines for select to authenticated using (true);
drop policy if exists "reference readable" on public.trades;
create policy "reference readable" on public.trades for select to authenticated using (true);
drop policy if exists "reference readable" on public.trade_cues;
create policy "reference readable" on public.trade_cues for select to authenticated using (true);
drop policy if exists "reference readable" on public.deferral_patterns;
create policy "reference readable" on public.deferral_patterns for select to authenticated using (true);
drop policy if exists "reference readable" on public.interface_rules;
create policy "reference readable" on public.interface_rules for select to authenticated using (true);

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own drawings" on public.drawings;
create policy "own drawings" on public.drawings for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own items" on public.drawing_items;
create policy "own items" on public.drawing_items for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own coverage" on public.coverage;
create policy "own coverage" on public.coverage for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "own corroborations" on public.corroborations;
create policy "own corroborations" on public.corroborations for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Global prefixes stay read-only; a project owner may add their own.
drop policy if exists "prefixes readable" on public.system_code_prefixes;
create policy "prefixes readable" on public.system_code_prefixes for select to authenticated
  using (
    scope = 'global'
    or exists (select 1 from public.projects p
               where p.id = system_code_prefixes.project_id and p.owner_id = auth.uid())
  );
drop policy if exists "owner inserts project prefixes" on public.system_code_prefixes;
create policy "owner inserts project prefixes" on public.system_code_prefixes for insert to authenticated
  with check (
    scope = 'project' and created_by = auth.uid()
    and exists (select 1 from public.projects p
                where p.id = system_code_prefixes.project_id and p.owner_id = auth.uid())
  );
drop policy if exists "owner updates project prefixes" on public.system_code_prefixes;
create policy "owner updates project prefixes" on public.system_code_prefixes for update to authenticated
  using (
    scope = 'project'
    and exists (select 1 from public.projects p
                where p.id = system_code_prefixes.project_id and p.owner_id = auth.uid())
  )
  with check (
    scope = 'project'
    and exists (select 1 from public.projects p
                where p.id = system_code_prefixes.project_id and p.owner_id = auth.uid())
  );
drop policy if exists "owner deletes project prefixes" on public.system_code_prefixes;
create policy "owner deletes project prefixes" on public.system_code_prefixes for delete to authenticated
  using (
    scope = 'project'
    and exists (select 1 from public.projects p
                where p.id = system_code_prefixes.project_id and p.owner_id = auth.uid())
  );

-- --------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('drawings', 'drawings', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "own drawing files" on storage.objects;
create policy "own drawing files" on storage.objects for all to authenticated
  using (bucket_id = 'drawings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'drawings' and (storage.foldername(name))[1] = auth.uid()::text);
