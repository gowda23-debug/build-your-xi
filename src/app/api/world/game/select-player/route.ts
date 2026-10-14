import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

type DraftSelection = {
  playerId: string;
  teamSeasonId: string;
};

type SessionContext = {
  draftSelections?: DraftSelection[];
  currentRound?: number;
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

    if (user.is_anonymous) {
      return NextResponse.json(
        { error: "Registered authentication is required." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      gameSessionId?: string;
      playerId?: string;
    };

    const gameSessionId =
      typeof body.gameSessionId === "string"
        ? body.gameSessionId.trim()
        : "";

    const playerId =
      typeof body.playerId === "string"
        ? body.playerId.trim()
        : "";

    if (!gameSessionId || !playerId) {
      return NextResponse.json(
        { error: "gameSessionId and playerId are required." },
        { status: 400 },
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
        { error: "This World game is no longer active." },
        { status: 409 },
      );
    }

    if (!session.world_team_season_id) {
      return NextResponse.json(
        { error: "The World game has no active team-season." },
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

    if (selections.length >= 11) {
      return NextResponse.json(
        { error: "The XI is already complete." },
        { status: 409 },
      );
    }

    if (selections.some((selection) => selection.playerId === playerId)) {
      return NextResponse.json(
        { error: "This player has already been selected." },
        { status: 409 },
      );
    }

    const { data: playerStat, error: playerError } =
      await supabaseAdmin
        .from("player_season_stats")
        .select("player_id")
        .eq("team_season_id", session.world_team_season_id)
        .eq("player_id", playerId)
        .maybeSingle();

    if (playerError) throw playerError;

    if (!playerStat) {
      return NextResponse.json(
        {
          error:
            "The selected player is not available for this World draft.",
        },
        { status: 400 },
      );
    }

    const { data: editionRoles, error: editionRoleError } =
      await worldDb
        .from("world_edition_player_roles")
        .select("role")
        .eq("world_edition_id", edition.id)
        .eq("player_id", playerId)
        .returns<Array<{ role: string }>>();

    if (editionRoleError) throw editionRoleError;

    if (
      !editionRoles?.some((entry) =>
        ["BAT", "WK", "AR", "BOWL"].includes(entry.role)
      )
    ) {
      return NextResponse.json(
        {
          error:
            "The selected player does not have a verified role for this World Cup edition.",
        },
        { status: 400 },
      );
    }

    const nextSelections = [
      ...selections,
      {
        playerId,
        teamSeasonId: session.world_team_season_id,
      },
    ];

    const nextContext = {
      ...context,
      draftSelections: nextSelections,
      currentRound: nextSelections.length + 1,
    };

    const { data: updated, error: updateError } =
      await supabaseAdmin
        .from("game_sessions")
        .update({ context: nextContext })
        .eq("id", session.id)
        .eq("user_id", user.id)
        .eq("status", "started")
        .select("id")
        .maybeSingle();

    if (updateError) throw updateError;

    if (!updated) {
      return NextResponse.json(
        {
          error:
            "The World game changed while the player was being selected.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      selectedCount: nextSelections.length,
    });
  } catch (error) {
    console.error("World player selection error:", error);

    return NextResponse.json(
      { error: "Unable to save the World player selection." },
      { status: 500 },
    );
  }
}