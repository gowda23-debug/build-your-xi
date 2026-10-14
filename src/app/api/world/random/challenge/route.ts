import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const worldDb = supabaseAdmin as unknown as SupabaseClient;

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  slug: string;
};

type SeasonRow = {
  id: string;
  year: number;
};

type WorldTeamSeasonRow = {
  id: string;
  world_edition_id: string | null;
  team: TeamRow | TeamRow[] | null;
  season: SeasonRow | SeasonRow[] | null;
};

type PublishedEditionRow = {
  id: string;
  year: number;
};

type SessionContext = {
  challengeId?: string;
  draftSelections?: Array<{
    playerId: string;
    teamSeasonId: string;
  }>;
  currentRound?: number;
  teamRespinUsed?: boolean;
  seasonRespinUsed?: boolean;
  [key: string]: unknown;
};

export async function GET(request: Request) {
  try {
    const { user, error: authError } = await requireUser();

    if (authError || !user) {
      return authError ?? NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const url = new URL(request.url);

    const requestedSessionId =
      url.searchParams.get("gameSessionId")?.trim() ?? "";

    const requestedChallengeId =
      url.searchParams.get("challengeId")?.trim() ?? "";

    if (user.is_anonymous && requestedChallengeId) {
      return NextResponse.json(
        {
          error: "Only registered players can play a challenge.",
          code: "REGISTERED_PLAYER_REQUIRED",
        },
        { status: 403 },
      );
    }

    if (requestedChallengeId) {
      const { data: challenge, error } = await supabaseAdmin
        .from("challenges")
        .select("id, game_mode, status")
        .eq("id", requestedChallengeId)
        .eq("game_mode", "world")
        .maybeSingle();

      if (error) throw error;

      if (!challenge) {
        return NextResponse.json(
          { error: "World challenge not found." },
          { status: 404 },
        );
      }

      if (challenge.status !== "active") {
        return NextResponse.json(
          { error: "This challenge is no longer active." },
          { status: 409 },
        );
      }

      const { data: membership, error: membershipError } =
        await supabaseAdmin
          .from("challenge_players")
          .select("challenge_id")
          .eq("challenge_id", requestedChallengeId)
          .eq("user_id", user.id)
          .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership) {
        return NextResponse.json(
          {
            error:
              "You must join this challenge before playing it.",
          },
          { status: 403 },
        );
      }
    }

    if (requestedSessionId && !user.is_anonymous) {
      const { data: session, error } = await supabaseAdmin
        .from("game_sessions")
        .select(`
          id,
          user_id,
          game_mode,
          status,
          world_team_season_id,
          challenge_id,
          context
        `)
        .eq("id", requestedSessionId)
        .eq("user_id", user.id)
        .eq("game_mode", "world")
        .maybeSingle();

      if (error) throw error;

      if (!session) {
        return NextResponse.json(
          { error: "World game session not found." },
          { status: 404 },
        );
      }

      if (session.status !== "started") {
        return NextResponse.json(
          { error: "This game session is no longer active." },
          { status: 409 },
        );
      }

      const context = (session.context ?? {}) as SessionContext;

      const sessionChallengeId =
        typeof session.challenge_id === "string"
          ? session.challenge_id
          : null;

      const contextChallengeId =
        typeof context.challengeId === "string"
          ? context.challengeId
          : null;

      const authoritativeChallengeId =
        sessionChallengeId ?? contextChallengeId ?? null;

      if (
        requestedChallengeId &&
        authoritativeChallengeId !== requestedChallengeId
      ) {
        return NextResponse.json(
          { error: "The challenge does not match the game session." },
          { status: 409 },
        );
      }

      if (context.draftSelections?.length === 11) {
        return NextResponse.json(
          { error: "The XI is already complete." },
          { status: 409 },
        );
      }

      return loadWorldChallenge(
        session.world_team_season_id,
        session.id,
      );
    }

    // Only editions already published after successful import are playable.
    const { data: publishedEditions, error: editionsError } =
      await worldDb
        .from("world_editions")
        .select("id,year")
        .eq("status", "published")
        .returns<PublishedEditionRow[]>();

    if (editionsError) throw editionsError;

    const editionYears = new Map(
      (publishedEditions ?? []).map((edition) => [
        edition.id,
        edition.year,
      ] as const),
    );

    if (editionYears.size === 0) {
      return NextResponse.json(
        {
          error: "No published World Cup editions are available yet.",
          code: "WORLD_DATA_NOT_READY",
        },
        { status: 503 }
      );
    }

    const { data: teamSeasonRows, error: teamSeasonError } =
      await worldDb
        .from("team_seasons")
        .select(
          "id,world_edition_id,team:teams(id,name,short_name,slug),season:seasons(id,year)",
        )
        .in("world_edition_id", [...editionYears.keys()])
        .returns<WorldTeamSeasonRow[]>();

    if (teamSeasonError) throw teamSeasonError;

    const teamSeasons = teamSeasonRows ?? [];

    if (teamSeasons.length === 0) {
      return NextResponse.json(
        {
          error: "World Cup data is not ready for gameplay yet.",
          code: "WORLD_DATA_NOT_READY",
        },
        { status: 503 }
      );
    }

    const valid = teamSeasons.filter((row) => {
      const season = Array.isArray(row.season)
        ? row.season[0]
        : row.season;

      const editionYear = row.world_edition_id
        ? editionYears.get(row.world_edition_id)
        : undefined;

      return (
        season &&
        Number.isInteger(season.year) &&
        editionYear === season.year
      );
    });

    if (valid.length === 0) {
      return NextResponse.json(
        {
          error: "No World Cup data is available yet.",
          code: "WORLD_DATA_NOT_READY",
        },
        { status: 503 }
      );
    }

    const selected = valid[Math.floor(Math.random() * valid.length)];

    const team = Array.isArray(selected.team)
      ? selected.team[0]
      : selected.team;

    const season = Array.isArray(selected.season)
      ? selected.season[0]
      : selected.season;

    if (!team || !season) {
      return NextResponse.json(
        { error: "Invalid World team-season relationship." },
        { status: 500 },
      );
    }

    let gameSessionId: string | null = null;

    if (!user.is_anonymous) {
      const { data: session, error: sessionError } =
        await supabaseAdmin
          .from("game_sessions")
          .insert({
            user_id: user.id,
            game_mode: "world",
            status: "started",
            world_team_season_id: selected.id,
            challenge_id: requestedChallengeId || null,
            context: {
              version: 1,
              challengeId: requestedChallengeId || null,
              draftSelections: [],
              currentRound: 1,
              teamRespinUsed: false,
              seasonRespinUsed: false,
            },
          })
          .select("id")
          .single();

      if (sessionError) throw sessionError;

      gameSessionId = session.id;
    }

    return NextResponse.json({
      gameSessionId,
      teamSeasonId: selected.id,
      team: {
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        slug: team.slug,
      },
      season: {
        id: season.id,
        year: season.year,
      },
    });
  } catch (error) {
    console.error("World challenge endpoint error:", error);

    return NextResponse.json(
      { error: "Unable to start World Domination." },
      { status: 500 },
    );
  }
}

