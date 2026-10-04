import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type GameMode = "ipl" | "world";

type RequestBody = {
  gameScoreId?: string;
  title?: string;
};

type GameScore = {
  id: string;
  user_id: string;
  score: number | string;
  game_mode: GameMode;
};

type Challenge = {
  id: string;
  creator_id: string;
  title: string;
  game_mode: GameMode;
  invite_code: string;
  status: string;
  created_at: string;
  updated_at: string;
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
     * Challenges require a registered user.
     */

    if (user.is_anonymous) {
      return NextResponse.json(
        {
          error:
            "Registered authentication is required to create a challenge.",
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
      (await request.json().catch(() => ({}))) as RequestBody;

    const gameScoreId =
      typeof body.gameScoreId === "string"
        ? body.gameScoreId.trim()
        : "";

    const requestedTitle =
      typeof body.title === "string"
        ? body.title.trim()
        : "";

    if (!gameScoreId) {
      return NextResponse.json(
        {
          error: "gameScoreId is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * A challenge title is now supplied by the game UI.
     *
     * We still validate it server-side because the browser is
     * never trusted.
     */

    if (!requestedTitle) {
      return NextResponse.json(
        {
          error: "Challenge title is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (requestedTitle.length > 60) {
      return NextResponse.json(
        {
          error:
            "Challenge title must be 60 characters or fewer.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ============================================================
     * VERIFY AUTHORITATIVE GAME SCORE
     * ============================================================
     *
     * IMPORTANT:
     *
     * The browser sends gameScoreId only.
     *
     * The browser does NOT decide:
     *
     *     IPL
     *     World
     *
     * The server reads game_mode directly from game_scores.
     */

    const {
      data: gameScore,
      error: gameScoreError,
    } = await supabaseAdmin
      .from("game_scores")
      .select(
        "id, user_id, score, game_mode"
      )
      .eq("id", gameScoreId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (gameScoreError) {
      console.error(
        "Create challenge game score query error:",
        gameScoreError
      );

      return NextResponse.json(
        {
          error:
            "Unable to verify the completed game.",
        },
        {
          status: 500,
        }
      );
    }

    if (!gameScore) {
      return NextResponse.json(
        {
          error:
            "The completed game could not be found for this player.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * ============================================================
     * AUTHORITATIVE GAME MODE
     * ============================================================
     *
     * This is the security boundary.
     *
     * We NEVER accept game_mode from the browser.
     */

    const gameMode =
      gameScore.game_mode;

    if (
      gameMode !== "ipl" &&
      gameMode !== "world"
    ) {
      console.error(
        "Create challenge received unsupported game mode:",
        gameMode
      );

      return NextResponse.json(
        {
          error:
            "The completed game has an unsupported game mode.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ============================================================
     * VERIFY AUTHORITATIVE SCORE
     * ============================================================
     */

    const score =
      Number(gameScore.score);

    if (!Number.isFinite(score)) {
      return NextResponse.json(
        {
          error:
            "The completed game contains an invalid score.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ============================================================
     * CREATE CHALLENGE
     * ============================================================
     *
     * gameMode comes from game_scores.
     *
     * Therefore:
     *
     * IPL score  -> IPL challenge
     * World score -> World challenge
     *
     * The browser cannot override this.
     */

    const supabase =
      await createClient();

    const {
      data: challengeData,
      error: challengeError,
    } = await supabase.rpc(
      "create_challenge",
      {
        p_title:
          requestedTitle,

        p_game_mode:
          gameMode,
      }
    );

    if (challengeError) {
      console.error(
        "Create challenge RPC error:",
        challengeError
      );

      return NextResponse.json(
        {
          error:
            "Unable to create the challenge.",
        },
        {
          status: 500,
        }
      );
    }

    const challenge =
      (
        Array.isArray(
          challengeData
        )
          ? challengeData[0]
          : challengeData
      ) as Challenge | null;

    if (
      !challenge?.id ||
      !challenge.invite_code
    ) {
      console.error(
        "Create challenge RPC returned invalid data:",
        challengeData
      );

      return NextResponse.json(
        {
          error:
            "The challenge was created but no valid invite code was returned.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ============================================================
     * VERIFY CHALLENGE MODE
     * ============================================================
     *
     * This is an additional server-side consistency check.
     */

    if (
      challenge.game_mode !==
      gameMode
    ) {
      console.error(
        "Challenge mode mismatch:",
        {
          expected: gameMode,
          returned:
            challenge.game_mode,
        }
      );

      /*
       * Cleanup the incorrectly-created challenge.
       */

      await supabaseAdmin
        .from("challenge_players")
        .delete()
        .eq(
          "challenge_id",
          challenge.id
        );

      await supabaseAdmin
        .from("challenges")
        .delete()
        .eq(
          "id",
          challenge.id
        );

      return NextResponse.json(
        {
          error:
            "The challenge game mode could not be verified.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ============================================================
     * ADD CREATOR TO CHALLENGE
     * ============================================================
     */

    const {
      data: existingPlayer,
      error: playerLookupError,
    } = await supabaseAdmin
      .from("challenge_players")
      .select(
        "challenge_id"
      )
      .eq(
        "challenge_id",
        challenge.id
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (playerLookupError) {
      console.error(
        "Challenge creator lookup error:",
        playerLookupError
      );

      /*
       * Cleanup the challenge because creation
       * was not completed.
       */

      await supabaseAdmin
        .from("challenge_players")
        .delete()
        .eq(
          "challenge_id",
          challenge.id
        );

      await supabaseAdmin
        .from("challenges")
        .delete()
        .eq(
          "id",
          challenge.id
        );

      return NextResponse.json(
        {
          error:
            "Unable to initialize the challenge players.",
        },
        {
          status: 500,
        }
      );
    }

    if (!existingPlayer) {
      const {
        error: playerInsertError,
      } = await supabaseAdmin
        .from("challenge_players")
        .insert({
          challenge_id:
            challenge.id,

          user_id:
            user.id,
        });

      if (playerInsertError) {
        console.error(
          "Challenge creator insert error:",
          playerInsertError
        );

        /*
         * Cleanup both related records.
         */

        await supabaseAdmin
          .from("challenge_players")
          .delete()
          .eq(
            "challenge_id",
            challenge.id
          );

        await supabaseAdmin
          .from("challenges")
          .delete()
          .eq(
            "id",
            challenge.id
          );

        return NextResponse.json(
          {
            error:
              "Unable to add you to the new challenge.",
          },
          {
            status: 500,
          }
        );
      }
    }

    /*
     * ============================================================
     * ATTACH AUTHORITATIVE SCORE
     * ============================================================
     *
     * game_scores.score
     *        ↓
     * challenge_scores.score
     *
     * The browser never provides the score.
     */

    const {
      data: existingScore,
      error: scoreLookupError,
    } = await supabaseAdmin
      .from("challenge_scores")
      .select(
        "challenge_id, user_id, score"
      )
      .eq(
        "challenge_id",
        challenge.id
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (scoreLookupError) {
      console.error(
        "Challenge score lookup error:",
        scoreLookupError
      );

      /*
       * Cleanup the partially-created challenge.
       */

      await supabaseAdmin
        .from("challenge_players")
        .delete()
        .eq(
          "challenge_id",
          challenge.id
        );

      await supabaseAdmin
        .from("challenges")
        .delete()
        .eq(
          "id",
          challenge.id
        );

      return NextResponse.json(
        {
          error:
            "Unable to initialize the challenge score.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Normally a brand-new challenge will not
     * have a score yet.
     */

    if (!existingScore) {
      const {
        data: insertedScore,
        error: scoreInsertError,
      } = await supabaseAdmin
        .from("challenge_scores")
        .insert({
          challenge_id:
            challenge.id,

          user_id:
            user.id,

          score,
        })
        .select(
          "challenge_id, user_id, score"
        )
        .single();

      if (scoreInsertError) {
        console.error(
          "Challenge score insert error:",
          scoreInsertError
        );

        /*
         * Cleanup the partially-created challenge.
         */

        await supabaseAdmin
          .from("challenge_players")
          .delete()
          .eq(
            "challenge_id",
            challenge.id
          );

        await supabaseAdmin
          .from("challenges")
          .delete()
          .eq(
            "id",
            challenge.id
          );

        return NextResponse.json(
          {
            error:
              "Unable to attach your completed game score to the challenge.",
          },
          {
            status: 500,
          }
        );
      }

      /*
       * ==========================================================
       * VERIFY INSERTED SCORE
       * ==========================================================
       */

      if (
        !insertedScore ||
        insertedScore.challenge_id !==
          challenge.id ||
        insertedScore.user_id !==
          user.id ||
        Number(
          insertedScore.score
        ) !== score
      ) {
        console.error(
          "Challenge score insert verification failed:",
          insertedScore
        );

        /*
         * Cleanup the partially-created challenge.
         */

        await supabaseAdmin
          .from("challenge_scores")
          .delete()
          .eq(
            "challenge_id",
            challenge.id
          )
          .eq(
            "user_id",
            user.id
          );

        await supabaseAdmin
          .from("challenge_players")
          .delete()
          .eq(
            "challenge_id",
            challenge.id
          );

        await supabaseAdmin
          .from("challenges")
          .delete()
          .eq(
            "id",
            challenge.id
          );

        return NextResponse.json(
          {
            error:
              "The challenge was created, but your score could not be verified. Please try again.",
          },
          {
            status: 500,
          }
        );
      }
    }

    /*
     * ============================================================
     * SUCCESS
     * ============================================================
     */

    return NextResponse.json({
      success: true,

      challengeId:
        challenge.id,

      inviteCode:
        challenge.invite_code,

      score,

      gameMode:
        gameMode,

      title:
        challenge.title,
    });
  } catch (error) {
    console.error(
      "Create challenge from game error:",
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