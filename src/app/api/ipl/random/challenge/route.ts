import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    /*
     * Authentication
     */
    const { error: authError } =
      await requireUser();

    if (authError) {
      return authError;
    }

    /*
     * Retrieve valid team-season combinations.
     *
     * The database relationship guarantees
     * that every result is a valid IPL
     * team and season combination.
     */
    const {
      data: teamSeasons,
      error,
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
      `);

    if (error) {
      console.error(
        "Random challenge query error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Unable to load IPL challenges.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !teamSeasons ||
      teamSeasons.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No valid IPL challenges are available.",
        },
        {
          status: 404,
        }
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
      Array.isArray(
        selected.team
      )
        ? selected.team[0]
        : selected.team;

    const season =
      Array.isArray(
        selected.season
      )
        ? selected.season[0]
        : selected.season;

    if (!team || !season) {
      return NextResponse.json(
        {
          error:
            "Invalid challenge relationship.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      teamSeasonId:
        selected.id,

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
    });
  } catch (error) {
    console.error(
      "Random challenge endpoint error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while creating the challenge.",
      },
      {
        status: 500,
      }
    );
  }
}