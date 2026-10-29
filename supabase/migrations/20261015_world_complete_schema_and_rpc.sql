begin;

-- Ensure public.world_editions has required columns
create table if not exists public.world_editions (
  id uuid primary key default gen_random_uuid(),
  year integer not null unique check (year between 1975 and 2100),
  season_name text not null,
  competition text not null default 'ICC Men''s Cricket World Cup',
  format text not null default 'ODI',
  overs_per_innings integer not null default 50,
  expected_match_count integer not null default 15,
  playable_match_count integer not null default 15,
  source_match_count integer not null default 0,
  source_provider text not null default 'Hybrid',
  source_url text not null default 'https://cricsheet.org/downloads/',
  license text not null default 'ODC-By-1.0',
  season_id uuid references public.seasons(id) on delete restrict,
  status text not null default 'pending',
  imported_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Drop legacy restrictive constraints if present
do $$
declare
  r record;
begin
  for r in (
    select conname
    from pg_constraint
    where conrelid = 'public.world_editions'::regclass
      and contype = 'c'
  ) loop
    execute format('alter table public.world_editions drop constraint if exists %I', r.conname);
  end loop;
end;
$$;  alter table public.world_editions add constraint world_editions_year_check check (year between 1975 and 2100), add constraint world_editions_format_check check (format = 'ODI'), add constraint world_editions_status_check check (status in ('pending', 'importing', 'published'));  -- Ensure team_seasons has world_edition_id alter table public.team_seasons add column if not exists world_edition_id uuid references public.world_editions(id) on delete cascade;  -- Atomic RPC function matching your exact table schemas create or replace function public.import_world_edition_atomic(payload jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_year integer;
  v_season_name text;
  v_overs integer;
  v_source_provider text;
  v_source_url text;
  v_license text;
  v_source_match_count integer;
  v_edition_id uuid;
  v_season_id uuid;
  v_team jsonb;
  v_player jsonb;
  v_team_id uuid;
  v_team_season_id uuid;
  v_player_id uuid;
  v_role text;
  v_teams_imported integer := 0;
  v_players_imported integer := 0;
begin
  v_year := (payload->>'year')::integer;
  v_season_name := coalesce(payload->>'seasonName', format('ICC Men''s Cricket World Cup %s', v_year));
  v_overs := coalesce((payload->>'oversPerInnings')::integer, case when v_year <= 1983 then 60 else 50 end);
  v_source_provider := coalesce(payload->>'sourceProvider', 'Hybrid');
  v_source_url := coalesce(payload->>'sourceUrl', 'https://cricsheet.org/downloads/');
  v_license := coalesce(payload->>'license', 'ODC-By-1.0');
  v_source_match_count := coalesce((payload->>'sourceMatchCount')::integer, 0);

  if v_year is null or v_year < 1975 then
    raise exception 'INVALID_WORLD_EDITION_YEAR: %', v_year;
  end if;

  if jsonb_typeof(payload->'teams') <> 'array' or jsonb_array_length(payload->'teams') < 6 then
    raise exception 'INVALID_WORLD_EDITION_TEAMS: edition % must contain at least 6 national teams', v_year;
  end if;

  -- 1. Upsert season (using only the `year` column)
  insert into public.seasons (year)
  values (v_year)
  on conflict (year) do update
    set year = excluded.year
  returning id into v_season_id;

  -- 2. Lock & update world_editions row
  insert into public.world_editions (
    year,
    season_name,
    overs_per_innings,
    expected_match_count,
    playable_match_count,
    source_match_count,
    source_provider,
    source_url,
    license,
    season_id,
    status,
    imported_at,
    updated_at
  )
  values (
    v_year,
    v_season_name,
    v_overs,
    coalesce((payload->>'expectedMatchCount')::integer, v_source_match_count),
    coalesce((payload->>'playableMatchCount')::integer, v_source_match_count),
    v_source_match_count,
    v_source_provider,
    v_source_url,
    v_license,
    v_season_id,
    'importing',
    now(),
    now()
  )
  on conflict (year) do update
  set
    season_name = excluded.season_name,
    overs_per_innings = excluded.overs_per_innings,
    source_match_count = excluded.source_match_count,
    source_provider = excluded.source_provider,
    source_url = excluded.source_url,
    license = excluded.license,
    season_id = excluded.season_id,
    status = 'importing',
    imported_at = now(),
    updated_at = now()
  returning id into v_edition_id;

  -- 3. Iterate teams and players
  for v_team in select * from jsonb_array_elements(payload->'teams')
  loop
    insert into public.teams (name)
    values (v_team->>'name')
    on conflict (name) do update
      set name = excluded.name
    returning id into v_team_id;

    insert into public.team_seasons (team_id, season_id, world_edition_id)
    values (v_team_id, v_season_id, v_edition_id)
    on conflict (team_id, season_id) do update
      set world_edition_id = excluded.world_edition_id
    returning id into v_team_season_id;

    delete from public.player_season_stats where team_season_id = v_team_season_id;
    v_teams_imported := v_teams_imported + 1;

    for v_player in select * from jsonb_array_elements(v_team->'players')
    loop
      v_role := upper(trim(coalesce(v_player->>'role', 'BAT')));
      if v_role not in ('BAT', 'WK', 'AR', 'BOWL') then
        v_role := 'BAT';
      end if;

      insert into public.players (name)
      values (v_player->>'name')
      on conflict (name) do update
        set name = excluded.name
      returning id into v_player_id;

      insert into public.player_roles (player_id, role)
      values (v_player_id, v_role)
      on conflict (player_id) do update
        set role = excluded.role;

      insert into public.player_season_stats (
        player_id,
        team_season_id,
        matches,
        innings,
        runs,
        batting_average,
        strike_rate,
        hundreds,
        fifties,
        wickets,
        bowling_average,
        economy,
        catches,
        stumpings
      )
      values (
        v_player_id,
        v_team_season_id,
        coalesce((v_player->'stats'->>'matches')::integer, 0),
        coalesce((v_player->'stats'->>'innings')::integer, 0),
        coalesce((v_player->'stats'->>'runs')::integer, 0),
        (v_player->'stats'->>'battingAverage')::numeric,
        (v_player->'stats'->>'strikeRate')::numeric,
        coalesce((v_player->'stats'->>'hundreds')::integer, 0),
        coalesce((v_player->'stats'->>'fifties')::integer, 0),
        coalesce((v_player->'stats'->>'wickets')::integer, 0),
        (v_player->'stats'->>'bowlingAverage')::numeric,
        (v_player->'stats'->>'economy')::numeric,
        coalesce((v_player->'stats'->>'catches')::integer, 0),
        coalesce((v_player->'stats'->>'stumpings')::integer, 0)
      );

      v_players_imported := v_players_imported + 1;
    end loop;
  end loop;

  update public.world_editions
  set
    status = 'published',
    published_at = now(),
    updated_at = now()
  where id = v_edition_id;

  return jsonb_build_object(
    'editionId', v_edition_id,
    'year', v_year,
    'teamsImported', v_teams_imported,
    'playersImported', v_players_imported,
    'status', 'published'
  );
end;
$$;

commit;