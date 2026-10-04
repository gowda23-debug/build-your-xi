import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

type DraftSelection = {
  playerId: string;
  teamSeasonId: string;
};

type SessionContext = {
  draftSelections?: DraftSelection[];
  currentRound?: number;
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

    if (
      user.is_anonymous
    ) {
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
        .catch(
          () => ({})
        )) as {
        gameSessionId?: string;
        playerId?: string;
      };

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
            "This World game is no longer active.",
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
            "The World game has no active team-season.",
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
     * Player must belong to the
     * authoritative team-season.
     */
    const {
      data: playerStat,
      error:
        playerError,
    } =
      await supabaseAdmin
        .from(
          "player_season_stats"
        )
        .select(
          "player_id"
        )
        .eq(
          "team_season_id",
          session.world_team_season_id
        )
        .eq(
          "player_id",
          playerId
        )
        .maybeSingle();

    if (
      playerError
    ) {
      throw playerError;
    }

    if (
      !playerStat
    ) {
      return NextResponse.json(
        {
          error:
            "The selected player is not available for this World draft.",
        },
        {
          status: 400,
        }
      );
    }

    const nextSelections =
      [
        ...selections,
        {
          playerId,
          teamSeasonId:
            session.world_team_season_id,
        },
      ];

    const nextContext =
      {
        ...context,

        draftSelections:
          nextSelections,

        currentRound:
          nextSelections.length +
          1,
      };

    const {
      data: updated,
      error:
        updateError,
    } =
      await supabaseAdmin
        .from(
          "game_sessions"
        )
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
        )
        .select(
          "id"
        )
        .maybeSingle();

    if (
      updateError
    ) {
      throw updateError;
    }

    if (!updated) {
      return NextResponse.json(
        {
          error:
            "The World game changed while the player was being selected.",
        },
        {
          status: 409,
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
      "World player selection error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to save the World player selection.",
      },
      {
        status: 500,
      }
    );
  }
}