create table if not exists public.world_player_sources (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  provider text not null,
  source_player_id text not null,
  source_url text,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_player_sources_provider_source_unique
    unique (provider, source_player_id)
);

create index if not exists world_player_sources_player_id_idx
  on public.world_player_sources(player_id);

create index if not exists world_player_sources_provider_idx
  on public.world_player_sources(provider);

alter table public.world_player_sources enable row level security;

drop policy if exists "World player sources are publicly readable" on public.world_player_sources;
create policy "World player sources are publicly readable"
  on public.world_player_sources
  for select
  using (true);

comment on table public.world_player_sources is
  'Provider-specific identities linked to the canonical World player record.';

comment on column public.players.source_player_id is
  'Canonical Cricsheet Register identifier for World players. Provider-specific IDs are stored in world_player_sources.';
