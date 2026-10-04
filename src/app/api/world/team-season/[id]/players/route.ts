import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

const VALID_ROLES =
  [
    "BAT",
    "WK",
    "AR",
    "BOWL",
  ] as const;

export const dynamic =
  "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const {
      error: authError,
    } = await requireUser();

    if (authError) {
      return authError;
    }

    const {
      id,
    } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "World team-season ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: teamSeason,
      error:
        teamSeasonError,
    } =
      await supabaseAdmin
        .from(
          "team_seasons"
        )
        .select(
          `
          id,
          team:teams (
            id,
            name,
            short_name,
            slug
          ),
          season:seasons (
            id,
            year
          )
          `
        )
        .eq(
          "id",
          id
        )
        .maybeSingle();

    if (
      teamSeasonError
    ) {
      throw teamSeasonError;
    }

    if (
      !teamSeason
    ) {
      return NextResponse.json(
        {
          error:
            "World team-season not found.",
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

    if (
      !team ||
      !season
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid World team-season relationship.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      data: stats,
      error:
        statsError,
    } =
      await supabaseAdmin
        .from(
          "player_season_stats"
        )
        .select(
          `
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
          `
        )
        .eq(
          "team_season_id",
          id
        )
        .order(
          "runs",
          {
            ascending:
              false,
          }
        );

    if (
      statsError
    ) {
      throw statsError;
    }

    const playerIds =
      (
        stats ??
        []
      ).map(
        (row) =>
          row.player_id
      );

    const {
      data: roles,
      error:
        roleError,
    } =
      playerIds.length > 0
        ? await supabaseAdmin
            .from(
              "player_roles"
            )
            .select(
              "player_id, role"
            )
            .in(
              "player_id",
              playerIds
            )
        : {
            data: [],
            error: null,
          };

    if (
      roleError
    ) {
      throw roleError;
    }

    const roleMap =
      new Map<
        string,
        string
      >();

    for (
      const row of
        roles ?? []
    ) {
      if (
        VALID_ROLES.includes(
          row.role
        )
      ) {
        roleMap.set(
          row.player_id,
          row.role
        );
      }
    }

    const players =
      (
        stats ??
        []
      )
        .map(
          (row) => {
            const player =
              Array.isArray(
                row.player
              )
                ? row.player[0]
                : row.player;

            if (
              !player
            ) {
              return null;
            }

            const role =
              roleMap.get(
                row.player_id
              );

            if (
              !role
            ) {
              return null;
            }

            return {
              id:
                player.id,

              name:
                player.full_name,

              role,

              stats: {
                matches:
                  row.matches ??
                  0,

                innings:
                  row.innings ??
                  0,

                runs:
                  row.runs ??
                  0,

                battingAverage:
                  row.batting_average ??
                  null,

                strikeRate:
                  row.strike_rate ??
                  null,

                hundreds:
                  row.hundreds ??
                  0,

                fifties:
                  row.fifties ??
                  0,

                wickets:
                  row.wickets ??
                  0,

                bowlingAverage:
                  row.bowling_average ??
                  null,

                economy:
                  row.economy ??
                  null,

                catches:
                  row.catches ??
                  0,

                stumpings:
                  row.stumpings ??
                  0,
              },
            };
          }
        )
        .filter(
          (
            player
          ): player is NonNullable<
            typeof player
          > =>
            player !==
            null
        );

    return NextResponse.json({
      teamSeason: {
        id:
          teamSeason.id,

        team,

        season,
      },

      players,
    });
  } catch (error) {
    console.error(
      "World player pool error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load World Cup players.",
      },
      {
        status: 500,
      }
    );
  }
}