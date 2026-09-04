import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
     * Verify that this team-season
     * combination actually exists.
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
      .eq(
        "id",
        id
      )
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

    const team =
      Array.isArray(
        teamSeason.team
      )
        ? teamSeason.team[0]
        : teamSeason.team;

    const season =
      Array.isArray(
        teamSeason.season
      )
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
     * Retrieve statistics for players
     * belonging to this exact team-season.
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
          name
        )
      `)
      .eq(
        "team_season_id",
        id
      )
      .order(
        "runs",
        {
          ascending: false,
        }
      );

    if (statsError) {
      console.error(
        "Player statistics query error:",
        statsError
      );

      throw statsError;
    }

    const players =
      (playerStats ?? [])
        .map((stat) => {
          const player =
            Array.isArray(
              stat.player
            )
              ? stat.player[0]
              : stat.player;

          if (!player) {
            return null;
          }

          return {
            id:
              player.id,

            name:
              player.name,

            stats: {
              matches:
                stat.matches,

              battingInnings:
                stat.batting_innings,

              runs:
                stat.runs,

              ballsFaced:
                stat.balls_faced,

              fours:
                stat.fours,

              sixes:
                stat.sixes,

              highestScore:
                stat.highest_score,

              dismissals:
                stat.dismissals,

              bowlingInnings:
                stat.bowling_innings,

              ballsBowled:
                stat.balls_bowled,

              runsConceded:
                stat.runs_conceded,

              wickets:
                stat.wickets,
            },
          };
        })
        .filter(
          (
            player
          ): player is NonNullable<
            typeof player
          > => player !== null
        );

return NextResponse.json({
  challenge: {
    teamSeasonId:
      teamSeason.id,

    team: {
      id:
        team.id,

      name:
        team.name,
    },

    season: {
      id:
        season.id,

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