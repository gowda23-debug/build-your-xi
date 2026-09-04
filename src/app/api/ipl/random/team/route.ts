import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: Request
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

    const { searchParams } =
      new URL(request.url);

    const seasonId =
      searchParams.get(
        "seasonId"
      );

    if (!seasonId) {
      return NextResponse.json(
        {
          error:
            "seasonId is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Retrieve only teams that
     * actually existed in the
     * selected season.
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
        )
      `)
      .eq(
        "season_id",
        seasonId
      );

    if (error) {
      console.error(
        "Random team query error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Unable to load IPL teams.",
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
            "No valid teams are available for this season.",
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

    if (!team) {
      return NextResponse.json(
        {
          error:
            "Invalid team relationship.",
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
      {
        status: 500,
      }
    );
  }
}