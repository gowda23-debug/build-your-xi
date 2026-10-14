-- Build Your XI: World Cup edition gating and atomic import.
-- Forward-compatible repair migration for a fresh database and earlier World-edition drafts.
-- Existing editions are reset to pending and legacy edition roles are cleared. Re-import only
-- after source coverage, role evidence, processing and validation pass.

begin;

-- Fail early with an actionable code if the base schema/source identity migration
-- is missing. The whole migration runs in one transaction and will roll back.
do $$
begin
  if to_regclass('public.seasons') is null
     or to_regclass('public.teams') is null
     or to_regclass('public.team_seasons') is null
     or to_regclass('public.players') is null
     or to_regclass('public.player_roles') is null
     or to_regclass('public.player_season_stats') is null then
    raise exception 'WORLD_MIGRATION_PREREQUISITE_MISSING: apply the base Build Your XI schema migrations first.';
  end if;
  if to_regclass('public.world_player_sources') is null then
    raise exception 'WORLD_MIGRATION_PREREQUISITE_MISSING: apply 20261008_world_player_sources.sql before this migration.';
  end if;
end;
$$;

create table if not exists public.world_editions (
  id uuid primary key default gen_random_uuid(),
  year integer not null unique check (year >= 1979),
  season_name text not null,
  format text not null default 'ODI' check (format = 'ODI'),
  competition text not null default 'ICC Men''s Cricket World Cup'
    check (competition = 'ICC Men''s Cricket World Cup'),
  overs_per_innings integer not null check (overs_per_innings in (50, 60)),
  expected_match_count integer not null check (expected_match_count > 0),
  source_match_count integer,
  source_provider text not null check (source_provider = 'Cricsheet'),
  source_url text not null check (source_url like 'https://%'),
  license text not null check (license = 'ODC-By-1.0'),
  season_id uuid references public.seasons(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'importing', 'published')),
  imported_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Canonical columns; ADD COLUMN IF NOT EXISTS makes this safe for schema drafts.
alter table public.world_editions add column if not exists id uuid default gen_random_uuid();
alter table public.world_editions add column if not exists year integer;
alter table public.world_editions add column if not exists season_name text;
alter table public.world_editions add column if not exists format text;
alter table public.world_editions add column if not exists competition text;
alter table public.world_editions add column if not exists overs_per_innings integer;
alter table public.world_editions add column if not exists expected_match_count integer;
alter table public.world_editions add column if not exists source_match_count integer;
alter table public.world_editions add column if not exists source_provider text;
alter table public.world_editions add column if not exists source_url text;
alter table public.world_editions add column if not exists license text;
alter table public.world_editions add column if not exists season_id uuid;
alter table public.world_editions add column if not exists status text default 'pending';
alter table public.world_editions add column if not exists imported_at timestamptz;
alter table public.world_editions add column if not exists published_at timestamptz;
alter table public.world_editions add column if not exists created_at timestamptz default now();
alter table public.world_editions add column if not exists updated_at timestamptz default now();

-- Normalize status/metadata safely without trusting flags from an older migration.
do $$
declare
  v_column text;
  v_constraint record;
begin
  if exists (select 1 from public.world_editions where year is null) then
    raise exception 'WORLD_MIGRATION_INVALID_YEAR: world_editions contains NULL year values; repair them before retrying.';
  end if;

  for v_constraint in
    select conname from pg_constraint
    where conrelid = 'public.world_editions'::regclass and contype = 'c'
  loop
    execute format('alter table public.world_editions drop constraint %I', v_constraint.conname);
  end loop;

  foreach v_column in array array[
    'observed_match_count', 'source_license', 'import_status',
    'source_match_count', 'season_id', 'imported_at', 'published_at', 'license',
    'expected_match_count', 'format', 'competition', 'overs_per_innings', 'source_provider', 'source_url'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'world_editions' and column_name = v_column
    ) then
      execute format('alter table public.world_editions alter column %I drop not null', v_column);
    end if;
  end loop;

  update public.world_editions
  set id = coalesce(id, gen_random_uuid()),
      season_name = coalesce(nullif(btrim(season_name), ''), 'ICC Men''s Cricket World Cup ' || year::text),
      format = coalesce(nullif(format, ''), 'ODI'),
      competition = coalesce(nullif(competition, ''), 'ICC Men''s Cricket World Cup'),
      overs_per_innings = coalesce(overs_per_innings, case when year < 1987 then 60 else 50 end),
      expected_match_count = coalesce(expected_match_count, case year
        when 1975 then 15 when 1979 then 15 when 1983 then 27 when 1987 then 27
        when 1992 then 39 when 1996 then 37 when 1999 then 42 when 2003 then 54
        when 2007 then 51 when 2011 then 49 when 2015 then 49 when 2019 then 48
        when 2023 then 48 else null end),
      created_at = coalesce(created_at, now()),
      updated_at = now();

  update public.world_editions
  set status = 'pending',
      source_match_count = null,
      source_provider = null,
      source_url = null,
      license = null,
      season_id = null,
      imported_at = null,
      published_at = null,
      updated_at = now();

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'world_editions' and column_name = 'source_license') then
    execute 'update public.world_editions set source_license = null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'world_editions' and column_name = 'observed_match_count') then
    execute 'update public.world_editions set observed_match_count = null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'world_editions' and column_name = 'import_status') then
    execute 'update public.world_editions set import_status = null';
  end if;
