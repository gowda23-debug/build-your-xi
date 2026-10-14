
-- World Cup edition registry.
-- An edition remains unavailable until its data and player pool have
-- passed validation and an authorized operator explicitly publishes it.

create table if not exists public.world_editions (
  year integer primary key
    check (year between 1975 and 2100),

  season_name text not null,
  competition text not null
    default 'ICC Men''s Cricket World Cup',

  format text not null default 'ODI'
    check (format = 'ODI'),

  overs_per_innings integer not null
    check (overs_per_innings in (50, 60)),

  expected_match_count integer not null
    check (expected_match_count > 0),

  observed_match_count integer
    check (
      observed_match_count is null
      or observed_match_count >= 0
    ),

  source_provider text not null
    check (
      source_provider in (
        'Cricsheet',
        'ICC',
        'NationalBoard',
        'LicensedProvider'
      )
    ),

  source_url text not null,
  source_license text,

  import_status text not null default 'pending'
    check (
      import_status in (
        'pending',
        'downloading',
        'incomplete',
        'validated',
        'published',
        'blocked'
      )
    ),

  published_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint world_editions_publish_consistency
    check (
      (
        import_status = 'published'
        and published_at is not null
      )
      or
      (
        import_status <> 'published'
        and published_at is null
      )
    )
);

create index if not exists world_editions_status_year_idx
  on public.world_editions (import_status, year);

alter table public.world_editions enable row level security;

drop policy if exists
  "Published World editions are publicly readable"
  on public.world_editions;

create policy "Published World editions are publicly readable"
  on public.world_editions
  for select
  using (import_status = 'published');

-- Seed edition metadata, not player data.
-- All editions remain unavailable until validated and explicitly published.
insert into public.world_editions (
  year,
  season_name,
  overs_per_innings,
  expected_match_count,
  source_provider,
  source_url,
  source_license,
  import_status
)
values
  (
    1975,
    'ICC Men''s Cricket World Cup 1975',
    60,
    15,
    'ICC',
    'https://www.icc-cricket.com/',
    null,
    'pending'
  ),
  (
    1979,
    'ICC Men''s Cricket World Cup 1979',
    60,
    15,
    'ICC',
    'https://www.icc-cricket.com/',
    null,
    'pending'
  ),
  (
    1983,
    'ICC Men''s Cricket World Cup 1983',
    60,
    27,
    'ICC',
    'https://www.icc-cricket.com/',
    null,
    'pending'
  ),
  (
    1987,
    'ICC Men''s Cricket World Cup 1987',
    50,
    27,
    'ICC',
    'https://www.icc-cricket.com/',
    null,
    'pending'
  ),
  (
    1992,
    'ICC Men''s Cricket World Cup 1992',
    50,
    39,
    'ICC',
    'https://www.icc-cricket.com/',
    null,
    'pending'
  ),
  (
    1996,
    'ICC Men''s Cricket World Cup 1996',
    50,
    37,
    'ICC',
    'https://www.icc-cricket.com/',
    null,
    'pending'
  ),
  (
    1999,
    'ICC Men''s Cricket World Cup 1999',
    50,
    42,
    'ICC',
    'https://www.icc-cricket.com/',
    null,
    'pending'
  ),
  (
    2003,
    'ICC Men''s Cricket World Cup 2003',
    50,
    54,
    'Cricsheet',
    'https://cricsheet.org/downloads/',
    'ODC-By-1.0',
    'pending'
  ),
  (
    2007,
    'ICC Men''s Cricket World Cup 2007',
    50,
    51,
    'Cricsheet',
    'https://cricsheet.org/downloads/',
    'ODC-By-1.0',
    'pending'
  ),
  (
    2011,
    'ICC Men''s Cricket World Cup 2011',
    50,
    49,
    'Cricsheet',
    'https://cricsheet.org/downloads/',
    'ODC-By-1.0',
    'pending'
  ),
  (
    2015,
    'ICC Men''s Cricket World Cup 2015',
    50,
    49,
    'Cricsheet',
    'https://cricsheet.org/downloads/',
    'ODC-By-1.0',
    'pending'
  ),
  (
    2019,
    'ICC Men''s Cricket World Cup 2019',
    50,
    48,
    'Cricsheet',
    'https://cricsheet.org/downloads/',
    'ODC-By-1.0',
    'pending'
  ),
  (
    2023,
    'ICC Men''s Cricket World Cup 2023',
    50,
    48,
    'Cricsheet',
    'https://cricsheet.org/downloads/',
    'ODC-By-1.0',
    'pending'
  )
on conflict (year) do nothing;
