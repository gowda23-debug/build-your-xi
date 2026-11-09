begin;

-- The October 15 RPC is a legacy path: it defaults invalid roles to BAT and
-- trusts incomplete metadata. Remove it so there is only one publication path.
drop function if exists public.import_world_edition_atomic(jsonb);

-- Pending editions may have no source metadata. Reset all existing World
-- publication markers so old/unverified imports are not exposed as valid.
-- This does not delete player/season rows and does not affect IPL data.
alter table public.world_editions
  alter column source_provider drop not null,
  alter column source_url drop not null,
  alter column license drop not null,
  alter column source_match_count drop not null;

-- Remove known historical World-edition checks before restoring a narrow set.
alter table public.world_editions drop constraint if exists world_editions_year_check;
alter table public.world_editions drop constraint if exists world_editions_format_check;
alter table public.world_editions drop constraint if exists world_editions_status_check;
alter table public.world_editions drop constraint if exists world_editions_source_provider_check;
alter table public.world_editions drop constraint if exists world_editions_source_url_check;
alter table public.world_editions drop constraint if exists world_editions_license_check;
alter table public.world_editions drop constraint if exists world_editions_overs_check;
alter table public.world_editions drop constraint if exists world_editions_competition_check;
alter table public.world_editions drop constraint if exists world_editions_published_gate_check;

update public.world_editions
set status = 'pending',
    source_match_count = null,
    source_provider = null,
    source_url = null,
    license = null,
    imported_at = null,
    published_at = null,
    updated_at = now();

alter table public.world_editions
  add constraint world_editions_year_check
    check (year between 1975 and 2100),
  add constraint world_editions_format_check
    check (format = 'ODI'),
  add constraint world_editions_status_check
    check (status in ('pending', 'importing', 'published')),
  add constraint world_editions_overs_check
    check (overs_per_innings in (50, 60)),
  add constraint world_editions_competition_check
    check (competition = 'ICC Men''s Cricket World Cup'),
  add constraint world_editions_source_provider_check
    check (source_provider is null or source_provider = 'Cricsheet'),
  add constraint world_editions_source_url_check
    check (source_url is null or source_url = 'https://cricsheet.org/downloads/'),
  add constraint world_editions_license_check
    check (license is null or license = 'ODC-By-1.0'),
  add constraint world_editions_published_gate_check
    check (
      status <> 'published'
      or (
        year in (2003, 2007, 2011, 2015, 2019, 2023)
        and source_provider = 'Cricsheet'
        and source_url = 'https://cricsheet.org/downloads/'
        and license = 'ODC-By-1.0'
        and source_match_count is not null
        and source_match_count = expected_match_count
        and expected_match_count = case year
          when 2003 then 54
          when 2007 then 51
          when 2011 then 49
          when 2015 then 49
          when 2019 then 48
          when 2023 then 48
          else -1
        end
      )
    );

-- Only the service role can call the strict importer. The function itself
-- validates supported year, exact match coverage, source IDs, explicit roles,
-- role evidence, team composition, stats, and player uniqueness.
revoke all on function public.import_world_edition(jsonb, integer, integer) from public;
revoke all on function public.import_world_edition(jsonb, integer, integer) from anon;
revoke all on function public.import_world_edition(jsonb, integer, integer) from authenticated;
grant execute on function public.import_world_edition(jsonb, integer, integer) to service_role;

commit;
