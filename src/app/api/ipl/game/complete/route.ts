import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/profile/ensure-profile";

import { evaluateXI } from "@/lib/ipl-challenge/scoring";
import { validateXI } from "@/lib/ipl-challenge/validate-xi";

import type {
  IPLPlayer,
  PitchProfile,
} from "@/types/ipl";

export const dynamic = "force-dynamic";

type RequestBody = {
  gameSessionId?: string;
};

type SessionContext = {
  version?: number;

  challengeId?: string;

  draftSelections?: {
    playerId: string;
    teamSeasonId: string;
  }[];

  currentRound?: number;

  venueId?: string;

  venueSnapshot?: {
    id?: string;
    name?: string;
    city?: string | null;
    country?: string;
    pitch?: PitchProfile;
  };

  teamRespinUsed?: boolean;
  seasonRespinUsed?: boolean;

  initialTeamSeasonId?: string;
  initialTeamId?: string;
  initialSeasonId?: string;

  [key: string]: unknown;
};

export async function POST(request: Request) {
  try {
    /*
     * ============================================================
     * AUTHENTICATION
     * ============================================================
     */

    const {
      user,
      error: authError,
    } = await requireUser();

    if (authError || !user) {
      return (
        authError ??
        NextResponse.json(
          {
            error: "Unauthorized",
          },
          {
            status: 401,
          }
        )
      );
    }

    /*
     * Guests are intentionally not persisted.
     *
     * The authoritative game completion flow requires
     * a registered authenticated user.
     */

    if (user.is_anonymous) {
      return NextResponse.json(
        {
          error:
            "Registered authentication is required to submit an authoritative game result.",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * ============================================================
     * ENSURE PLAYER PROFILE
     * ============================================================
     *
     * game_scores.user_id references profiles.id.
     *
     * Make sure the profile exists before completing the game.
     */

    try {
      await ensureProfile(user);
    } catch (profileError) {
      console.error(
        "Game completion profile error:",
        profileError
      );

      return NextResponse.json(
        {
          error:
            "Unable to prepare your player profile. Please try again.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ============================================================
     * REQUEST VALIDATION
     * ============================================================
     */

    const body =
      (await request.json().catch(() => ({}))) as RequestBody;

    const gameSessionId =
      typeof body.gameSessionId === "string" &&
      body.gameSessionId.trim().length > 0
        ? body.gameSessionId.trim()
        : null;

    if (!gameSessionId) {
      return NextResponse.json(
        {
          error: "gameSessionId is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ============================================================
     * LOAD AUTHORITATIVE GAME SESSION
     * ============================================================
     *
     * IMPORTANT:
     *
     * The browser is NOT trusted for:
     *
     * - score
     * - team
     * - season
     * - venue
     * - pitch
     * - selected-player statistics
     *
     * Everything important is reconstructed from the
     * server-side game session.
     */

    const {
      data: session,
      error: sessionError,
    } = await supabaseAdmin
      .from("game_sessions")
      .select(
        `
        id,
        user_id,
        game_mode,
        status,
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
        "Game completion session query error:",
        sessionError
      );

      return NextResponse.json(
        {
          error:
            "Unable to verify the game session.",
        },
        {
          status: 500,
        }
      );
    }

    if (!session) {
      return NextResponse.json(
        {
          error: "Game session not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * A game session may only be completed once.
     */

    if (session.status !== "started") {
      return NextResponse.json(
        {
          error:
            "This game session has already been completed or is no longer active.",
        },
        {
          status: 409,
        }
      );
    }

    if (!session.team_season_id) {
      return NextResponse.json(
        {
          error:
            "The game session has no active team-season.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * ============================================================
     * LOCKED SESSION CONTEXT
     * ============================================================
     */

    const context =
      (session.context ?? {}) as SessionContext;

    /*
     * If this game came from a challenge, challengeId is
     * taken ONLY from the authoritative session context.
     *
     * The browser does not send the challengeId here.
     */

    const challengeId =
      typeof context.challengeId === "string"
        ? context.challengeId
        : null;

    const venueSnapshot =
      context.venueSnapshot;

    const draftSelections =
      Array.isArray(context.draftSelections)
        ? context.draftSelections
        : [];

    /*
     * A completed XI must contain exactly 11 players.
     */

    if (draftSelections.length !== 11) {
      return NextResponse.json(
        {
          error:
            "The game session does not contain a complete playing XI.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * No duplicate players.
     */

    const uniqueDraftPlayerIds =
      new Set(
        draftSelections.map(
          (selection) => selection.playerId
        )
      );

    if (uniqueDraftPlayerIds.size !== 11) {
      return NextResponse.json(
        {
          error:
            "The game session contains duplicate player selections.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ============================================================
     * LOCKED VENUE / PITCH
     * ============================================================
     */

    const pitch =
      venueSnapshot?.pitch ?? null;

    if (!venueSnapshot?.id || !pitch) {
      return NextResponse.json(
        {
          error:
            "The game session does not contain a valid locked venue.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * ============================================================
     * LOAD AUTHORITATIVE PLAYER DATA
     * ============================================================
     *
     * Every selected player is verified against the exact
     * team-season recorded when that player was selected.
     *
     * This is important because every round can have a different
     * team-season.
     */

    const selectedPlayers: IPLPlayer[] = [];

    for (const selection of draftSelections) {
      const playerId =
        selection.playerId;

      const teamSeasonId =
        selection.teamSeasonId;

      if (
        typeof playerId !== "string" ||
        typeof teamSeasonId !== "string"
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid player selection data in the game session.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: playerStat,
        error: playerStatError,
      } = await supabaseAdmin
        .from("ipl_team_season_player_stats")
        .select(
          `
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
        `
        )
        .eq("team_season_id", teamSeasonId)
        .eq("player_id", playerId)
        .maybeSingle();

      if (playerStatError) {
        console.error(
          "Game completion player query error:",
          playerStatError
        );

        return NextResponse.json(
          {
            error:
              "Unable to verify one of the selected players.",
          },
          {
            status: 500,
          }
        );
      }

      if (!playerStat) {
        return NextResponse.json(
          {
            error:
              "One or more selected players do not belong to their recorded team-season.",
          },
          {
            status: 400,
          }
        );
      }

      const player =
        Array.isArray(playerStat.player)
          ? playerStat.player[0]
          : playerStat.player;

      if (
        !player ||
        !player.id ||
        !player.name ||
        !player.role
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid player data exists in one of the selected team-seasons.",
          },
          {
            status: 500,
          }
        );
      }

      selectedPlayers.push({
        id: player.id,
        name: player.name,
        role: player.role,

        stats: {
          matches:
            playerStat.matches ?? 0,

          battingInnings:
            playerStat.batting_innings ?? 0,

          runs:
            playerStat.runs ?? 0,

          ballsFaced:
            playerStat.balls_faced ?? 0,

          fours:
            playerStat.fours ?? 0,

          sixes:
            playerStat.sixes ?? 0,

          highestScore:
            playerStat.highest_score ?? 0,

          dismissals:
            playerStat.dismissals ?? 0,

          bowlingInnings:
            playerStat.bowling_innings ?? 0,

          ballsBowled:
            playerStat.balls_bowled ?? 0,

          runsConceded:
            playerStat.runs_conceded ?? 0,

          wickets:
            playerStat.wickets ?? 0,
        },
      });
    }

    /*
     * ============================================================
     * XI VALIDATION
     * ============================================================
     */

    const validation =
      validateXI(selectedPlayers);

    if (!validation.valid) {
      return NextResponse.json(
        {
          error:
            "The selected XI does not satisfy the game rules.",
          details:
            validation.errors,
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ============================================================
     * SERVER-AUTHORITATIVE SCORE
     * ============================================================
     *
     * The score is calculated on the server.
     *
     * The browser never supplies the score.
     */

    const result =
      evaluateXI({
        players: selectedPlayers,
        pitch,

        /*
         * The game session is used as the authoritative
         * evaluation identity.
         */
        challengeId: gameSessionId,
      });

    /*
     * ============================================================
     * BUILD STORED RESULT
     * ============================================================
     */

    const storedResult = {
      version: 1,

      draftSelections:
        draftSelections.map(
          ({
            playerId,
            teamSeasonId,
          }) => ({
            playerId,
            teamSeasonId,
          })
        ),

      teamSeasonIds: [
        ...new Set(
          draftSelections.map(
            (selection) =>
              selection.teamSeasonId
          )
        ),
      ],

      venue: {
        id: venueSnapshot.id,

        name:
          venueSnapshot.name ??
          null,

        city:
          venueSnapshot.city ??
          null,

        country:
          venueSnapshot.country ??
          null,
      },

      pitch,

      players:
        selectedPlayers.map(
          (player) => ({
            id: player.id,
            name: player.name,
            role: player.role,
          })
        ),

      score: result.score,

      wins: result.wins,

      losses: result.losses,

      teamStrength:
        result.teamStrength,

      breakdown:
        result.breakdown,

      matches:
        result.matches,
    };

    /*
     * ============================================================
     * COMPLETE GAME
     * ============================================================
     *
     * This RPC persists the authoritative game result.
     */

    const {
      data: completion,
      error: completionError,
    } = await supabaseAdmin.rpc(
      "complete_ipl_game",
      {
        p_game_session_id:
          gameSessionId,

        p_user_id:
          user.id,

        p_score:
          result.score,

        p_result:
          storedResult,
      }
    );

    if (completionError) {
      console.error(
        "IPL game completion error:",
        completionError
      );

      if (
        completionError.message?.includes(
          "GAME_SESSION_NOT_ACTIVE"
        )
      ) {
        return NextResponse.json(
          {
            error:
              "This game has already been completed or is no longer active.",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json(
        {
          error:
            "Unable to save the game result.",
        },
        {
          status: 500,
        }
      );
    }

    const completionRow =
      Array.isArray(completion)
        ? completion[0]
        : completion;

    /*
     * ============================================================
     * ATTACH SCORE TO CHALLENGE
     * ============================================================
     *
     * If the game belongs to a challenge:
     *
     * 1. Verify the user is a member.
     * 2. Check whether the user already has a challenge score.
     * 3. Insert if there is no score.
     * 4. Update only if the new score is higher.
     * 5. Never replace a higher score with a lower score.
     *
     * The score always comes from result.score calculated
     * by the server.
     */

    if (challengeId) {
      /*
       * ----------------------------------------------------------
       * VERIFY CHALLENGE MEMBERSHIP
       * ----------------------------------------------------------
       */

      const {
        data: membership,
        error: membershipError,
      } = await supabaseAdmin
        .from("challenge_players")
        .select("challenge_id")
        .eq("challenge_id", challengeId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) {
        console.error(
          "Challenge membership verification error:",
          membershipError
        );

        return NextResponse.json(
          {
            error:
              "The game was completed, but the challenge membership could not be verified.",
          },
          {
            status: 500,
          }
        );
      }

      if (!membership) {
        return NextResponse.json(
          {
            error:
              "The game was completed, but you are not a member of this challenge.",
          },
          {
            status: 403,
          }
        );
      }

      /*
       * ----------------------------------------------------------
       * LOAD EXISTING CHALLENGE SCORE
       * ----------------------------------------------------------
       */

      const {
        data: existingChallengeScore,
        error: existingScoreError,
      } = await supabaseAdmin
        .from("challenge_scores")
        .select(
          "challenge_id, user_id, score"
        )
        .eq("challenge_id", challengeId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingScoreError) {
        console.error(
          "Challenge score lookup error:",
          existingScoreError
        );

        return NextResponse.json(
          {
            error:
              "The game was completed, but the challenge score could not be checked.",
          },
          {
            status: 500,
          }
        );
      }

      /*
       * ----------------------------------------------------------
       * FIRST PLAY
       * ----------------------------------------------------------
       *
       * No score exists yet.
       */

      if (!existingChallengeScore) {
        const {
          data: insertedChallengeScore,
          error: challengeScoreInsertError,
        } = await supabaseAdmin
          .from("challenge_scores")
          .insert({
            challenge_id:
              challengeId,

            user_id:
              user.id,

            score:
              result.score,
          })
          .select(
            "challenge_id, user_id, score"
          )
          .single();

        if (
          challengeScoreInsertError
        ) {
          console.error(
            "Challenge score insert error:",
            challengeScoreInsertError
          );

          return NextResponse.json(
            {
              error:
                "The game was completed, but the challenge score could not be saved.",
            },
            {
              status: 500,
            }
          );
        }

        /*
         * Verify that the database actually returned the
         * inserted score.
         */

        if (
          !insertedChallengeScore ||
          insertedChallengeScore.challenge_id !==
            challengeId ||
          insertedChallengeScore.user_id !==
            user.id ||
          Number(
            insertedChallengeScore.score
          ) !==
            Number(result.score)
        ) {
          console.error(
            "Challenge score insert verification failed:",
            insertedChallengeScore
          );

          return NextResponse.json(
            {
              error:
                "The game was completed, but the challenge score could not be verified.",
            },
            {
              status: 500,
            }
          );
        }
      }

      /*
       * ----------------------------------------------------------
       * REPLAY
       * ----------------------------------------------------------
       *
       * The player already has a score for this challenge.
       */

      else {
        const existingScore =
          Number(
            existingChallengeScore.score
          );

        /*
         * Only replace the challenge score when the
         * new score is strictly higher.
         */

        if (
          Number.isFinite(
            existingScore
          ) &&
          result.score >
            existingScore
        ) {
          const {
            data: updatedChallengeScore,
            error: challengeScoreUpdateError,
          } = await supabaseAdmin
            .from("challenge_scores")
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
            )
            .select(
              "challenge_id, user_id, score"
            )
            .single();

          if (
            challengeScoreUpdateError
          ) {
            console.error(
              "Challenge score update error:",
              challengeScoreUpdateError
            );

            return NextResponse.json(
              {
                error:
                  "The game was completed, but the improved challenge score could not be saved.",
              },
              {
                status: 500,
              }
            );
          }

          if (
            !updatedChallengeScore ||
            updatedChallengeScore.challenge_id !==
              challengeId ||
            updatedChallengeScore.user_id !==
              user.id ||
            Number(
              updatedChallengeScore.score
            ) !==
              Number(result.score)
          ) {
            console.error(
              "Challenge score update verification failed:",
              updatedChallengeScore
            );

            return NextResponse.json(
              {
                error:
                  "The improved challenge score could not be verified.",
              },
              {
                status: 500,
              }
            );
          }
        }

        /*
         * If the new score is equal to or lower than the
         * existing score, keep the existing challenge score.
         *
         * The game itself has still been completed and saved
         * in game_scores.
         */
      }
    }

    /*
     * ============================================================
     * SUCCESS
     * ============================================================
     */

    return NextResponse.json({
      result: {
        score:
          result.score,

        breakdown:
          result.breakdown,

        teamStrength:
          result.teamStrength,

        wins:
          result.wins,

        losses:
          result.losses,

        matches:
          result.matches,
      },

      gameScoreId:
        completionRow
          ?.game_score_id ??
        null,

      completedAt:
        completionRow
          ?.completed_at ??
        null,
    });
  } catch (error) {
    console.error(
      "IPL game completion endpoint error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while completing the IPL game.",
      },
      {
        status: 500,
      }
    );
  }
}