async function loadWorldChallenge(
  teamSeasonId: string | null,
  gameSessionId: string,
) {
  if (!teamSeasonId) {
    return NextResponse.json(
      { error: "The World game session has no active team-season." },
      { status: 409 },
    );
  }

  const { data, error } = await worldDb
    .from("team_seasons")
    .select(
      "id,world_edition_id,team:teams(id,name,short_name,slug),season:seasons(id,year)",
    )
    .eq("id", teamSeasonId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return NextResponse.json(
      { error: "World team-season not found." },
      { status: 404 },
    );
  }

  if (!data.world_edition_id) {
    return NextResponse.json(
      {
        error:
          "This World team-season is not assigned to a published edition.",
      },
      { status: 409 },
    );
  }

  const { data: editionRows, error: editionError } =
    await worldDb
      .from("world_editions")
      .select("id,year")
      .eq("id", data.world_edition_id)
      .eq("status", "published")
      .returns<PublishedEditionRow[]>();

  if (editionError) throw editionError;

  const edition = editionRows?.[0] ?? null;

  const team = Array.isArray(data.team)
    ? data.team[0]
    : data.team;

  const season = Array.isArray(data.season)
    ? data.season[0]
    : data.season;

  if (!edition || !season || season.year !== edition.year) {
    return NextResponse.json(
      {
        error:
          "This World Cup edition is not published or its season metadata is invalid.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    gameSessionId,
    teamSeasonId: data.id,
    team,
    season,
  });
}