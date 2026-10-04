import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic =
  "force-dynamic";

type SessionContext = {
  challengeId?: string;
  draftSelections?: Array<{
    playerId: string;
    teamSeasonId: string;
  }>;
  currentRound?: number;
  teamRespinUsed?: boolean;
  seasonRespinUsed?: boolean;
  [key: string]: unknown;
};

export async function GET(
  request: Request
) {
  try {
    const {
      user,
      error: authError,
    } = await requireUser();

    if (
      authError ||
      !user
    ) {
      return (
        authError ??
        NextResponse.json(
          {
            error:
              "Unauthorized",
          },
          {
            status: 401,
          }
        )
      );
    }

    const url =
      new URL(
        request.url
      );

    const requestedSessionId =
      url.searchParams.get(
        "gameSessionId"
      )?.trim() ?? "";

    const requestedChallengeId =
      url.searchParams.get(
        "challengeId"
      )?.trim() ?? "";

    if (
      user.is_anonymous &&
      requestedChallengeId
    ) {
      return NextResponse.json(
        {
          error:
            "Only registered players can play a challenge.",
          code:
            "REGISTERED_PLAYER_REQUIRED",
        },
        {
          status: 403,
        }
      );
    }

    if (
      requestedChallengeId
    ) {
      const {
        data: challenge,
        error,
      } =
        await supabaseAdmin
          .from(
            "challenges"
          )
          .select(
            "id, game_mode, status"
          )
          .eq(
            "id",
            requestedChallengeId
          )
          .eq(
            "game_mode",
            "world"
          )
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (!challenge) {
        return NextResponse.json(
          {
            error:
              "World challenge not found.",
          },
          {
            status: 404,
          }
        );
      }

      if (
        challenge.status !==
        "active"
      ) {
        return NextResponse.json(
          {
            error:
              "This challenge is no longer active.",
          },
          {
            status: 409,
          }
        );
      }

      const {
        data: membership,
        error:
          membershipError,
      } =
        await supabaseAdmin
          .from(
            "challenge_players"
          )
          .select(
            "challenge_id"
          )
          .eq(
            "challenge_id",
            requestedChallengeId
          )
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();

      if (
        membershipError
      ) {
        throw membershipError;
      }

      if (!membership) {
        return NextResponse.json(
          {
            error:
              "You must join this challenge before playing it.",
          },
          {
            status: 403,
          }
        );
      }
    }

    if (
      requestedSessionId &&
      !user.is_anonymous
    ) {
      const {
        data: session,
        error,
      } =
        await supabaseAdmin
          .from(
            "game_sessions"
          )
          .select(
            `
            id,
            user_id,
            game_mode,
            status,
            world_team_season_id,
            challenge_id,
            context
            `
          )
          .eq(
            "id",
            requestedSessionId
          )
          .eq(
            "user_id",
            user.id
          )
          .eq(
            "game_mode",
            "world"
          )
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (!session) {
        return NextResponse.json(
          {
            error:
              "World game session not found.",
          },
          {
            status: 404,
          }
        );
      }

      if (
        session.status !==
        "started"
      ) {
        return NextResponse.json(
          {
            error:
              "This game session is no longer active.",
          },
          {
            status: 409,
          }
        );
      }

      const context =
        (
          session.context ??
          {}
        ) as SessionContext;

      const sessionChallengeId =
        typeof session.challenge_id ===
        "string"
          ? session.challenge_id
          : null;

      const contextChallengeId =
        typeof context.challengeId ===
        "string"
          ? context.challengeId
          : null;

      const authoritativeChallengeId =
        sessionChallengeId ??
        contextChallengeId ??
        null;

      if (
        requestedChallengeId &&
        authoritativeChallengeId !==
          requestedChallengeId
      ) {
        return NextResponse.json(
          {
            error:
              "The challenge does not match the game session.",
          },
          {
            status: 409,
          }
        );
      }

      if (
        context.draftSelections
          ?.length === 11
      ) {
        return NextResponse.json(
          {
            error:
              "The XI is already complete.",
          },
          {
            status: 409,
          }
        );
      }

      return loadWorldChallenge(
        session.world_team_season_id,
        session.id
      );
    }

    /*
     * New registered session.
     */

    const {
      data: teamSeasons,
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
        );

    if (
      teamSeasonError
    ) {
      throw teamSeasonError;
    }

    if (
      !teamSeasons ||
      teamSeasons.length ===
        0
    ) {
      return NextResponse.json(
        {
          error:
            "No World Cup data is available yet.",
        },
        {
          status: 404,
        }
      );
    }

    const valid =
      teamSeasons.filter(
        (row) => {
          const season =
            Array.isArray(
              row.season
            )
              ? row.season[0]
              : row.season;

          return (
            season &&
            Number.isInteger(
              season.year
            )
          );
        }
      );

    if (
      valid.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No World Cup team-seasons are available.",
        },
        {
          status: 404,
        }
      );
    }

    const selected =
      valid[
        Math.floor(
          Math.random() *
            valid.length
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

    let gameSessionId:
      | string
      | null = null;

    if (
      !user.is_anonymous
    ) {
      const {
        data: session,
        error:
          sessionError,
      } =
        await supabaseAdmin
          .from(
            "game_sessions"
          )
          .insert({
            user_id:
              user.id,

            game_mode:
              "world",

            status:
              "started",

            world_team_season_id:
              selected.id,

            challenge_id:
              requestedChallengeId ||
              null,

            context: {
              version: 1,

              challengeId:
                requestedChallengeId ||
                null,

              draftSelections: [],

              currentRound: 1,

              teamRespinUsed:
                false,

              seasonRespinUsed:
                false,
            },
          })
          .select(
            "id"
          )
          .single();

      if (
        sessionError
      ) {
        throw sessionError;
      }

      gameSessionId =
        session.id;
    }

    return NextResponse.json({
      gameSessionId,

      teamSeasonId:
        selected.id,

      team: {
        id:
          team.id,

        name:
          team.name,

        shortName:
          team.short_name,

        slug:
          team.slug,
      },

      season: {
        id:
          season.id,

        year:
          season.year,
      },
    });
  } catch (error) {
    console.error(
      "World challenge endpoint error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to start World Domination.",
      },
      {
        status: 500,
      }
    );
  }
}

async function loadWorldChallenge(
  teamSeasonId:
    | string
    | null,
  gameSessionId:
    string
) {
  if (
    !teamSeasonId
  ) {
    return NextResponse.json(
      {
        error:
          "The World game session has no active team-season.",
      },
      {
        status: 409,
      }
    );
  }

  const {
    data,
    error,
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
        teamSeasonId
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
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
      data.team
    )
      ? data.team[0]
      : data.team;

  const season =
    Array.isArray(
      data.season
    )
      ? data.season[0]
      : data.season;

  return NextResponse.json({
    gameSessionId,

    teamSeasonId:
      data.id,

    team,

    season,
  });
}