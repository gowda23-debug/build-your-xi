import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RequestBody = {
  gameScoreId?: string;
};

type Challenge = {
  id: string;
  creator_id: string;
  title: string;
  game_mode: "ipl" | "world";
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

    const { user, error: authError } = await requireUser();

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

    const body = (await request.json().catch(() => ({}))) as RequestBody;

    const gameScoreId =
      typeof body.gameScoreId === "string"
        ? body.gameScoreId.trim()
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
     * ============================================================
     * VERIFY THE AUTHORITATIVE GAME SCORE
     * ============================================================
     *
     * IMPORTANT:
     *
     * The browser does NOT send:
     *
     * - score
     * - wins
     * - losses
     *
     * We load the already-completed game score from the server.
     */

    const { data: gameScore, error: gameScoreError } =
      await supabaseAdmin
        .from("game_scores")
        .select("id, user_id, score")
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
          error: "Unable to verify the completed game.",
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

    const score = Number(gameScore.score);

    if (!Number.isFinite(score)) {
      return NextResponse.json(
        {
          error: "The completed game contains an invalid score.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ============================================================
     * CREATE THE CHALLENGE
     * ============================================================
     *
     * We deliberately use the existing create_challenge RPC
     * rather than recreating challenge creation logic here.
     *
     * The server Supabase client carries the authenticated
     * user's session, so auth.uid() remains available to the
     * database function.
     */

    const supabase = await createClient();

    const { data: challengeData, error: challengeError } =
      await supabase.rpc("create_challenge", {
        p_title: "My IPL Challenge",
        p_game_mode: "ipl",
      });

    if (challengeError) {
      console.error(
        "Create challenge RPC error:",
        challengeError
      );

      return NextResponse.json(
        {
          error: "Unable to create the challenge.",
        },
        {
          status: 500,
        }
      );
    }

    const challenge = (
      Array.isArray(challengeData)
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
     * ADD CREATOR TO THE CHALLENGE
     * ============================================================
     */

    const { data: existingPlayer, error: playerLookupError } =
      await supabaseAdmin
        .from("challenge_players")
        .select("challenge_id")
        .eq("challenge_id", challenge.id)
        .eq("user_id", user.id)
        .maybeSingle();

    if (playerLookupError) {
      console.error(
        "Challenge creator lookup error:",
        playerLookupError
      );

      await supabaseAdmin
        .from("challenges")
        .delete()
        .eq("id", challenge.id);

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
      const { error: playerInsertError } =
        await supabaseAdmin
          .from("challenge_players")
          .insert({
            challenge_id: challenge.id,
            user_id: user.id,
          });

      if (playerInsertError) {
        console.error(
          "Challenge creator insert error:",
          playerInsertError
        );

        await supabaseAdmin
          .from("challenges")
          .delete()
          .eq("id", challenge.id);

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
     * ADD THE AUTHORITATIVE GAME SCORE
     * ============================================================
     *
     * This is the critical connection:
     *
     * completed game
     *       ↓
     * game_scores
     *       ↓
     * challenge_scores
     *
     * The score is taken from game_scores.
     * It is NOT accepted from the browser.
     */

    const { data: existingScore, error: scoreLookupError } =
      await supabaseAdmin
        .from("challenge_scores")
        .select("challenge_id")
        .eq("challenge_id", challenge.id)
        .eq("user_id", user.id)
        .maybeSingle();

    if (scoreLookupError) {
      console.error(
        "Challenge score lookup error:",
        scoreLookupError
      );

      await supabaseAdmin
        .from("challenges")
        .delete()
        .eq("id", challenge.id);

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

    if (!existingScore) {
      const { error: scoreInsertError } =
        await supabaseAdmin
          .from("challenge_scores")
          .insert({
            challenge_id: challenge.id,
            user_id: user.id,
            score,
          });

      if (scoreInsertError) {
        console.error(
          "Challenge score insert error:",
          scoreInsertError
        );

        await supabaseAdmin
          .from("challenges")
          .delete()
          .eq("id", challenge.id);

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
    }

    /*
     * ============================================================
     * SUCCESS
     * ============================================================
     */

    return NextResponse.json({
      success: true,

      challengeId: challenge.id,

      inviteCode: challenge.invite_code,

      score,
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