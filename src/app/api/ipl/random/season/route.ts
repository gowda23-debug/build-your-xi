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
  teamId?: string | null;
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
     * Registered players must use their server session.
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
          "Season respin session query error:",
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

      if (context.seasonRespinUsed === true) {
        return NextResponse.json(
          {
            error:
              "The season respin has already been used.",
          },
          { status: 409 }
        );
      }

      /*
       * Resolve the CURRENT team from the authoritative
       * team-season stored in the session.
       */
      const {
        data: currentTeamSeason,
        error: currentTeamSeasonError,
      } = await supabaseAdmin
        .from("ipl_team_seasons")
        .select("id, team_id")
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
       * Get all seasons available for this exact team.
       *
       * Exclude the current team-season so the respin
       * actually changes the season.
       */
      const {
        data: teamSeasons,
        error: teamSeasonsError,
      } = await supabaseAdmin
        .from("ipl_team_seasons")
        .select(
          `
          id,
          season:ipl_seasons (
            id,
            season,
            start_year
          )
        `
        )
        .eq(
          "team_id",
          currentTeamSeason.team_id
        )
        .neq(
          "id",
          session.team_season_id
        );

      if (teamSeasonsError) {
        console.error(
          "Random season query error:",
          teamSeasonsError
        );

        return NextResponse.json(
          {
            error:
              "Unable to load seasons for this team.",
          },
          { status: 500 }
        );
      }

      const validSeasons =
        (teamSeasons ?? [])
          .map((record) => {
            const season =
              Array.isArray(record.season)
                ? record.season[0]
                : record.season;

            if (!season) {
              return null;
            }

            return {
              teamSeasonId:
                record.id,

              id:
                season.id,

              season:
                season.season,

              startYear:
                season.start_year,
            };
          })
          .filter(
            (
              season
            ): season is NonNullable<
              typeof season
            > =>
              season !== null
          );

      if (validSeasons.length === 0) {
        return NextResponse.json(
          {
            error:
              "No alternate seasons are available for this team.",
          },
          { status: 404 }
        );
      }

      const selected =
        validSeasons[
          Math.floor(
            Math.random() *
              validSeasons.length
          )
        ];

      /*
       * Preserve the entire context, including the
       * locked venue snapshot.
       */
      const nextContext: SessionContext = {
        ...context,
        seasonRespinUsed: true,
      };

      /*
       * Atomically consume the season respin.
       */
      const {
        data: updatedSession,
        error: updateError,
      } = await supabaseAdmin
        .from("game_sessions")
        .update({
          team_season_id:
            selected.teamSeasonId,

          context:
            nextContext,
        })
        .eq("id", session.id)
        .eq("user_id", user.id)
        .eq("status", "started")
        .eq("context->>seasonRespinUsed", "false")
        .select("id")
        .maybeSingle();

      if (updateError) {
        console.error(
          "Season respin session update error:",
          updateError
        );

        return NextResponse.json(
          {
            error:
              "Unable to apply the season respin.",
          },
          { status: 500 }
        );
      }

      if (!updatedSession) {
        return NextResponse.json(
          {
            error:
              "The season respin has already been used or the game session changed.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json({
        season: selected,
      });
    }

    /*
     * ============================================================
     * GUEST PLAYER
     * ============================================================
     */
    const teamId =
      typeof body.teamId === "string" &&
      body.teamId.trim().length > 0
        ? body.teamId.trim()
        : null;

    if (!teamId) {
      return NextResponse.json(
        {
          error:
            "teamId is required for guest players.",
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
        season:ipl_seasons (
          id,
          season,
          start_year
        )
      `
      )
      .eq(
        "team_id",
        teamId
      );

    if (error) {
      console.error(
        "Guest random season query error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Unable to load seasons for this team.",
        },
        { status: 500 }
      );
    }

    const validSeasons =
      (teamSeasons ?? [])
        .map((record) => {
          const season =
            Array.isArray(record.season)
              ? record.season[0]
              : record.season;

          if (!season) {
            return null;
          }

          return {
            teamSeasonId:
              record.id,

            id:
              season.id,

            season:
              season.season,

            startYear:
              season.start_year,
          };
        })
        .filter(
          (
            season
          ): season is NonNullable<
            typeof season
          > =>
            season !== null
        );

    if (validSeasons.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid seasons found for this team.",
        },
        { status: 404 }
      );
    }

    const selected =
      validSeasons[
        Math.floor(
          Math.random() *
            validSeasons.length
        )
      ];

    return NextResponse.json({
      season: selected,
    });
  } catch (error) {
    console.error(
      "Random season endpoint error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while selecting a season.",
      },
      { status: 500 }
    );
  }
}