end;
$$;

alter table public.world_editions alter column id set default gen_random_uuid();
update public.world_editions set id = gen_random_uuid() where id is null;
alter table public.world_editions alter column id set not null;
alter table public.world_editions alter column year set not null;
alter table public.world_editions alter column season_name set not null;
alter table public.world_editions alter column format set default 'ODI';
alter table public.world_editions alter column competition set default 'ICC Men''s Cricket World Cup';
alter table public.world_editions alter column status set default 'pending';
update public.world_editions set status = 'pending' where status is null;
alter table public.world_editions alter column status set not null;
alter table public.world_editions alter column created_at set default now();
alter table public.world_editions alter column created_at set not null;
alter table public.world_editions alter column updated_at set default now();
alter table public.world_editions alter column updated_at set not null;

-- Diagnose duplicate IDs before the unique index and role foreign key need them.
do $$
begin
  if exists (select 1 from public.world_editions group by id having count(*) > 1) then
    raise exception 'WORLD_MIGRATION_DUPLICATE_EDITION_ID: run SELECT id, count(*) FROM public.world_editions GROUP BY id HAVING count(*) > 1; and reconcile rows.';
  end if;
end;
$$;
create unique index if not exists world_editions_id_unique_idx on public.world_editions(id);

-- Add the season foreign key if it was not created by an earlier draft.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.world_editions'::regclass
      and contype = 'f'
      and confrelid = 'public.seasons'::regclass
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.world_editions'::regclass and attname = 'season_id')]::smallint[]
  ) then
    alter table public.world_editions
      add constraint world_editions_season_id_fk
      foreign key (season_id) references public.seasons(id) on delete restrict;
  end if;
end;
$$;

-- Mark every old generic team-season row as not belonging to a playable World edition.
alter table public.team_seasons add column if not exists world_edition_id uuid;
alter table public.team_seasons alter column world_edition_id drop not null;
update public.team_seasons set world_edition_id = null where world_edition_id is not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.team_seasons'::regclass
      and contype = 'f'
      and confrelid = 'public.world_editions'::regclass
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.team_seasons'::regclass and attname = 'world_edition_id')]::smallint[]
  ) then
    alter table public.team_seasons
      add constraint team_seasons_world_edition_id_fk
      foreign key (world_edition_id) references public.world_editions(id) on delete restrict;
  end if;
end;
$$;
create index if not exists team_seasons_world_edition_id_idx
  on public.team_seasons(world_edition_id)
  where world_edition_id is not null;

