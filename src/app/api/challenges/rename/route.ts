import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RequestBody = {
  challengeId?: string;
  title?: string;
};

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

    if (
      user.is_anonymous
    ) {
      return NextResponse.json(
        {
          error:
            "Registered authentication is required to rename a challenge.",
        },
        {
          status: 403,
        }
      );
    }

    const body =
      (await request
        .json()
        .catch(
          () => ({})
        )) as RequestBody;

    const challengeId =
      typeof body.challengeId ===
      "string"
        ? body.challengeId.trim()
        : "";

    const title =
      typeof body.title ===
      "string"
        ? body.title.trim()
        : "";

    if (!challengeId) {
      return NextResponse.json(
        {
          error:
            "challengeId is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!title) {
      return NextResponse.json(
        {
          error:
            "Challenge title cannot be empty.",
        },
        {
          status: 400,
        }
      );
    }

    if (title.length > 60) {
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
     * Authorization is checked on the server.
     *
     * The caller must be the creator of the challenge.
     */

    const {
      data: challenge,
      error: challengeError,
    } = await supabaseAdmin
      .from("challenges")
      .select(
        "id, creator_id"
      )
      .eq(
        "id",
        challengeId
      )
      .maybeSingle();

    if (challengeError) {
      console.error(
        "Rename challenge lookup error:",
        challengeError
      );

      return NextResponse.json(
        {
          error:
            "Unable to verify the challenge.",
        },
        {
          status: 500,
        }
      );
    }

    if (!challenge) {
      return NextResponse.json(
        {
          error:
            "Challenge not found.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      challenge.creator_id !==
      user.id
    ) {
      return NextResponse.json(
        {
          error:
            "Only the challenge creator can rename this challenge.",
        },
        {
          status: 403,
        }
      );
    }

    const {
      data: updatedChallenge,
      error: updateError,
    } = await supabaseAdmin
      .from("challenges")
      .update({
        title,
      })
      .eq(
        "id",
        challengeId
      )
      .eq(
        "creator_id",
        user.id
      )
      .select(
        "id, creator_id, title, game_mode, invite_code, status, created_at, updated_at"
      )
      .single();

    if (updateError) {
      console.error(
        "Rename challenge update error:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Unable to rename the challenge.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      challenge:
        updatedChallenge,
    });
  } catch (error) {
    console.error(
      "Rename challenge error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while renaming the challenge.",
      },
      {
        status: 500,
      }
    );
  }
}