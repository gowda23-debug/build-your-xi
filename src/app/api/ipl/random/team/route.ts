import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SessionContext = {
  version?: number;
  venueId?: string;
  venueSnapshot?: unknown;
  teamRespinUsed?: boolean;
  seasonRespinUsed?: boolean;
  initialTeamSeasonId?: string;
  initialTeamId?: string;
  initialSeasonId?: string;
  [key: string]: unknown;
};

type RequestBody = {
  gameSessionId?: string | null;
  seasonId?: string | null;
};

export async function POST(request: Request) {
  try {
    const {
      user,
      error: authError,
    } = await requireUser();

    if (authError || !user) {
      return (
        authError ??
        NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        )
      );
    }

    const body =
      (await request.json().catch(() => ({}))) as RequestBody;

    const gameSessionId =
      typeof body.gameSessionId === "string" &&
      body.gameSessionId.trim().length > 0
        ? body.gameSessionId.trim()
        : null;

    /*
     * Registered users MUST use the server-created
     * game session.
     *
     * Guests don't have persistent game sessions,
     * so they may use the supplied seasonId.
     */
    if (!user.is_anonymous && !gameSessionId) {
      return NextResponse.json(
        {
          error:
            "A game session is required for registered players.",
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * REGISTERED PLAYER
     * ============================================================
     */
    if (!user.is_anonymous) {
      /*
       * Load only the caller's own active session.
       */
      const {
        data: session,
        error: sessionError,
      } = await supabaseAdmin
        .from("game_sessions")
        .select(
          `
          id,
          status,
          game_mode,
          team_season_id,
          context
        `
        )
        .eq("id", gameSessionId)
        .eq("user_id", user.id)
        .eq("game_mode", "ipl")
        .maybeSingle();

      if (sessionError) {
        console.error(
          "Team respin session query error:",
          sessionError
        );

        return NextResponse.json(
          {
            error:
              "Unable to verify the game session.",
          },
          { status: 500 }
        );
      }

      if (!session) {
        return NextResponse.json(
          {
            error:
              "Game session not found.",
          },
          { status: 404 }
        );
      }

      if (session.status !== "started") {
        return NextResponse.json(
          {
            error:
              "This game session is no longer active.",
          },
          { status: 409 }
        );
      }

      if (!session.team_season_id) {
        return NextResponse.json(
          {
            error:
              "The game session has no active team-season.",
          },
          { status: 409 }
        );
      }

      const context =
        (session.context ?? {}) as SessionContext;

      if (context.teamRespinUsed === true) {
        return NextResponse.json(
          {
            error:
              "The team respin has already been used.",
          },
          { status: 409 }
        );
      }

      /*
       * Resolve the CURRENT season from the authoritative
       * team-season stored in the game session.
       */
      const {
        data: currentTeamSeason,
        error: currentTeamSeasonError,
      } = await supabaseAdmin
        .from("ipl_team_seasons")
        .select("id, season_id")
        .eq("id", session.team_season_id)
        .maybeSingle();

      if (currentTeamSeasonError) {
        console.error(
          "Current team-season query error:",
          currentTeamSeasonError
        );

        return NextResponse.json(
          {
            error:
              "Unable to resolve the current team-season.",
          },
          { status: 500 }
        );
      }

      if (!currentTeamSeason) {
        return NextResponse.json(
          {
            error:
              "Current team-season no longer exists.",
          },
          { status: 409 }
        );
      }

      /*
       * Get all valid teams for the CURRENT season.
       *
       * We deliberately exclude the current team-season so
       * a respin actually changes the team.
       */
      const {
        data: teamSeasons,
        error: teamSeasonsError,
      } = await supabaseAdmin
        .from("ipl_team_seasons")
        .select(
          `
          id,
          team:ipl_teams (
            id,
            name
          )
        `
        )
        .eq(
          "season_id",
          currentTeamSeason.season_id
        )
        .neq(
          "id",
          session.team_season_id
        );

      if (teamSeasonsError) {
        console.error(
          "Random team query error:",
          teamSeasonsError
        );

        return NextResponse.json(
          {
            error:
              "Unable to load IPL teams.",
          },
          { status: 500 }
        );
      }

      if (
        !teamSeasons ||
        teamSeasons.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "No alternate teams are available for this season.",
          },
          { status: 404 }
        );
      }

      const selected =
        teamSeasons[
          Math.floor(
            Math.random() *
              teamSeasons.length
          )
        ];

      const team =
        Array.isArray(selected.team)
          ? selected.team[0]
          : selected.team;

      if (!team) {
        return NextResponse.json(
          {
            error:
              "Invalid team relationship.",
          },
          { status: 500 }
        );
      }

      /*
       * IMPORTANT:
       *
       * The JSON flag is included in the UPDATE filter.
       *
       * This makes the "one respin" rule resistant to
       * two simultaneous requests:
       *
       * request A -> flag false -> updates
       * request B -> flag already true -> updates 0 rows
       *
       * Supabase supports filters on update operations
       * and JSON fields. 
       */
      const nextContext: SessionContext = {
        ...context,
        teamRespinUsed: true,
      };

      const {
        data: updatedSession,
        error: updateError,
      } = await supabaseAdmin
        .from("game_sessions")
        .update({
          team_season_id: selected.id,
          context: nextContext,
        })
        .eq("id", session.id)
        .eq("user_id", user.id)
        .eq("status", "started")
        .eq("context->>teamRespinUsed", "false")
        .select("id")
        .maybeSingle();

      if (updateError) {
        console.error(
          "Team respin session update error:",
          updateError
        );

        return NextResponse.json(
          {
            error:
              "Unable to apply the team respin.",
          },
          { status: 500 }
        );
      }

      if (!updatedSession) {
        return NextResponse.json(
          {
            error:
              "The team respin has already been used or the game session changed.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json({
        teamSeasonId: selected.id,

        team: {
          id: team.id,
          name: team.name,
        },
      });
    }

    /*
     * ============================================================
     * GUEST PLAYER
     * ============================================================
     *
     * Guests don't have persistent game_sessions.
     * Their respins remain client/game-flow only.
     */
    const seasonId =
      typeof body.seasonId === "string" &&
      body.seasonId.trim().length > 0
        ? body.seasonId.trim()
        : null;

    if (!seasonId) {
      return NextResponse.json(
        {
          error:
            "seasonId is required for guest players.",
        },
        { status: 400 }
      );
    }

    const {
      data: teamSeasons,
      error,
    } = await supabaseAdmin
      .from("ipl_team_seasons")
      .select(
        `
        id,
        team:ipl_teams (
          id,
          name
        )
      `
      )
      .eq(
        "season_id",
        seasonId
      );

    if (error) {
      console.error(
        "Guest random team query error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Unable to load IPL teams.",
        },
        { status: 500 }
      );
    }

    if (
      !teamSeasons ||
      teamSeasons.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No valid teams are available for this season.",
        },
        { status: 404 }
      );
    }

    const selected =
      teamSeasons[
        Math.floor(
          Math.random() *
            teamSeasons.length
        )
      ];

    const team =
      Array.isArray(selected.team)
        ? selected.team[0]
        : selected.team;

    if (!team) {
      return NextResponse.json(
        {
          error:
            "Invalid team relationship.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      teamSeasonId: selected.id,

      team: {
        id: team.id,
        name: team.name,
      },
    });
  } catch (error) {
    console.error(
      "Random team endpoint error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while selecting a team.",
      },
      { status: 500 }
    );
  }
}