create table if not exists public.world_edition_player_roles (
  id uuid primary key default gen_random_uuid(),
  world_edition_id uuid not null references public.world_editions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  role text not null check (role in ('BAT', 'WK', 'AR', 'BOWL')),
  provider text not null check (provider in ('ICC', 'BOARD', 'ESPNCRICINFO')),
  source_url text not null check (source_url like 'https://%'),
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.world_edition_player_roles add column if not exists id uuid default gen_random_uuid();
alter table public.world_edition_player_roles add column if not exists world_edition_id uuid;
alter table public.world_edition_player_roles add column if not exists player_id uuid;
alter table public.world_edition_player_roles add column if not exists role text;
alter table public.world_edition_player_roles add column if not exists provider text;
alter table public.world_edition_player_roles add column if not exists source_url text;
alter table public.world_edition_player_roles add column if not exists retrieved_at timestamptz;
alter table public.world_edition_player_roles add column if not exists created_at timestamptz default now();
alter table public.world_edition_player_roles add column if not exists updated_at timestamptz default now();

-- No existing role row can prove an edition-specific role assignment; all editions are pending.
delete from public.world_edition_player_roles;
do $$
declare v_constraint record;
begin
  for v_constraint in select conname from pg_constraint
    where conrelid = 'public.world_edition_player_roles'::regclass and contype = 'c'
  loop
    execute format('alter table public.world_edition_player_roles drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;
update public.world_edition_player_roles set id = gen_random_uuid() where id is null;
alter table public.world_edition_player_roles alter column id set default gen_random_uuid();
alter table public.world_edition_player_roles alter column id set not null;
alter table public.world_edition_player_roles alter column world_edition_id set not null;
alter table public.world_edition_player_roles alter column player_id set not null;
alter table public.world_edition_player_roles alter column role set not null;
alter table public.world_edition_player_roles alter column provider set not null;
alter table public.world_edition_player_roles alter column source_url set not null;
alter table public.world_edition_player_roles alter column retrieved_at set not null;
alter table public.world_edition_player_roles alter column created_at set default now();
alter table public.world_edition_player_roles alter column created_at set not null;
alter table public.world_edition_player_roles alter column updated_at set default now();
alter table public.world_edition_player_roles alter column updated_at set not null;
create unique index if not exists world_edition_player_roles_id_unique_idx on public.world_edition_player_roles(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.world_edition_player_roles'::regclass
      and contype = 'f' and confrelid = 'public.world_editions'::regclass
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.world_edition_player_roles'::regclass and attname = 'world_edition_id')]::smallint[]
  ) then
    alter table public.world_edition_player_roles add constraint world_edition_player_roles_edition_fk
      foreign key (world_edition_id) references public.world_editions(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.world_edition_player_roles'::regclass
      and contype = 'f' and confrelid = 'public.players'::regclass
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.world_edition_player_roles'::regclass and attname = 'player_id')]::smallint[]
  ) then
    alter table public.world_edition_player_roles add constraint world_edition_player_roles_player_fk
      foreign key (player_id) references public.players(id) on delete cascade;
  end if;
end;
$$;

-- Remove any old policies so only published rows are publically readable.
do $$
declare v_policy record;
begin
  for v_policy in select policyname from pg_policies where schemaname = 'public' and tablename = 'world_editions' loop
    execute format('drop policy if exists %I on public.world_editions', v_policy.policyname);
  end loop;
  for v_policy in select policyname from pg_policies where schemaname = 'public' and tablename = 'world_edition_player_roles' loop
    execute format('drop policy if exists %I on public.world_edition_player_roles', v_policy.policyname);
  end loop;
end;
$$;
alter table public.world_editions enable row level security;
alter table public.world_edition_player_roles enable row level security;
create policy "Published World editions are readable" on public.world_editions
  for select to anon, authenticated using (status = 'published');
grant select on public.world_editions to anon, authenticated, service_role;
grant select, insert, update, delete on public.world_edition_player_roles to service_role;

comment on table public.world_editions is 'World Cup editions that are only playable after complete source and edition-specific role validation succeeds.';
comment on column public.team_seasons.world_edition_id is 'Non-null only for a team-season included in a published World edition; excludes generic IPL/other rows from World queries.';
comment on table public.world_edition_player_roles is 'Per-edition role and evidence, independent of global player role assignments.';

-- Duplicate preflight before creating constraints / conflict targets.
do $$
begin
  if exists (select 1 from public.world_editions group by year having count(*) > 1) then
    raise exception 'WORLD_MIGRATION_DUPLICATE_EDITION_YEAR: run SELECT year, count(*) FROM public.world_editions GROUP BY year HAVING count(*) > 1; and reconcile rows.';
  end if;
  if exists (select 1 from public.seasons group by year having count(*) > 1) then
    raise exception 'WORLD_MIGRATION_DUPLICATE_SEASON_YEAR: run SELECT year, count(*) FROM public.seasons GROUP BY year HAVING count(*) > 1; and reconcile rows.';
  end if;
  if exists (select 1 from public.teams group by slug having count(*) > 1) then
    raise exception 'WORLD_MIGRATION_DUPLICATE_TEAM_SLUG: run SELECT slug, count(*) FROM public.teams GROUP BY slug HAVING count(*) > 1; and reconcile rows.';
  end if;
  if exists (select 1 from public.team_seasons group by team_id, season_id having count(*) > 1) then
    raise exception 'WORLD_MIGRATION_DUPLICATE_TEAM_SEASON: reconcile duplicate (team_id, season_id) rows.';
  end if;
  if exists (select 1 from public.players where source_player_id is not null group by source_player_id having count(*) > 1) then
    raise exception 'WORLD_MIGRATION_DUPLICATE_PLAYER_IDENTITY: reconcile duplicate players.source_player_id values.';
  end if;
  if exists (select 1 from public.player_roles group by player_id, role having count(*) > 1) then
    raise exception 'WORLD_MIGRATION_DUPLICATE_PLAYER_ROLE: reconcile duplicate player_roles (player_id, role) rows.';
  end if;
  if exists (select 1 from public.player_season_stats group by player_id, team_season_id having count(*) > 1) then
    raise exception 'WORLD_MIGRATION_DUPLICATE_PLAYER_STATS: reconcile duplicate player_season_stats (player_id, team_season_id) rows.';
  end if;
end;
$$;

create unique index if not exists world_editions_year_unique_idx on public.world_editions(year);
create unique index if not exists world_editions_id_unique_idx on public.world_editions(id);
create unique index if not exists world_editions_season_id_unique_idx on public.world_editions(season_id) where season_id is not null;
create unique index if not exists seasons_year_unique_idx on public.seasons(year);
create unique index if not exists teams_slug_unique_idx on public.teams(slug);
create unique index if not exists team_seasons_team_season_unique_idx on public.team_seasons(team_id, season_id);
create unique index if not exists team_seasons_world_edition_team_unique_idx on public.team_seasons(world_edition_id, team_id) where world_edition_id is not null;
create unique index if not exists players_source_player_id_unique_idx on public.players(source_player_id) where source_player_id is not null;
create unique index if not exists player_roles_player_role_unique_idx on public.player_roles(player_id, role);
create unique index if not exists player_season_stats_player_team_season_unique_idx on public.player_season_stats(player_id, team_season_id);
create unique index if not exists world_edition_player_roles_unique on public.world_edition_player_roles(world_edition_id, player_id);

alter table public.world_editions add constraint world_editions_status_check check (status in ('pending', 'importing', 'published'));
alter table public.world_editions add constraint world_editions_expected_count_check check (expected_match_count is null or expected_match_count > 0);
alter table public.world_editions add constraint world_editions_source_count_check check (source_match_count is null or source_match_count >= 0);
alter table public.world_editions add constraint world_editions_published_metadata_check check (
  status <> 'published' or (
    season_id is not null
    and expected_match_count is not null
    and source_match_count is not null
    and source_match_count = expected_match_count
    and imported_at is not null
    and published_at is not null
    and format is not null and format = 'ODI'
    and competition is not null and competition = 'ICC Men''s Cricket World Cup'
    and overs_per_innings is not null and overs_per_innings = 50
    and source_provider is not null and source_provider = 'Cricsheet'
    and source_url is not null and source_url = 'https://cricsheet.org/downloads/'
    and license is not null and license = 'ODC-By-1.0'
    and year in (2003, 2007, 2011, 2015, 2019, 2023)
    and expected_match_count = case year
      when 2003 then 54 when 2007 then 51 when 2011 then 49
      when 2015 then 49 when 2019 then 48 when 2023 then 48 else null end
  )
);
alter table public.world_edition_player_roles add constraint world_edition_player_roles_role_check check (role in ('BAT', 'WK', 'AR', 'BOWL'));
alter table public.world_edition_player_roles add constraint world_edition_player_roles_provider_check check (provider in ('ICC', 'BOARD', 'ESPNCRICINFO'));
alter table public.world_edition_player_roles add constraint world_edition_player_roles_source_host_check check (
  (provider = 'ICC' and source_url ~* '^https://([a-z0-9-]+\.)*icc-cricket\.com([/:?#]|$)')
  or (provider = 'ESPNCRICINFO' and (source_url ~* '^https://([a-z0-9-]+\.)*espncricinfo\.com([/:?#]|$)' or source_url ~* '^https://core\.espnuk\.org([/:?#]|$)'))
  or (provider = 'BOARD' and source_url ~* '^https://([a-z0-9-]+\.)+[a-z]{2,}(:[0-9]+)?([/?#]|$)')
);

-- Seed registry metadata only. All source counts remain NULL and all editions pending.
insert into public.world_editions (
  year, season_name, format, competition, overs_per_innings, expected_match_count,
  source_match_count, source_provider, source_url, license, season_id, status, imported_at, published_at, updated_at
) values
  (2003, 'ICC Men''s Cricket World Cup 2003', 'ODI', 'ICC Men''s Cricket World Cup', 50, 54, null, 'Cricsheet', 'https://cricsheet.org/downloads/', 'ODC-By-1.0', null, 'pending', null, null, now()),
  (2007, 'ICC Men''s Cricket World Cup 2007', 'ODI', 'ICC Men''s Cricket World Cup', 50, 51, null, 'Cricsheet', 'https://cricsheet.org/downloads/', 'ODC-By-1.0', null, 'pending', null, null, now()),
  (2011, 'ICC Men''s Cricket World Cup 2011', 'ODI', 'ICC Men''s Cricket World Cup', 50, 49, null, 'Cricsheet', 'https://cricsheet.org/downloads/', 'ODC-By-1.0', null, 'pending', null, null, now()),
  (2015, 'ICC Men''s Cricket World Cup 2015', 'ODI', 'ICC Men''s Cricket World Cup', 50, 49, null, 'Cricsheet', 'https://cricsheet.org/downloads/', 'ODC-By-1.0', null, 'pending', null, null, now()),
  (2019, 'ICC Men''s Cricket World Cup 2019', 'ODI', 'ICC Men''s Cricket World Cup', 50, 48, null, 'Cricsheet', 'https://cricsheet.org/downloads/', 'ODC-By-1.0', null, 'pending', null, null, now()),
  (2023, 'ICC Men''s Cricket World Cup 2023', 'ODI', 'ICC Men''s Cricket World Cup', 50, 48, null, 'Cricsheet', 'https://cricsheet.org/downloads/', 'ODC-By-1.0', null, 'pending', null, null, now())
on conflict (year) do update set
  season_name = excluded.season_name, format = excluded.format, competition = excluded.competition,
  overs_per_innings = excluded.overs_per_innings, expected_match_count = excluded.expected_match_count,
  source_match_count = null, source_provider = excluded.source_provider, source_url = excluded.source_url,
  license = excluded.license, season_id = null, status = 'pending', imported_at = null, published_at = null, updated_at = now();

create or replace function public.import_world_edition(
  p_edition jsonb,
  p_expected_match_count integer,
  p_source_match_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year integer;
  v_season_name text;
  v_overs integer;
  v_edition_id uuid;
  v_season_id uuid;
  v_team_id uuid;
  v_team_season_id uuid;
  v_player_id uuid;
  v_team jsonb;
  v_player jsonb;
  v_stats jsonb;
  v_role_source jsonb;
  v_source_player_id text;
  v_source_id text;
  v_team_slug text;
  v_full_name text;
  v_role text;
  v_role_provider text;
  v_role_url text;
  v_role_retrieved_at timestamptz;
  v_expected integer;
  v_configured_expected integer;
  v_player_count integer;
  v_wk integer;
  v_bat integer;
  v_ar integer;
  v_bowl integer;
  v_total_players integer;
  v_distinct_players integer;
begin
  if p_edition is null or jsonb_typeof(p_edition) <> 'object' then
    raise exception 'IMPORT_INVALID_PAYLOAD: p_edition must be a JSON object.';
  end if;
  if jsonb_typeof(p_edition->'year') <> 'number'
     or coalesce(p_edition->>'year', '') !~ '^[0-9]{4}$'
     or jsonb_typeof(p_edition->'teams') <> 'array' then
    raise exception 'IMPORT_INVALID_PAYLOAD: edition requires a four-digit integer year and teams array.';
  end if;
  if jsonb_typeof(p_edition->'oversPerInnings') <> 'number'
     or coalesce(p_edition->>'oversPerInnings', '') !~ '^[0-9]+$'
     or jsonb_typeof(p_edition->'expectedMatchCount') <> 'number'
     or coalesce(p_edition->>'expectedMatchCount', '') !~ '^[0-9]+$'
     or jsonb_typeof(p_edition->'sourceMatchCount') <> 'number'
     or coalesce(p_edition->>'sourceMatchCount', '') !~ '^[0-9]+$' then
    raise exception 'IMPORT_INVALID_METADATA: oversPerInnings, expectedMatchCount and sourceMatchCount must be integer JSON numbers.';
  end if;
  if p_expected_match_count is null or p_expected_match_count <= 0
     or p_source_match_count is null
     or p_source_match_count <> p_expected_match_count then
    raise exception 'IMPORT_INCOMPLETE_SOURCE: source matches (%) must equal expected matches (%).', p_source_match_count, p_expected_match_count;
  end if;

  v_year := (p_edition->>'year')::integer;
  v_season_name := p_edition->>'seasonName';
  v_overs := (p_edition->>'oversPerInnings')::integer;
  v_expected := (p_edition->>'expectedMatchCount')::integer;

  v_configured_expected := case v_year
    when 2003 then 54
    when 2007 then 51
    when 2011 then 49
    when 2015 then 49
    when 2019 then 48
    when 2023 then 48
    else null
  end;

  if v_configured_expected is null then
    raise exception 'IMPORT_UNSUPPORTED_EDITION: % is not enabled for the Cricsheet-only phase.', v_year;
  end if;
  if p_expected_match_count is distinct from v_configured_expected
     or v_expected is distinct from v_configured_expected then
    raise exception 'IMPORT_EXPECTED_COUNT_MISMATCH: % must contain exactly % matches, but payload/arguments declare %/%.' , v_year, v_configured_expected, v_expected, p_expected_match_count;
  end if;
  if v_season_name is null or btrim(v_season_name) = ''
     or p_edition->>'format' is distinct from 'ODI'
     or p_edition->>'competition' is distinct from 'ICC Men''s Cricket World Cup'
     or v_overs is distinct from 50
     or p_edition->>'sourceProvider' is distinct from 'Cricsheet'
     or p_edition->>'sourceUrl' is distinct from 'https://cricsheet.org/downloads/'
     or p_edition->>'license' is distinct from 'ODC-By-1.0'
     or p_edition->>'coverageStatus' is distinct from 'complete'
     or v_expected is distinct from p_expected_match_count
     or (p_edition->>'sourceMatchCount')::integer is distinct from p_source_match_count then
    raise exception 'IMPORT_INVALID_METADATA: edition metadata, attribution, license, or complete coverage marker is invalid for %.', v_year;
  end if;

  if jsonb_array_length(p_edition->'teams') < 2 then
    raise exception 'IMPORT_INVALID_TEAMS: % must contain at least two teams.', v_year;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_edition->'teams') as t(value)
    where nullif(btrim(t.value->>'name'), '') is null
       or nullif(btrim(t.value->>'shortName'), '') is null
       or nullif(btrim(t.value->>'slug'), '') is null
       or jsonb_typeof(t.value->'players') is distinct from 'array'
  ) or (
    select count(*) from jsonb_array_elements(p_edition->'teams')
  ) <> (
    select count(distinct t.value->>'slug') from jsonb_array_elements(p_edition->'teams') as t(value)
  ) then
    raise exception 'IMPORT_INVALID_TEAMS: % contains invalid or duplicate team metadata.', v_year;
  end if;

  select count(*), count(distinct p.value->>'sourcePlayerId')
    into v_total_players, v_distinct_players
  from jsonb_array_elements(p_edition->'teams') as t(value)
  cross join lateral jsonb_array_elements(coalesce(t.value->'players', '[]'::jsonb)) as p(value);

  if v_total_players = 0 or v_total_players <> v_distinct_players then
    raise exception 'IMPORT_DUPLICATE_OR_MISSING_PLAYER: % contains no player data or duplicate canonical player IDs across teams.', v_year;
  end if;

  -- Validate every row before the first write; database constraints still remain the final guard.
  for v_team in select value from jsonb_array_elements(p_edition->'teams') as e(value) loop
    if nullif(btrim(v_team->>'name'), '') is null
       or nullif(btrim(v_team->>'shortName'), '') is null
       or nullif(btrim(v_team->>'slug'), '') is null
       or jsonb_typeof(v_team->'players') <> 'array'
       or jsonb_array_length(v_team->'players') < 11 then
      raise exception 'IMPORT_INVALID_TEAM: % has invalid team metadata or fewer than 11 players.', v_year;
    end if;

    select
      count(*) filter (where p.value->>'role' = 'WK'),
      count(*) filter (where p.value->>'role' = 'BAT'),
      count(*) filter (where p.value->>'role' = 'AR'),
      count(*) filter (where p.value->>'role' = 'BOWL')
      into v_wk, v_bat, v_ar, v_bowl
    from jsonb_array_elements(v_team->'players') as p(value);

    if not (v_wk >= 1 and v_bat >= 4 and v_ar >= 1 and v_bowl >= 3 and v_ar + v_bowl >= 5) then
      raise exception 'IMPORT_INVALID_ROLE_POOL: %/% cannot form a valid XI from verified roles.', v_year, v_team->>'name';
    end if;

    for v_player in select value from jsonb_array_elements(v_team->'players') as p(value) loop
      v_source_player_id := v_player->>'sourcePlayerId';
      v_full_name := v_player->>'fullName';
      v_role := v_player->>'role';
      v_stats := v_player->'stats';
      v_role_source := v_player->'roleSource';

      if v_source_player_id is null
         or v_source_player_id !~ '^cricsheet:[0-9a-f]{8}$'
         or nullif(btrim(v_full_name), '') is null then
        raise exception 'IMPORT_INVALID_PLAYER: %/% contains invalid canonical ID or blank name.', v_year, v_team->>'name';
      end if;
      if v_role is null or v_role not in ('BAT', 'WK', 'AR', 'BOWL') then
        raise exception 'IMPORT_INVALID_ROLE: %/% has an invalid role for %.', v_year, v_team->>'name', v_full_name;
      end if;
      if jsonb_typeof(v_stats) <> 'object' then
        raise exception 'IMPORT_INVALID_STATS: %/%/% has no stats object.', v_year, v_team->>'name', v_full_name;
      end if;
      if v_role_source is null
         or v_role_source->>'provider' is null
         or v_role_source->>'provider' not in ('ICC', 'BOARD', 'ESPNCRICINFO')
         or nullif(v_role_source->>'url', '') is null
         or v_role_source->>'url' !~* '^https://'
         or (v_role_source->>'provider' = 'ICC' and v_role_source->>'url' !~* '^https://([a-z0-9-]+\.)*icc-cricket\.com([/:?#]|$)')
         or (v_role_source->>'provider' = 'ESPNCRICINFO' and v_role_source->>'url' !~* '^https://(([a-z0-9-]+\.)*espncricinfo\.com|core\.espnuk\.org)([/:?#]|$)')
         or nullif(v_role_source->>'retrievedAt', '') is null then
        raise exception 'IMPORT_INVALID_ROLE_SOURCE: %/%/% must have an approved provider, HTTPS URL, and retrieval timestamp.', v_year, v_team->>'name', v_full_name;
      end if;

      if exists (
        select 1 from unnest(array['matches','innings','runs','hundreds','fifties','wickets','catches','stumpings']) as k(key)
        where coalesce(v_stats->>k.key, '') !~ '^[0-9]+$'
      ) then
        raise exception 'IMPORT_INVALID_INTEGER_STATS: %/%/% has a missing, negative, or non-integer statistic.', v_year, v_team->>'name', v_full_name;
      end if;
      if exists (
        select 1 from unnest(array['batting_average','strike_rate','bowling_average','economy']) as k(key)
        where jsonb_typeof(v_stats->k.key) is distinct from 'null'
          and (
            jsonb_typeof(v_stats->k.key) is distinct from 'number'
            or coalesce(v_stats->>k.key, '') !~ '^[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
          )
      ) then
        raise exception 'IMPORT_INVALID_DECIMAL_STATS: %/%/% has an invalid average or rate.', v_year, v_team->>'name', v_full_name;
      end if;
      if (v_stats->>'innings')::integer > (v_stats->>'matches')::integer
         or (v_stats->>'hundreds')::integer + (v_stats->>'fifties')::integer > (v_stats->>'innings')::integer then
        raise exception 'IMPORT_INCONSISTENT_STATS: %/%/% has inconsistent innings/50s/100s statistics.', v_year, v_team->>'name', v_full_name;
      end if;
    end loop;
  end loop;

  insert into public.world_editions (
    year, season_name, format, competition, overs_per_innings,
    expected_match_count, source_match_count, source_provider,
    source_url, license, status, imported_at, published_at, updated_at
  ) values (
    v_year, v_season_name, 'ODI', 'ICC Men''s Cricket World Cup', v_overs,
    p_expected_match_count, p_source_match_count, 'Cricsheet',
    p_edition->>'sourceUrl', 'ODC-By-1.0', 'importing', null, null, now()
  )
  on conflict (year) do update set
    season_name = excluded.season_name,
    format = excluded.format,
    competition = excluded.competition,
    overs_per_innings = excluded.overs_per_innings,
    expected_match_count = excluded.expected_match_count,
    source_match_count = null,
    source_provider = excluded.source_provider,
    source_url = excluded.source_url,
    license = excluded.license,
    status = 'importing',
    imported_at = null,
    published_at = null,
    updated_at = now()
  returning id into v_edition_id;

  insert into public.seasons(year)
  values (v_year)
  on conflict (year) do update set year = excluded.year
  returning id into v_season_id;

  -- Idempotent replacement: detach teams removed from the new edition snapshot,
  -- clear old stats for this edition, and remove its stale role rows. If any later
  -- statement fails, PostgreSQL rolls back these deletes with the whole RPC.
  delete from public.player_season_stats pss
  using public.team_seasons ts
  where pss.team_season_id = ts.id
    and ts.world_edition_id = v_edition_id;

  update public.team_seasons ts
  set world_edition_id = null
  from public.teams t
  where ts.team_id = t.id
    and ts.world_edition_id = v_edition_id
    and not exists (
      select 1
      from jsonb_array_elements(p_edition->'teams') as input_team(value)
      where input_team.value->>'slug' = t.slug
    );

  delete from public.world_edition_player_roles
  where world_edition_id = v_edition_id;

  for v_team in select value from jsonb_array_elements(p_edition->'teams') as e(value) loop
    v_team_slug := v_team->>'slug';
    insert into public.teams(name, short_name, slug)
    values (v_team->>'name', v_team->>'shortName', v_team_slug)
    on conflict (slug) do update set
      name = excluded.name,
      short_name = excluded.short_name
    returning id into v_team_id;

    v_team_season_id := null;
    insert into public.team_seasons(team_id, season_id, world_edition_id)
    values (v_team_id, v_season_id, v_edition_id)
    on conflict (team_id, season_id) do update set
      world_edition_id = excluded.world_edition_id
    where public.team_seasons.world_edition_id is null
       or public.team_seasons.world_edition_id = excluded.world_edition_id
    returning id into v_team_season_id;

    if v_team_season_id is null then
      raise exception 'IMPORT_TEAM_SEASON_COLLISION: %/% already belongs to another World edition.', v_year, v_team->>'name';
    end if;

    for v_player in select value from jsonb_array_elements(v_team->'players') as p(value) loop
      v_source_player_id := v_player->>'sourcePlayerId';
      v_source_id := regexp_replace(v_source_player_id, '^cricsheet:', '');
      v_full_name := v_player->>'fullName';
      v_role := v_player->>'role';
      v_stats := v_player->'stats';
      v_role_source := v_player->'roleSource';
      v_role_provider := v_role_source->>'provider';
      v_role_url := v_role_source->>'url';
      begin
        v_role_retrieved_at := (v_role_source->>'retrievedAt')::timestamptz;
      exception when others then
        raise exception 'IMPORT_INVALID_ROLE_SOURCE_TIMESTAMP: %/%/% has an invalid retrievedAt timestamp.', v_year, v_team->>'name', v_full_name;
      end;
      if v_role_retrieved_at > now() + interval '1 day' then
        raise exception 'IMPORT_INVALID_ROLE_SOURCE_TIMESTAMP: %/%/% retrievedAt must not be in the future.', v_year, v_team->>'name', v_full_name;
      end if;

      v_player_id := null;
      insert into public.players(full_name, source_player_id)
      values (v_full_name, v_source_player_id)
      on conflict (source_player_id) where source_player_id is not null do update set
        full_name = excluded.full_name
      where public.players.full_name = excluded.full_name
      returning id into v_player_id;

      if v_player_id is null then
        raise exception 'IMPORT_PLAYER_IDENTITY_COLLISION: canonical ID % is already assigned to a different name.', v_source_player_id;
      end if;

      insert into public.player_roles(player_id, role)
      values (v_player_id, v_role)
      on conflict (player_id, role) do nothing;

      insert into public.player_season_stats(
        player_id, team_season_id, matches, innings, runs,
        batting_average, strike_rate, hundreds, fifties, wickets,
        bowling_average, economy, catches, stumpings
      ) values (
        v_player_id, v_team_season_id,
        (v_stats->>'matches')::integer,
        (v_stats->>'innings')::integer,
        (v_stats->>'runs')::integer,
        case when jsonb_typeof(v_stats->'batting_average') = 'null' then null else (v_stats->>'batting_average')::numeric end,
        case when jsonb_typeof(v_stats->'strike_rate') = 'null' then null else (v_stats->>'strike_rate')::numeric end,
        (v_stats->>'hundreds')::integer,
        (v_stats->>'fifties')::integer,
        (v_stats->>'wickets')::integer,
        case when jsonb_typeof(v_stats->'bowling_average') = 'null' then null else (v_stats->>'bowling_average')::numeric end,
        case when jsonb_typeof(v_stats->'economy') = 'null' then null else (v_stats->>'economy')::numeric end,
        (v_stats->>'catches')::integer,
        (v_stats->>'stumpings')::integer
      )
      on conflict (player_id, team_season_id) do update set
        matches = excluded.matches,
        innings = excluded.innings,
        runs = excluded.runs,
        batting_average = excluded.batting_average,
        strike_rate = excluded.strike_rate,
        hundreds = excluded.hundreds,
        fifties = excluded.fifties,
        wickets = excluded.wickets,
        bowling_average = excluded.bowling_average,
        economy = excluded.economy,
        catches = excluded.catches,
        stumpings = excluded.stumpings;

      insert into public.world_player_sources(
        player_id, provider, source_player_id, source_url, retrieved_at, updated_at
      ) values (
        v_player_id, 'Cricsheet', v_source_id,
        'https://cricsheet.org/register/', now(), now()
      )
      on conflict (provider, source_player_id) do update set
        source_url = excluded.source_url,
        retrieved_at = excluded.retrieved_at,
        updated_at = now()
      where public.world_player_sources.player_id = excluded.player_id;

      if not found then
        raise exception 'IMPORT_SOURCE_IDENTITY_COLLISION: Cricsheet Register ID % is linked to another player.', v_source_id;
      end if;

      insert into public.world_edition_player_roles(
        world_edition_id, player_id, role, provider, source_url, retrieved_at, updated_at
      ) values (
        v_edition_id, v_player_id, v_role, v_role_provider, v_role_url, v_role_retrieved_at, now()
      )
      on conflict (world_edition_id, player_id) do update set
        role = excluded.role,
        provider = excluded.provider,
        source_url = excluded.source_url,
        retrieved_at = excluded.retrieved_at,
        updated_at = now();
    end loop;
  end loop;

  update public.world_editions
  set season_id = v_season_id,
      source_match_count = p_source_match_count,
      status = 'published',
      imported_at = now(),
      published_at = now(),
      updated_at = now()
  where id = v_edition_id;

  return jsonb_build_object(
    'year', v_year,
    'worldEditionId', v_edition_id,
    'seasonId', v_season_id,
    'status', 'published',
    'sourceMatches', p_source_match_count,
    'expectedMatches', p_expected_match_count,
    'teamCount', jsonb_array_length(p_edition->'teams')
  );
end;
$$;

revoke all on function public.import_world_edition(jsonb, integer, integer) from public;
revoke all on function public.import_world_edition(jsonb, integer, integer) from anon, authenticated;
grant execute on function public.import_world_edition(jsonb, integer, integer) to service_role;

commit;
