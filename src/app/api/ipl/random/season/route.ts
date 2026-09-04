import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request
) {
  try {
    /*
     * Registered users and guest users
     * are both allowed to access the
     * IPL game APIs.
     */
    const { error: authError } =
      await requireUser();

    if (authError) {
      return authError;
    }

    const { searchParams } =
      new URL(request.url);

    const teamId =
      searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json(
        {
          error:
            "teamId is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Get every valid season for this team.
     *
     * Querying through ipl_team_seasons
     * guarantees that an invalid
     * team-season combination cannot
     * be returned.
     */
    const {
      data: teamSeasons,
      error,
    } = await supabaseAdmin
      .from("ipl_team_seasons")
      .select(`
        id,
        season:ipl_seasons (
          id,
          season,
          start_year
        )
      `)
      .eq(
        "team_id",
        teamId
      );

    if (error) {
      console.error(
        "Random season query error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Unable to load seasons for this team.",
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
            "No valid seasons found for this team.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Normalize Supabase relationship
     * responses.
     */
    const validSeasons =
      teamSeasons
        .map((record) => {
          const season =
            Array.isArray(
              record.season
            )
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
          > => season !== null
        );

    if (
      validSeasons.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No valid seasons could be resolved.",
        },
        {
          status: 404,
        }
      );
    }

    const randomIndex =
      Math.floor(
        Math.random() *
          validSeasons.length
      );

    const season =
      validSeasons[
        randomIndex
      ];

    return NextResponse.json({
      season,
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
      {
        status: 500,
      }
    );
  }
}