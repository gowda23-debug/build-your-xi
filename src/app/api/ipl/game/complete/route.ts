import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  evaluateXI,
} from "@/lib/ipl-challenge/scoring";

import {
  validateXI,
} from "@/lib/ipl-challenge/validate-xi";

import type {
  IPLPlayer,
  PitchProfile,
} from "@/types/ipl";

export const dynamic = "force-dynamic";

type RequestBody = {
  gameSessionId?: string;
  playerIds?: string[];
};

type SessionContext = {
  version?: number;

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
     * Guests are intentionally not persisted.
     *
     * The server-authoritative registered-game flow
     * requires a real game session.
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
     * REQUEST VALIDATION
     * ============================================================
     */

    const body =
      (await request
        .json()
        .catch(() => ({}))) as RequestBody;

    const gameSessionId =
      typeof body.gameSessionId ===
        "string" &&
      body.gameSessionId.trim()
        .length > 0
        ? body.gameSessionId.trim()
        : null;

    const playerIds =
      Array.isArray(body.playerIds)
        ? body.playerIds.filter(
            (id): id is string =>
              typeof id === "string" &&
              id.trim().length > 0
          )
        : [];

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
     * Exactly 11 players are required.
     */
    if (playerIds.length !== 11) {
      return NextResponse.json(
        {
          error:
            "Exactly 11 players are required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Reject duplicate player IDs.
     */
    const uniquePlayerIds =
      new Set(playerIds);

    if (
      uniquePlayerIds.size !==
      11
    ) {
      return NextResponse.json(
        {
          error:
            "The playing XI contains duplicate players.",
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

    const venueSnapshot =
      context.venueSnapshot;

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
     * IMPORTANT:
     *
     * We do NOT accept:
     *
     * - teamSeasonId
     * - venue
     * - pitch
     * - score
     * - wins
     * - losses
     *
     * from the client.
     *
     * The session is the authority.
     */

    const teamSeasonId =
      session.team_season_id;

    /*
     * ============================================================
     * LOAD AUTHORITATIVE PLAYER DATA
     * ============================================================
     */

    const {
      data: playerStats,
      error: playerStatsError,
    } = await supabaseAdmin
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
      .in(
        "player_id",
        playerIds
      );

    if (playerStatsError) {
      console.error(
        "Game completion player query error:",
        playerStatsError
      );

      return NextResponse.json(
        {
          error:
            "Unable to verify the selected players.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Every submitted player must exist in the
     * authoritative team-season pool.
     */
    if (
      !playerStats ||
      playerStats.length !==
        11
    ) {
      return NextResponse.json(
        {
          error:
            "One or more selected players do not belong to the current team-season.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ============================================================
     * NORMALIZE SERVER PLAYER DATA
     * ============================================================
     */

    const players: IPLPlayer[] =
      [];

    for (const stat of playerStats) {
      const player =
        Array.isArray(
          stat.player
        )
          ? stat.player[0]
          : stat.player;

      if (
        !player ||
        !player.id ||
        !player.name ||
        !player.role
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid player data exists in the selected team-season.",
          },
          {
            status: 500,
          }
        );
      }

      players.push({
        id: player.id,

        name: player.name,

        role: player.role,

        stats: {
          matches:
            stat.matches ?? 0,

          battingInnings:
            stat.batting_innings ??
            0,

          runs:
            stat.runs ?? 0,

          ballsFaced:
            stat.balls_faced ??
            0,

          fours:
            stat.fours ?? 0,

          sixes:
            stat.sixes ?? 0,

          highestScore:
            stat.highest_score ??
            0,

          dismissals:
            stat.dismissals ??
            0,

          bowlingInnings:
            stat.bowling_innings ??
            0,

          ballsBowled:
            stat.balls_bowled ??
            0,

          runsConceded:
            stat.runs_conceded ??
            0,

          wickets:
            stat.wickets ?? 0,
        },
      });
    }

    /*
     * Preserve the exact player order submitted by the client.
     *
     * The score engine itself does not depend on selection order,
     * but keeping the order makes the stored result deterministic
     * and useful later for challenge snapshots.
     */
    const playerMap =
      new Map(
        players.map(
          (player) => [
            player.id,
            player,
          ]
        )
      );

    const selectedPlayers =
      playerIds.map(
        (playerId) =>
          playerMap.get(
            playerId
          )!
      );

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

        /*
         * The challenge identity comes from
         * the server session, not the client.
         */
        challengeId:
          teamSeasonId,
      });

    /*
     * ============================================================
     * PERSIST AUTHORITATIVE RESULT
     * ============================================================
     */

    const storedResult = {
      version: 1,

      teamSeasonId,

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
      Array.isArray(
        completion
      )
        ? completion[0]
        : completion;

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