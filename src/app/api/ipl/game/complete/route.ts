import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/profile/ensure-profile";

import {
  getVenueById,
} from "@/lib/ipl-challenge/server-venue";

import { evaluateXI } from "@/lib/ipl-challenge/scoring";
import { validateXI } from "@/lib/ipl-challenge/validate-xi";

import type {
  IPLPlayer,
  PitchProfile,
} from "@/types/ipl";

export const dynamic = "force-dynamic";

type DraftSelection = {
  playerId: string;
  teamSeasonId: string;
};

type RequestBody = {
  gameSessionId?: string | null;

  /*
   * Guests submit their locally maintained
   * player/team-season selections.
   *
   * The server verifies every one of them.
   */
  selectedPlayers?: DraftSelection[];

  /*
   * Guests submit only the locked venue ID.
   *
   * The actual venue and pitch are loaded
   * again from the database.
   */
  venueId?: string | null;

  /*
   * This identifies the team-season from which the
   * original locked venue was selected.
   *
   * It is separate from the first selected player
   * because a player may use a team respin before
   * selecting the first player.
   */
  venueOriginTeamSeasonId?: string | null;
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

function isValidDraftSelection(
  value: unknown
): value is DraftSelection {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const selection =
    value as Partial<DraftSelection>;

  return (
    typeof selection.playerId ===
    "string" &&
    selection.playerId.trim().length >
    0 &&
    typeof selection.teamSeasonId ===
    "string" &&
    selection.teamSeasonId.trim().length >
    0
  );
}

function buildGuestEvaluationId(
  draftSelections: DraftSelection[],
  venueId: string
) {
  return [
    "guest",
    venueId,
    ...draftSelections.map(
      (selection) =>
        `${selection.playerId}:${selection.teamSeasonId}`
    ),
  ].join("|");
}

export async function POST(
  request: Request
) {
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
     * Parse request once.
     */
    const body =
      (await request
        .json()
        .catch(() => ({}))) as RequestBody;

    /*
     * ============================================================
     * GUEST FLOW
     * ============================================================
     *
     * Guests are intentionally sessionless.
     *
     * NO:
     *   game_sessions
     *   game_scores
     *   challenge_scores
     *   leaderboard records
     *
     * The server only verifies the submitted game
     * and calculates the result.
     */

    if (user.is_anonymous) {
      const draftSelections =
        Array.isArray(
          body.selectedPlayers
        )
          ? body.selectedPlayers
          : [];

      const venueId =
        typeof body.venueId ===
          "string" &&
          body.venueId.trim().length > 0
          ? body.venueId.trim()
          : null;

      const venueOriginTeamSeasonId =
        typeof body.venueOriginTeamSeasonId ===
          "string" &&
          body.venueOriginTeamSeasonId
            .trim().length > 0
          ? body.venueOriginTeamSeasonId.trim()
          : null;

      /*
       * ------------------------------------------------------------
       * BASIC REQUEST VALIDATION
       * ------------------------------------------------------------
       */

      if (
        draftSelections.length !==
        11
      ) {
        return NextResponse.json(
          {
            error:
              "A complete XI of 11 players is required.",
          },
          {
            status: 400,
          }
        );
      }

      if (!venueId) {
        return NextResponse.json(
          {
            error:
              "A valid venue is required to complete this game.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        !venueOriginTeamSeasonId
      ) {
        return NextResponse.json(
          {
            error:
              "The original game team-season could not be verified.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        !draftSelections.every(
          isValidDraftSelection
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid player selection data.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * DUPLICATE PLAYER CHECK
       * ------------------------------------------------------------
       */

      const uniquePlayerIds =
        new Set(
          draftSelections.map(
            (selection) =>
              selection.playerId
          )
        );

      if (
        uniquePlayerIds.size !==
        11
      ) {
        return NextResponse.json(
          {
            error:
              "The selected XI contains duplicate players.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * VERIFY LOCKED VENUE
       * ------------------------------------------------------------
       *
       * The venue must belong to the team-season from
       * the original randomisation.
       *
       * This handles the case where the guest uses a
       * team/season respin before selecting a player.
       */

      const {
        data: venueLink,
        error: venueLinkError,
      } = await supabaseAdmin
        .from(
          "ipl_team_season_venues"
        )
        .select(
          "venue_id"
        )
        .eq(
          "team_season_id",
          venueOriginTeamSeasonId
        )
        .eq(
          "venue_id",
          venueId
        )
        .maybeSingle();

      if (
        venueLinkError
      ) {
        console.error(
          "Guest venue verification error:",
          venueLinkError
        );

        return NextResponse.json(
          {
            error:
              "Unable to verify the game venue.",
          },
          {
            status: 500,
          }
        );
      }

      if (!venueLink) {
        return NextResponse.json(
          {
            error:
              "The submitted venue does not belong to the original game team-season.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * Reload the actual venue from Supabase.
       *
       * The client cannot supply pitch factors.
       */
      let venue;

      try {
        venue =
          await getVenueById(
            venueId
          );
      } catch (
      venueError
      ) {
        console.error(
          "Guest venue lookup error:",
          venueError
        );

        return NextResponse.json(
          {
            error:
              "Unable to load the game venue.",
          },
          {
            status: 500,
          }
        );
      }

      if (!venue) {
        return NextResponse.json(
          {
            error:
              "The selected venue could not be found.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * ------------------------------------------------------------
       * LOAD AUTHORITATIVE PLAYER DATA
       * ------------------------------------------------------------
       */

      const selectedPlayers:
        IPLPlayer[] = [];

      for (
        const selection of
        draftSelections
      ) {
        const playerId =
          selection.playerId;

        const teamSeasonId =
          selection.teamSeasonId;

        const {
          data: playerStat,
          error:
          playerStatError,
        } =
          await supabaseAdmin
            .from(
              "ipl_team_season_player_stats"
            )
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
            .eq(
              "team_season_id",
              teamSeasonId
            )
            .eq(
              "player_id",
              playerId
            )
            .maybeSingle();

        if (
          playerStatError
        ) {
          console.error(
            "Guest completion player query error:",
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
          Array.isArray(
            playerStat.player
          )
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
          id:
            player.id,

          name:
            player.name,

          role:
            player.role,

          stats: {
            matches:
              playerStat.matches ??
              0,

            battingInnings:
              playerStat.batting_innings ??
              0,

            runs:
              playerStat.runs ??
              0,

            ballsFaced:
              playerStat.balls_faced ??
              0,

            fours:
              playerStat.fours ??
              0,

            sixes:
              playerStat.sixes ??
              0,

            highestScore:
              playerStat.highest_score ??
              0,

            dismissals:
              playerStat.dismissals ??
              0,

            bowlingInnings:
              playerStat.bowling_innings ??
              0,

            ballsBowled:
              playerStat.balls_bowled ??
              0,

            runsConceded:
              playerStat.runs_conceded ??
              0,

            wickets:
              playerStat.wickets ??
              0,
          },
        });
      }

      /*
       * ------------------------------------------------------------
       * XI RULE VALIDATION
       * ------------------------------------------------------------
       */

      const validation =
        validateXI(
          selectedPlayers
        );

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
       * ------------------------------------------------------------
       * SERVER-AUTHORITATIVE SCORE
       * ------------------------------------------------------------
       */

      const result =
        evaluateXI({
          players:
            selectedPlayers,

          pitch:
            venue.pitch,

          challengeId:
            buildGuestEvaluationId(
              draftSelections,
              venue.id
            ),
        });

      /*
       * IMPORTANT:
       *
       * Nothing is persisted for a guest.
       */

      return NextResponse.json(
        {
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
            null,

          completedAt:
            null,
        },
        {
          status: 200,
        }
      );
    }

    /*
     * ============================================================
     * REGISTERED PLAYER FLOW
     * ============================================================
     *
     * From this point onward the original persistent
     * registered-player implementation is preserved.
     */

    try {
      await ensureProfile(
        user
      );
    } catch (
    profileError
    ) {
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

    const gameSessionId =
      typeof body.gameSessionId ===
        "string" &&
        body.gameSessionId.trim()
          .length > 0
        ? body.gameSessionId.trim()
        : null;

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
     * ============================================================
     * LOAD AUTHORITATIVE GAME SESSION
     * ============================================================
     */

    const {
      data: session,
      error: sessionError,
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
  team_season_id,
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
          "ipl"
        )
        .maybeSingle();

    if (
      sessionError
    ) {
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
          error:
            "Game session not found.",
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
            "This game session has already been completed or is no longer active.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      !session.team_season_id
    ) {
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
      (session.context ??
        {}) as SessionContext;

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

    if (
      sessionChallengeId &&
      contextChallengeId &&
      sessionChallengeId !==
      contextChallengeId
    ) {
      return NextResponse.json(
        {
          error:
            "Game session challenge data is inconsistent.",
          code:
            "GAME_SESSION_CHALLENGE_MISMATCH",
        },
        {
          status: 409,
        }
      );
    }

    const challengeId =
      sessionChallengeId ??
      contextChallengeId ??
      null;

    const venueSnapshot =
      context.venueSnapshot;

    const draftSelections =
      Array.isArray(
        context.draftSelections
      )
        ? context.draftSelections
        : [];

    if (
      draftSelections.length !==
      11
    ) {
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

    const uniqueDraftPlayerIds =
      new Set(
        draftSelections.map(
          (selection) =>
            selection.playerId
        )
      );

    if (
      uniqueDraftPlayerIds.size !==
      11
    ) {
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
      venueSnapshot?.pitch ??
      null;

    if (
      !venueSnapshot?.id ||
      !pitch
    ) {
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
     */

    const selectedPlayers:
      IPLPlayer[] = [];

    for (
      const selection of
      draftSelections
    ) {
      const playerId =
        selection.playerId;

      const teamSeasonId =
        selection.teamSeasonId;

      if (
        typeof playerId !==
        "string" ||
        typeof teamSeasonId !==
        "string"
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
        error:
        playerStatError,
      } =
        await supabaseAdmin
          .from(
            "ipl_team_season_player_stats"
          )
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
          .eq(
            "team_season_id",
            teamSeasonId
          )
          .eq(
            "player_id",
            playerId
          )
          .maybeSingle();

      if (
        playerStatError
      ) {
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
        Array.isArray(
          playerStat.player
        )
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
        id:
          player.id,

        name:
          player.name,

        role:
          player.role,

        stats: {
          matches:
            playerStat.matches ??
            0,

          battingInnings:
            playerStat.batting_innings ??
            0,

          runs:
            playerStat.runs ??
            0,

          ballsFaced:
            playerStat.balls_faced ??
            0,

          fours:
            playerStat.fours ??
            0,

          sixes:
            playerStat.sixes ??
            0,

          highestScore:
            playerStat.highest_score ??
            0,

          dismissals:
            playerStat.dismissals ??
            0,

          bowlingInnings:
            playerStat.bowling_innings ??
            0,

          ballsBowled:
            playerStat.balls_bowled ??
            0,

          runsConceded:
            playerStat.runs_conceded ??
            0,

          wickets:
            playerStat.wickets ??
            0,
        },
      });
    }

    /*
     * ============================================================
     * XI VALIDATION
     * ============================================================
     */

    const validation =
      validateXI(
        selectedPlayers
      );

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
     */

    const result =
      evaluateXI({
        players:
          selectedPlayers,

        pitch,

        challengeId:
          gameSessionId,
      });

    /*
     * ============================================================
     * BUILD STORED RESULT
     * ============================================================
     */

    const storedResult = {
      version: 1,

      /*
       * ============================================================
       * CHALLENGE MARKER
       * ============================================================
       *
       * Normal game:
       *   challengeId = null
       *
       * Challenge game:
       *   challengeId = actual challenge UUID
       *
       * This is written by the SERVER from the authoritative
       * game-session context. The client does not supply it.
       *
       * Global leaderboard uses this marker to exclude
       * challenge games from the global tally.
       */
      challengeId:
        challengeId ?? null,

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
        id:
          venueSnapshot.id,

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

      wins:
        result.wins,

      losses:
        result.losses,

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
     */

    const {
      data: completion,
      error:
      completionError,
    } =
      await supabaseAdmin.rpc(
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

    if (
      completionError
    ) {
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
      Array.isArray(
        completion
      )
        ? completion[0]
        : completion;

    /*
     * ============================================================
     * CHALLENGE SCORE
     * ============================================================
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

      const {
        data:
        existingChallengeScore,
        error:
        existingScoreError,
      } =
        await supabaseAdmin
          .from(
            "challenge_scores"
          )
          .select(
            "challenge_id, user_id, score"
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
        existingScoreError
      ) {
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

      if (
        !existingChallengeScore
      ) {
        const {
          data:
          insertedChallengeScore,
          error:
          challengeScoreInsertError,
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

        if (
          !insertedChallengeScore ||
          insertedChallengeScore.challenge_id !==
          challengeId ||
          insertedChallengeScore.user_id !==
          user.id ||
          Number(
            insertedChallengeScore.score
          ) !==
          Number(
            result.score
          )
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
      } else {
        const existingScore =
          Number(
            existingChallengeScore.score
          );

        if (
          Number.isFinite(
            existingScore
          ) &&
          result.score >
          existingScore
        ) {
          const {
            data:
            updatedChallengeScore,
            error:
            challengeScoreUpdateError,
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
            Number(
              result.score
            )
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
  } catch (
  error
  ) {
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