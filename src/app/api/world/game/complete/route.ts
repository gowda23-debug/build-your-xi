import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { evaluateWorldXI } from "@/lib/world/scoring";
import { validateWorldXI } from "@/lib/world/validate-xi";

import type { WorldPlayer } from "@/types/world";

type DraftSelection = {
  playerId: string;
  teamSeasonId: string;
};

type SessionContext = {
  challengeId?: string | null;
  draftSelections?: DraftSelection[];
  [key: string]: unknown;
};

export const dynamic = "force-dynamic";

const worldDb = supabaseAdmin as unknown as SupabaseClient;

export async function POST(request: Request) {
  try {
    const { user, error: authError } = await requireUser();

    if (authError || !user) {
      return authError ?? NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      gameSessionId?: string;
    };

    const gameSessionId =
      typeof body.gameSessionId === "string"
        ? body.gameSessionId.trim()
        : "";

    if (!gameSessionId) {
      return NextResponse.json(
        { error: "gameSessionId is required." },
        { status: 400 },
      );
    }

    if (user.is_anonymous) {
      return NextResponse.json(
        {
          error:
            "Guest World games cannot be completed through the persistent game endpoint.",
        },
        { status: 403 },
      );
    }

    const { data: session, error: sessionError } =
      await supabaseAdmin
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
        .eq("id", gameSessionId)
        .eq("user_id", user.id)
        .eq("game_mode", "world")
        .maybeSingle();

    if (sessionError) throw sessionError;

    if (!session) {
      return NextResponse.json(
        { error: "World game session not found." },
        { status: 404 },
      );
    }

    if (session.status !== "started") {
      return NextResponse.json(
        { error: "This World game has already been completed." },
        { status: 409 },
      );
    }

    if (!session.world_team_season_id) {
      return NextResponse.json(
        { error: "World game session has no team-season." },
        { status: 409 },
      );
    }

    const { data: teamSeasonRows, error: teamSeasonError } =
      await worldDb
        .from("team_seasons")
        .select("world_edition_id,season:seasons(year)")
        .eq("id", session.world_team_season_id)
        .returns<
          Array<{
            world_edition_id: string | null;
            season:
              | { year: number }
              | Array<{ year: number }>
              | null;
          }>
        >();

    if (teamSeasonError) throw teamSeasonError;

    const teamSeason = teamSeasonRows?.[0] ?? null;

    const season = teamSeason
      ? Array.isArray(teamSeason.season)
        ? teamSeason.season[0]
        : teamSeason.season
      : null;

    if (!teamSeason?.world_edition_id || !season) {
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
        .eq("id", teamSeason.world_edition_id)
        .eq("status", "published")
        .returns<Array<{ id: string; year: number }>>();

    if (editionError) throw editionError;

    const edition = editionRows?.[0] ?? null;

    if (!edition || edition.year !== season.year) {
      return NextResponse.json(
        {
          error:
            "The World Cup edition is not published or its season metadata is invalid.",
        },
        { status: 409 },
      );
    }

    const context = (session.context ?? {}) as SessionContext;

    const selections = Array.isArray(context.draftSelections)
      ? context.draftSelections
      : [];

    if (selections.length !== 11) {
      return NextResponse.json(
        { error: "The World XI is not complete." },
        { status: 400 },
      );
    }

    const selectedPlayers: WorldPlayer[] = [];

    for (const selection of selections) {
      if (
        selection.teamSeasonId !==
        session.world_team_season_id
      ) {
        return NextResponse.json(
          {
            error:
              "The game session contains an invalid team-season selection.",
          },
          { status: 400 },
        );
      }

      const { data: stat, error: statError } =
        await supabaseAdmin
          .from("player_season_stats")
          .select(`
            player_id,
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
            stumpings,
            player:players (
              id,
              full_name
            )
          `)
          .eq("team_season_id", session.world_team_season_id)
          .eq("player_id", selection.playerId)
          .maybeSingle();

      if (statError) throw statError;

      if (!stat) {
        return NextResponse.json(
          { error: "One or more selected World players are invalid." },
          { status: 400 },
        );
      }

      const player = Array.isArray(stat.player)
        ? stat.player[0]
        : stat.player;

      if (!player) {
        return NextResponse.json(
          { error: "Selected World player could not be resolved." },
          { status: 500 },
        );
      }

      const { data: roleRow, error: roleError } =
        await worldDb
          .from("world_edition_player_roles")
          .select("role")
          .eq("world_edition_id", edition.id)
          .eq("player_id", player.id)
          .maybeSingle();

      if (roleError) throw roleError;

      const allowedRoles = new Set([
        "BAT",
        "WK",
        "AR",
        "BOWL",
      ]);

      const role =
        roleRow && allowedRoles.has(roleRow.role)
          ? roleRow.role
          : null;

      if (!role) {
        return NextResponse.json(
          { error: "A selected player does not have a verified role." },
          { status: 400 },
        );
      }

      selectedPlayers.push({
        id: player.id,
        name: player.full_name,
        role,
        stats: {
          matches: stat.matches ?? 0,
          innings: stat.innings ?? 0,
          runs: stat.runs ?? 0,
          battingAverage: stat.batting_average ?? null,
          strikeRate: stat.strike_rate ?? null,
          hundreds: stat.hundreds ?? 0,
          fifties: stat.fifties ?? 0,
          wickets: stat.wickets ?? 0,
          bowlingAverage: stat.bowling_average ?? null,
          economy: stat.economy ?? null,
          catches: stat.catches ?? 0,
          stumpings: stat.stumpings ?? 0,
        },
      });
    }

    const validation = validateWorldXI(selectedPlayers);

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "The selected XI does not satisfy the World rules.",
          details: validation.errors,
        },
        { status: 400 },
      );
    }

    const result = evaluateWorldXI(
      selectedPlayers,
      gameSessionId,
    );

    const challengeId =
      session.challenge_id ??
      (typeof context.challengeId === "string"
        ? context.challengeId
        : null);

    const storedResult = {
      version: 1,
      challengeId,
      gameMode: "world",
      teamSeasonId: session.world_team_season_id,
      players: selectedPlayers.map((player) => ({
        id: player.id,
        name: player.name,
        role: player.role,
      })),
      score: result.score,
      teamStrength: result.teamStrength,
      wins: result.wins,
      losses: result.losses,
      matches: result.matches,
      breakdown: result.breakdown,
    };

    const {
      data: persistedScore,
      error: persistenceError,
    } = await supabaseAdmin.rpc("complete_world_game", {
      p_game_session_id: session.id,
      p_user_id: user.id,
      p_challenge_id: challengeId,
      p_score: result.score,
      p_result: storedResult,
    });

    if (persistenceError) {
      const message = persistenceError.message ?? "";

      if (message.includes("WORLD_GAME_ALREADY_COMPLETED")) {
        return NextResponse.json(
          { error: "This World game has already been completed." },
          { status: 409 },
        );
      }

      if (message.includes("WORLD_GAME_CHALLENGE_MISMATCH")) {
        return NextResponse.json(
          { error: "The World game challenge does not match its session." },
          { status: 409 },
        );
      }

      if (message.includes("WORLD_GAME_EDITION_NOT_PUBLISHED")) {
        return NextResponse.json(
          { error: "The World Cup edition is no longer published." },
          { status: 409 },
        );
      }

      if (
        message.includes(
          "WORLD_GAME_CHALLENGE_MEMBERSHIP_REQUIRED",
        )
      ) {
        return NextResponse.json(
          {
            error:
              "You must be a member of this challenge to submit a score.",
          },
          { status: 403 },
        );
      }

      if (message.includes("WORLD_GAME_SESSION_NOT_FOUND")) {
        return NextResponse.json(
          { error: "World game session not found." },
          { status: 404 },
        );
      }

      if (message.includes("WORLD_GAME_ACCESS_DENIED")) {
        return NextResponse.json(
          {
            error:
              "You are not allowed to complete this World game.",
          },
          { status: 403 },
        );
      }

      throw persistenceError;
    }

    if (
      !persistedScore ||
      typeof persistedScore !== "object" ||
      Array.isArray(persistedScore)
    ) {
      throw new Error(
        "Atomic World game completion returned an invalid score payload.",
      );
    }

    const gameScore = persistedScore as {
      id?: unknown;
      created_at?: unknown;
    };

    if (
      typeof gameScore.id !== "string" ||
      typeof gameScore.created_at !== "string"
    ) {
      throw new Error(
        "Atomic World game completion omitted score ID or creation timestamp.",
      );
    }

    return NextResponse.json({
      result: {
        score: result.score,
        teamStrength: result.teamStrength,
        wins: result.wins,
        losses: result.losses,
        matches: result.matches,
        breakdown: result.breakdown,
      },
      gameScoreId: gameScore.id,
      completedAt: gameScore.created_at,
    });
  } catch (error) {
    console.error("World game completion error:", error);

    return NextResponse.json(
      { error: "Unable to complete the World game." },
      { status: 500 },
    );
  }
}