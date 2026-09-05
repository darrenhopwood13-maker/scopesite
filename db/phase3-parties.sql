-- ScopeGuard Phase 3, steps 1 and 2 — party register and party corroborations.
--
-- The platform migration tool is not available in this session, so this file is
-- the repo's record of the change and must be run once against the
-- instructScopeV1 database (Supabase SQL editor). db/schema.sql carries the same
-- statements. Replay both through the migration tool once it is available.
-- Every statement is safe to re-run.

-- ------------------------------------------------------------------ parties
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null,
  canonical_name text not null,
  normalised_name text not null,
  appointed_status text not null default 'unknown',
  needs_review boolean not null default false,
  review_reason text,
  merged_into_party_id uuid references public.parties(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, normalised_name)
);

-- Spec vocabulary: appointed yes | no | unknown (was unknown/appointed/not_appointed).
alter table public.parties drop constraint if exists parties_appointed_status_check;
update public.parties set appointed_status = 'yes' where appointed_status = 'appointed';
update public.parties set appointed_status = 'no' where appointed_status = 'not_appointed';
alter table public.parties
  add constraint parties_appointed_status_check
  check (appointed_status in ('yes', 'no', 'unknown'));

-- Party type: consultant | specialist_subcontractor | client_side | supplier | unknown.
alter table public.parties add column if not exists party_type text not null default 'unknown';
alter table public.parties drop constraint if exists parties_party_type_check;
alter table public.parties
  add constraint parties_party_type_check
  check (party_type in ('consultant', 'specialist_subcontractor', 'client_side', 'supplier', 'unknown'));

alter table public.parties add column if not exists appointed_note text;

create table if not exists public.party_aliases (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null,
  alias text not null,
  normalised_alias text not null,
  source text,
  created_at timestamptz not null default now(),
  unique (project_id, normalised_alias)
);

alter table public.drawing_items
  add column if not exists party_id uuid references public.parties(id) on delete set null;

-- ----------------------------------------------------------- corroborations
alter table public.corroborations
  add column if not exists kind text not null default 'party',
  add column if not exists party_id uuid references public.parties(id) on delete cascade,
  add column if not exists drawing_ids uuid[] not null default '{}'::uuid[],
  add column if not exists originators text[] not null default '{}'::text[],
  add column if not exists group_type text not null default 'party',
  add column if not exists narrative text,
  add column if not exists drawing_count integer not null default 0,
  add column if not exists originator_count integer not null default 0,
  add column if not exists status text not null default 'open',
  add column if not exists resolved_note text,
  add column if not exists fingerprint text,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now();

alter table public.corroborations drop constraint if exists corroborations_status_check;
alter table public.corroborations
  add constraint corroborations_status_check check (status in ('open', 'resolved', 'dismissed'));
alter table public.corroborations drop constraint if exists corroborations_group_type_check;
alter table public.corroborations
  add constraint corroborations_group_type_check check (group_type in ('party', 'topic'));

create unique index if not exists corroborations_fingerprint_idx
  on public.corroborations (project_id, fingerprint) where fingerprint is not null;

create table if not exists public.corroboration_items (
  id uuid primary key default gen_random_uuid(),
  corroboration_id uuid not null references public.corroborations(id) on delete cascade,
  item_id uuid not null references public.drawing_items(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  unique (corroboration_id, item_id)
);

create index if not exists parties_project_idx on public.parties (project_id);
create index if not exists party_aliases_project_idx on public.party_aliases (project_id);
create index if not exists drawing_items_party_idx on public.drawing_items (party_id);
create index if not exists corroborations_party_idx on public.corroborations (party_id);
create index if not exists corroboration_items_corr_idx on public.corroboration_items (corroboration_id);

-- ------------------------------------------------------------------- grants
grant select, insert, update, delete on public.parties to authenticated;
grant select, insert, update, delete on public.party_aliases to authenticated;
grant select, insert, update, delete on public.corroboration_items to authenticated;
grant all on public.parties, public.party_aliases, public.corroboration_items to service_role;

-- ---------------------------------------------------------------------- rls
alter table public.parties enable row level security;
alter table public.party_aliases enable row level security;
alter table public.corroboration_items enable row level security;

drop policy if exists "own parties" on public.parties;
create policy "own parties" on public.parties for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own party aliases" on public.party_aliases;
create policy "own party aliases" on public.party_aliases for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own corroboration items" on public.corroboration_items;
create policy "own corroboration items" on public.corroboration_items for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
