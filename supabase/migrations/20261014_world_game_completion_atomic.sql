begin;

create or replace function public.complete_world_game(
  p_game_session_id uuid,
  p_user_id uuid,
  p_challenge_id uuid,
  p_score integer,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.game_sessions%rowtype;
  v_context_challenge text;
  v_context_challenge_id uuid;
  v_authoritative_challenge_id uuid;
  v_game_score_id uuid;
  v_created_at timestamptz;
  v_existing_score integer;
  v_existing_score_count integer;
  v_score_found boolean;
begin
  if p_game_session_id is null or p_user_id is null then
    raise exception
      'WORLD_GAME_INVALID_REQUEST: game session and user IDs are required.';
  end if;

  if p_score is null or p_score < 0 then
    raise exception
      'WORLD_GAME_INVALID_SCORE: score must be a non-negative integer.';
  end if;

  if p_result is null
     or jsonb_typeof(p_result) <> 'object'
     or p_result->>'gameMode' is distinct from 'world'
     or p_result->>'score' is distinct from p_score::text then
    raise exception
      'WORLD_GAME_INVALID_RESULT: result payload does not match the server-calculated score.';
  end if;

  select *
  into v_session
  from public.game_sessions
  where id = p_game_session_id
  for update;

  if not found then
    raise exception
      'WORLD_GAME_SESSION_NOT_FOUND: no matching game session exists.';
  end if;

  if v_session.user_id is distinct from p_user_id
     or v_session.game_mode is distinct from 'world' then
    raise exception
      'WORLD_GAME_ACCESS_DENIED: session ownership or game mode is invalid.';
  end if;

  if v_session.status is distinct from 'started' then
    raise exception
      'WORLD_GAME_ALREADY_COMPLETED: the session is not in started state.';
  end if;

  if v_session.world_team_season_id is null
     or p_result->>'teamSeasonId'
        is distinct from v_session.world_team_season_id::text then
    raise exception
      'WORLD_GAME_INVALID_RESULT: team-season does not match the game session.';
  end if;

  if not exists (
    select 1
    from public.team_seasons ts
    join public.seasons s
      on s.id = ts.season_id
    join public.world_editions we
      on we.id = ts.world_edition_id
    where ts.id = v_session.world_team_season_id
      and we.status = 'published'
      and we.year = s.year
  ) then
    raise exception
      'WORLD_GAME_EDITION_NOT_PUBLISHED: session team-season is not part of a published, year-consistent World Cup edition.';
  end if;

  v_context_challenge :=
    nullif(btrim(v_session.context->>'challengeId'), '');

  if v_context_challenge is not null then
    begin
      v_context_challenge_id := v_context_challenge::uuid;
    exception
      when invalid_text_representation then
        raise exception
          'WORLD_GAME_CHALLENGE_MISMATCH: session context contains an invalid challenge ID.';
    end;
  end if;

  v_authoritative_challenge_id :=
    coalesce(v_session.challenge_id, v_context_challenge_id);

  if p_challenge_id is distinct from v_authoritative_challenge_id then
    raise exception
      'WORLD_GAME_CHALLENGE_MISMATCH: submitted challenge does not match the session.';
  end if;

  if (p_result->>'challengeId')
     is distinct from v_authoritative_challenge_id::text then
    raise exception
      'WORLD_GAME_INVALID_RESULT: result challenge ID does not match the session.';
  end if;

  if v_authoritative_challenge_id is not null then
    perform 1
    from public.challenges
    where id = v_authoritative_challenge_id
      and game_mode = 'world';

    if not found then
      raise exception
        'WORLD_GAME_CHALLENGE_MISMATCH: referenced challenge is missing or is not a World challenge.';
    end if;

    perform 1
    from public.challenge_players
    where challenge_id = v_authoritative_challenge_id
      and user_id = p_user_id
    for update;

    if not found then
      raise exception
        'WORLD_GAME_CHALLENGE_MEMBERSHIP_REQUIRED: user is not a member of the challenge.';
    end if;
  end if;

  insert into public.game_scores (
    user_id,
    game_mode,
    score,
    result
  )
  values (
    p_user_id,
    'world',
    p_score,
    p_result
  )
  returning id, created_at
  into v_game_score_id, v_created_at;

  update public.game_sessions
  set status = 'completed'
  where id = p_game_session_id
    and user_id = p_user_id
    and game_mode = 'world'
    and status = 'started';

  if not found then
    raise exception
      'WORLD_GAME_ALREADY_COMPLETED: session state changed during completion.';
  end if;

  if v_authoritative_challenge_id is not null then
    select count(*)
    into v_existing_score_count
    from public.challenge_scores
    where challenge_id = v_authoritative_challenge_id
      and user_id = p_user_id;

    if v_existing_score_count > 1 then
      raise exception
        'WORLD_GAME_DUPLICATE_CHALLENGE_SCORES: multiple score rows exist for one challenge member.';
    end if;

    if v_existing_score_count = 1 then
      select score
      into v_existing_score
      from public.challenge_scores
      where challenge_id = v_authoritative_challenge_id
        and user_id = p_user_id
      for update;

      v_score_found := found;
    else
      v_score_found := false;
    end if;

    if v_score_found then
      update public.challenge_scores
      set score = greatest(v_existing_score, p_score)
      where challenge_id = v_authoritative_challenge_id
        and user_id = p_user_id;
    else
      insert into public.challenge_scores (
        challenge_id,
        user_id,
        score
      )
      values (
        v_authoritative_challenge_id,
        p_user_id,
        p_score
      );
    end if;
  end if;

  return jsonb_build_object(
    'id', v_game_score_id,
    'created_at', v_created_at
  );
end;
$$;

revoke all on function public.complete_world_game(
  uuid, uuid, uuid, integer, jsonb
) from public;

revoke all on function public.complete_world_game(
  uuid, uuid, uuid, integer, jsonb
) from anon, authenticated;

grant execute on function public.complete_world_game(
  uuid, uuid, uuid, integer, jsonb
) to service_role;

commit;