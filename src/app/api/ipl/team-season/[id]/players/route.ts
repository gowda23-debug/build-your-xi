import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const VALID_ROLES = [
  "BAT",
  "WK",
  "AR",
  "BOWL",
] as const;

type ValidRole =
  (typeof VALID_ROLES)[number];

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    /*
     * Authentication
     */
    const { error: authError } =
      await requireUser();

    if (authError) {
      return authError;
    }

    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Team-season ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Verify the team-season exists.
     */
    const {
      data: teamSeason,
      error: teamSeasonError,
    } = await supabaseAdmin
      .from("ipl_team_seasons")
      .select(`
        id,
        team:ipl_teams (
          id,
          name
        ),
        season:ipl_seasons (
          id,
          season,
          start_year
        )
      `)
      .eq("id", id)
      .maybeSingle();

    if (teamSeasonError) {
      console.error(
        "Team-season query error:",
        teamSeasonError
      );

      throw teamSeasonError;
    }

    if (!teamSeason) {
      return NextResponse.json(
        {
          error:
            "Team-season combination not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Supabase relationships may be returned
     * as objects or arrays.
     */
    const team =
      Array.isArray(teamSeason.team)
        ? teamSeason.team[0]
        : teamSeason.team;

    const season =
      Array.isArray(teamSeason.season)
        ? teamSeason.season[0]
        : teamSeason.season;

    if (!team || !season) {
      return NextResponse.json(
        {
          error:
            "Invalid team-season relationship.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Fetch players belonging to this exact
     * team-season.
     */
    const {
      data: playerStats,
      error: statsError,
    } = await supabaseAdmin
      .from(
        "ipl_team_season_player_stats"
      )
      .select(`
        player_id,
        matches,
        batting_innings,
        runs,
        balls_faced,
        fours,
        sixes,
        highest_score,
        dismissals,
        bowling_innings,
        balls_bowled,
        runs_conceded,
        wickets,
        player:ipl_players (
          id,
          name,
          role
        )
      `)
      .eq(
        "team_season_id",
        id
      )
      .order("runs", {
        ascending: false,
      });

    if (statsError) {
      console.error(
        "Player statistics query error:",
        statsError
      );

      throw statsError;
    }

    /*
     * Normalize player data.
     *
     * Players without a verified role are
     * deliberately excluded from the game pool.
     */
    const players = (
      playerStats ?? []
    )
      .map((stat) => {
        const player =
          Array.isArray(stat.player)
            ? stat.player[0]
            : stat.player;

        if (!player) {
          return null;
        }

        const role =
          player.role as
            | ValidRole
            | null;

        if (
          !role ||
          !VALID_ROLES.includes(role)
        ) {
          return null;
        }

        return {
          id: player.id,

          name: player.name,

          role,

          stats: {
            matches:
              stat.matches ?? 0,

            battingInnings:
              stat.batting_innings ?? 0,

            runs:
              stat.runs ?? 0,

            ballsFaced:
              stat.balls_faced ?? 0,

            fours:
              stat.fours ?? 0,

            sixes:
              stat.sixes ?? 0,

            highestScore:
              stat.highest_score ?? 0,

            dismissals:
              stat.dismissals ?? 0,

            bowlingInnings:
              stat.bowling_innings ?? 0,

            ballsBowled:
              stat.balls_bowled ?? 0,

            runsConceded:
              stat.runs_conceded ?? 0,

            wickets:
              stat.wickets ?? 0,
          },
        };
      })
      .filter(
        (
          player
        ): player is NonNullable<
          typeof player
        > =>
          player !== null
      );

    return NextResponse.json({
      challenge: {
        teamSeasonId:
          teamSeason.id,

        team: {
          id: team.id,
          name: team.name,
        },

        season: {
          id: season.id,
          season:
            season.season,
          startYear:
            season.start_year,
        },
      },

      players,
    });
  } catch (error) {
    console.error(
      "Player pool endpoint error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load players for this challenge.",
      },
      {
        status: 500,
      }
    );
  }
}