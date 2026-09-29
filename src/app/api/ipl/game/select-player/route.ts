import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic =
  "force-dynamic";

type DraftSelection = {
  playerId: string;
  teamSeasonId: string;
};

type SessionContext = {
  draftSelections?: DraftSelection[];
  currentRound?: number;
  [key: string]: unknown;
};

type RequestBody = {
  gameSessionId?: string;
  playerId?: string;
};

export async function POST(
  request: Request
) {
  try {
    const {
      user,
      error: authError,
    } = await requireUser();

    if (authError || !user) {
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

    if (user.is_anonymous) {
      return NextResponse.json(
        {
          error:
            "Registered authentication is required.",
        },
        {
          status: 403,
        }
      );
    }

    const body =
      (await request
        .json()
        .catch(() => ({}))) as RequestBody;

    const gameSessionId =
      typeof body.gameSessionId ===
        "string"
        ? body.gameSessionId.trim()
        : "";

    const playerId =
      typeof body.playerId ===
        "string"
        ? body.playerId.trim()
        : "";

    if (
      !gameSessionId ||
      !playerId
    ) {
      return NextResponse.json(
        {
          error:
            "gameSessionId and playerId are required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Load the ONE game session.
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
        "Player selection session query error:",
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
            "This game session is no longer active.",
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

    const context =
      (session.context ??
        {}) as SessionContext;

    const selections =
      Array.isArray(
        context.draftSelections
      )
        ? context.draftSelections
        : [];

    /*
     * Exactly ONE player is selected per round.
     */
    if (
      selections.length >=
      11
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

    /*
     * Prevent duplicate player selections.
     */
    if (
      selections.some(
        (selection) =>
          selection.playerId ===
          playerId
      )
    ) {
      return NextResponse.json(
        {
          error:
            "This player has already been selected.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * IMPORTANT:
     *
     * The team-season comes from the
     * SERVER SESSION.
     *
     * It is NOT accepted from the browser.
     */
    const teamSeasonId =
      session.team_season_id;

    /*
     * Verify that this player actually
     * belongs to the current round's
     * team-season.
     */
    const {
      data: player,
      error: playerError,
    } = await supabaseAdmin
      .from(
        "ipl_team_season_player_stats"
      )
      .select(
        "player_id"
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

    if (playerError) {
      console.error(
        "Player selection validation error:",
        playerError
      );

      return NextResponse.json(
        {
          error:
            "Unable to verify the selected player.",
        },
        {
          status: 500,
        }
      );
    }

    if (!player) {
      return NextResponse.json(
        {
          error:
            "The selected player is not available in this draft round.",
        },
        {
          status: 400,
        }
      );
    }

    const nextSelections = [
      ...selections,
      {
        playerId,
        teamSeasonId,
      },
    ];

    const nextContext = {
      ...context,

      draftSelections:
        nextSelections,

      currentRound:
        nextSelections.length +
        1,
    };

    const {
      error: updateError,
    } = await supabaseAdmin
      .from("game_sessions")
      .update({
        context:
          nextContext,
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
      );

    if (updateError) {
      console.error(
        "Player selection session update error:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Unable to save the player selection.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,

      selectedCount:
        nextSelections.length,
    });
  } catch (error) {
    console.error(
      "IPL player selection error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to save the player selection.",
      },
      {
        status: 500,
      }
    );
  }
}