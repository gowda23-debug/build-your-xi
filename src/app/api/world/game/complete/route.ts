import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  evaluateWorldXI,
} from "@/lib/world/scoring";

import {
  validateWorldXI,
} from "@/lib/world/validate-xi"

import type {
  WorldPlayer,
} from "@/types/world";

type DraftSelection = {
  playerId: string;
  teamSeasonId: string;
};

type SessionContext = {
  challengeId?: string | null;
  draftSelections?: DraftSelection[];
  [key: string]: unknown;
};

export const dynamic =
  "force-dynamic";

export async function POST(
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

    const body =
      (await request
        .json()
        .catch(
          () => ({})
        )) as {
        gameSessionId?: string;
      };

    const gameSessionId =
      typeof body.gameSessionId ===
      "string"
        ? body.gameSessionId.trim()
        : "";

    if (!gameSessionId) {
      return NextResponse.json(
        {
          error:
            "gameSessionId is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Guests deliberately do not persist
     * World games.
     */
    if (
      user.is_anonymous
    ) {
      return NextResponse.json(
        {
          error:
            "Guest World games cannot be completed through the persistent game endpoint.",
        },
        {
          status: 403,
        }
      );
    }

    const {
      data: session,
      error:
        sessionError,
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
          gameSessionId
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

    if (
      sessionError
    ) {
      throw sessionError;
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
            "This World game has already been completed.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      !session.world_team_season_id
    ) {
      return NextResponse.json(
        {
          error:
            "World game session has no team-season.",
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

    const selections =
      Array.isArray(
        context.draftSelections
      )
        ? context.draftSelections
        : [];

    if (
      selections.length !==
      11
    ) {
      return NextResponse.json(
        {
          error:
            "The World XI is not complete.",
        },
        {
          status: 400,
        }
      );
    }

    const selectedPlayers:
      WorldPlayer[] = [];

    for (
      const selection of
        selections
    ) {
      if (
        selection.teamSeasonId !==
        session.world_team_season_id
      ) {
        return NextResponse.json(
          {
            error:
              "The game session contains an invalid team-season selection.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: stat,
        error:
          statError,
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
            session.world_team_season_id
          )
          .eq(
            "player_id",
            selection.playerId
          )
          .maybeSingle();

      if (
        statError
      ) {
        throw statError;
      }

      if (!stat) {
        return NextResponse.json(
          {
            error:
              "One or more selected World players are invalid.",
          },
          {
            status: 400,
          }
        );
      }

      const player =
        Array.isArray(
          stat.player
        )
          ? stat.player[0]
          : stat.player;

      if (!player) {
        return NextResponse.json(
          {
            error:
              "Selected World player could not be resolved.",
          },
          {
            status: 500,
          }
        );
      }

      const {
        data: roleRows,
        error:
          roleError,
      } =
        await supabaseAdmin
          .from(
            "player_roles"
          )
          .select(
            "role"
          )
          .eq(
            "player_id",
            player.id
          );

      if (
        roleError
      ) {
        throw roleError;
      }

      const allowedRoles =
        new Set([
          "BAT",
          "WK",
          "AR",
          "BOWL",
        ]);

      const role =
        (
          roleRows ??
          []
        )
          .map(
            (row) =>
              row.role
          )
          .find(
            (value) =>
              allowedRoles.has(
                value
              )
          );

      if (!role) {
        return NextResponse.json(
          {
            error:
              "A selected player does not have a verified role.",
          },
          {
            status: 400,
          }
        );
      }

      selectedPlayers.push({
        id:
          player.id,

        name:
          player.full_name,

        role,

        stats: {
          matches:
            stat.matches ??
            0,

          innings:
            stat.innings ??
            0,

          runs:
            stat.runs ??
            0,

          battingAverage:
            stat.batting_average ??
            null,

          strikeRate:
            stat.strike_rate ??
            null,

          hundreds:
            stat.hundreds ??
            0,

          fifties:
            stat.fifties ??
            0,

          wickets:
            stat.wickets ??
            0,

          bowlingAverage:
            stat.bowling_average ??
            null,

          economy:
            stat.economy ??
            null,

          catches:
            stat.catches ??
            0,

          stumpings:
            stat.stumpings ??
            0,
        },
      });
    }

    const validation =
      validateWorldXI(
        selectedPlayers
      );

    if (
      !validation.valid
    ) {
      return NextResponse.json(
        {
          error:
            "The selected XI does not satisfy the World rules.",
          details:
            validation.errors,
        },
        {
          status: 400,
        }
      );
    }

    const result =
      evaluateWorldXI(
        selectedPlayers,
        gameSessionId
      );

    const challengeId =
      session.challenge_id ??
      (
        typeof context.challengeId ===
        "string"
          ? context.challengeId
          : null
      );

    /*
     * Persist the authoritative result.
     *
     * The session is transitioned before returning success.
     */
    const storedResult = {
      version: 1,

      challengeId,

      gameMode:
        "world",

      teamSeasonId:
        session.world_team_season_id,

      players:
        selectedPlayers.map(
          (player) => ({
            id:
              player.id,

            name:
              player.name,

            role:
              player.role,
          })
        ),

      score:
        result.score,

      teamStrength:
        result.teamStrength,

      wins:
        result.wins,

      losses:
        result.losses,

      matches:
        result.matches,

      breakdown:
        result.breakdown,
    };

    /*
     * Insert authoritative score.
     *
     * Score is calculated exclusively on the server.
     */
    const {
      data: gameScore,
      error:
        scoreError,
    } =
      await supabaseAdmin
        .from(
          "game_scores"
        )
        .insert({
          user_id:
            user.id,

          game_mode:
            "world",

          score:
            result.score,

          result:
            storedResult,
        })
        .select(
          "id, score, created_at"
        )
        .single();

    if (
      scoreError
    ) {
      throw scoreError;
    }

    /*
     * Mark the session completed.
     *
     * The filter prevents a second completion
     * from changing an already-completed session.
     */
    const {
      data: completedSession,
      error:
        completionError,
    } =
      await supabaseAdmin
        .from(
          "game_sessions"
        )
        .update({
          status:
            "completed",
        })
        .eq(
          "id",
          session.id
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "status",
          "started"
        )
        .select(
          "id"
        )
        .maybeSingle();

    if (
      completionError
    ) {
      throw completionError;
    }

    if (
      !completedSession
    ) {
      return NextResponse.json(
        {
          error:
            "The World game was already completed.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * Challenge score.
     *
     * Only the server writes it.
     */
    if (
      challengeId
    ) {
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
            challengeId
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
              "The World game completed, but you are not a member of this challenge.",
          },
          {
            status: 403,
          }
        );
      }

      const {
        data: existing,
        error:
          existingError,
      } =
        await supabaseAdmin
          .from(
            "challenge_scores"
          )
          .select(
            "score"
          )
          .eq(
            "challenge_id",
            challengeId
          )
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();

      if (
        existingError
      ) {
        throw existingError;
      }

      if (
        !existing
      ) {
        const {
          error,
        } =
          await supabaseAdmin
            .from(
              "challenge_scores"
            )
            .insert({
              challenge_id:
                challengeId,

              user_id:
                user.id,

              score:
                result.score,
            });

        if (error) {
          throw error;
        }
      } else if (
        result.score >
        Number(
          existing.score
        )
      ) {
        const {
          error,
        } =
          await supabaseAdmin
            .from(
              "challenge_scores"
            )
            .update({
              score:
                result.score,
            })
            .eq(
              "challenge_id",
              challengeId
            )
            .eq(
              "user_id",
              user.id
            );

        if (error) {
          throw error;
        }
      }
    }

    return NextResponse.json({
      result: {
        score:
          result.score,

        teamStrength:
          result.teamStrength,

        wins:
          result.wins,

        losses:
          result.losses,

        matches:
          result.matches,

        breakdown:
          result.breakdown,
      },

      gameScoreId:
        gameScore.id,

      completedAt:
        gameScore.created_at,
    });
  } catch (error) {
    console.error(
      "World game completion error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to complete the World game.",
      },
      {
        status: 500,
      }
    );
  }
}