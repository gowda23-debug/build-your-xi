import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { error: authError } =
      await requireUser();

    if (authError) {
      return authError;
    }

    const { id: teamId } =
      await context.params;

    if (!teamId) {
      return NextResponse.json(
        {
          error:
            "Team ID is required.",
        },
        {
          status: 400,
        }
      );
    }

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
        "Team seasons query error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Unable to load valid seasons.",
        },
        {
          status: 500,
        }
      );
    }

    const seasons =
      (teamSeasons ?? [])
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
        )
        .sort(
          (a, b) =>
            a.startYear -
            b.startYear
        );

    return NextResponse.json({
      seasons,
    });
  } catch (error) {
    console.error(
      "Team seasons endpoint error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while loading seasons.",
      },
      {
        status: 500,
      }
    );
  }
}