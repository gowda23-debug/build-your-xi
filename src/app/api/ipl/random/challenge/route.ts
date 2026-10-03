import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRandomVenueForTeamSeason } from "@/lib/ipl-challenge/server-venue";

export const dynamic = "force-dynamic";

type DraftSelection = {
  playerId: string;
  teamSeasonId: string;
};

type SessionContext = {
  version?: number;

  /*
   * If this game was started from a challenge,
   * the challenge ID is stored here.
   *
   * This becomes part of the authoritative
   * game session and is NOT trusted later
   * from the browser.
   */
  challengeId?: string;

  venueId?: string;

  venueSnapshot?: {
    id?: string;
    name?: string;
    city?: string | null;
    country?: string;
    pitch?: unknown;
  };

  teamRespinUsed?: boolean;
  seasonRespinUsed?: boolean;

  initialTeamSeasonId?: string;
  initialTeamId?: string;
  initialSeasonId?: string;

  draftSelections?: DraftSelection[];

  currentRound?: number;

  [key: string]: unknown;
};

export async function GET(
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
     * ============================================================
     * REQUEST PARAMETERS
     * ============================================================
     */

    const url =
      new URL(request.url);

    const requestedGameSessionId =
      url.searchParams.get(
        "gameSessionId"
      )?.trim() ?? "";

    const requestedChallengeId =
      url.searchParams.get(
        "challengeId"
      )?.trim() ?? "";

    /*
     * ============================================================
     * CHALLENGE VALIDATION
     * ============================================================
     *
     * If the player entered the game through a challenge,
     * validate that challenge before creating the game session.
     *
     * IMPORTANT:
     *
     * We never trust the challengeId merely because it came
     * from the browser.
     */

    if (
      requestedChallengeId &&
      !user.is_anonymous
    ) {
      const {
        data: challenge,
        error: challengeError,
      } = await supabaseAdmin
        .from("challenges")
        .select(
          "id, game_mode, status"
        )
        .eq(
          "id",
          requestedChallengeId
        )
        .eq(
          "game_mode",
          "ipl"
        )

        .maybeSingle();

      if (challengeError) {
        console.error(
          "Challenge validation error:",
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
      if (challenge.status !== "active") {
        return NextResponse.json(
          {
            error:
              "This challenge is no longer active.",
            code:
              "CHALLENGE_NOT_ACTIVE",
          },
          {
            status: 409,
          }
        );
      }

      /*
       * The player must be a member of the challenge.
       */
      const {
        data: membership,
        error: membershipError,
      } = await supabaseAdmin
        .from("challenge_players")
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

      if (membershipError) {
        console.error(
          "Challenge membership validation error:",
          membershipError
        );

        return NextResponse.json(
          {
            error:
              "Unable to verify challenge membership.",
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
              "You must join this challenge before playing it.",
          },
          {
            status: 403,
          }
        );
      }
    }

    /*
     * ============================================================
     * RETRIEVE VALID TEAM-SEASON COMBINATIONS
     * ============================================================
     */

    const {
      data: teamSeasons,
      error,
    } = await supabaseAdmin
      .from("ipl_team_seasons")
      .select(`
        id,
        team:ipl_teams (
          id,
          name
        ),
        season:ipl_seasons (
          id,
          season,
          start_year
        )
      `);

    if (error) {
      console.error(
        "Random challenge query error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Unable to load IPL challenges.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !teamSeasons ||
      teamSeasons.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No valid IPL challenges are available.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * ============================================================
     * REGISTERED USER - EXISTING SESSION
     * ============================================================
     *
     * First spin:
     *
     *   no gameSessionId
     *   -> create ONE new game session
     *
     * Subsequent spins:
     *
     *   gameSessionId present
     *   -> reuse the SAME game session
     *
     * This is important because all 11 player selections
     * must belong to the same game session.
     */

    if (
      !user.is_anonymous &&
      requestedGameSessionId
    ) {
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
  challenge_id,
  context
  `
        )
        .eq(
          "id",
          requestedGameSessionId
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
          "Existing game session query error:",
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

      /*
       * Read the existing authoritative context.
       */
      const context =
        (session.context ??
          {}) as SessionContext;

      /*
       * If the session belongs to a challenge,
       * the challenge identity is already stored
       * inside the session.
       *
       * We do NOT allow the browser to change it.
       */
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

      /*
       * The XI can contain at most 11 selections.
       */
      const draftSelections =
        Array.isArray(
          context.draftSelections
        )
          ? context.draftSelections
          : [];

      if (
        draftSelections.length >=
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
       * ==========================================================
       * SELECT NEXT RANDOM TEAM-SEASON
       * ==========================================================
       *
       * The venue does NOT change.
       */

      const selected =
        teamSeasons[
        Math.floor(
          Math.random() *
          teamSeasons.length
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
              "Invalid challenge relationship.",
          },
          {
            status: 500,
          }
        );
      }

      /*
       * ==========================================================
       * KEEP THE ORIGINAL LOCKED VENUE
       * ==========================================================
       */

      const venue =
        context.venueSnapshot;

      if (
        !venue?.id
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
       * ==========================================================
       * PRESERVE EXISTING SESSION CONTEXT
       * ==========================================================
       *
       * IMPORTANT:
       *
       * We do NOT reset:
       *
       * - challengeId
       * - draftSelections
       * - teamRespinUsed
       * - seasonRespinUsed
       * - venueSnapshot
       *
       * We only update the current round.
       */

      const nextContext:
        SessionContext = {
        ...context,

        currentRound:
          draftSelections.length +
          1,
      };

      const {
        data: updatedSession,
        error: updateError,
      } = await supabaseAdmin
        .from("game_sessions")
        .update({
          team_season_id:
            selected.id,

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
        .select("id")
        .maybeSingle();

      if (updateError) {
        console.error(
          "Existing game session update error:",
          updateError
        );

        return NextResponse.json(
          {
            error:
              "Unable to update the IPL game session.",
          },
          {
            status: 500,
          }
        );
      }

      if (!updatedSession) {
        return NextResponse.json(
          {
            error:
              "The game session could not be updated.",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json({
        teamSeasonId:
          selected.id,

        team: {
          id:
            team.id,

          name:
            team.name,
        },

        season: {
          id:
            season.id,

          season:
            season.season,

          startYear:
            season.start_year,
        },

        venue,

        /*
         * SAME session ID.
         */
        gameSessionId:
          session.id,
      });
    }

    /*
     * ============================================================
     * NEW GAME
     * ============================================================
     *
     * This block runs for the FIRST spin of a registered game,
     * or for guests.
     */

    const selected =
      teamSeasons[
      Math.floor(
        Math.random() *
        teamSeasons.length
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
            "Invalid challenge relationship.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ============================================================
     * RESOLVE AND LOCK VENUE
     * ============================================================
     */

    const venue =
      await getRandomVenueForTeamSeason(
        selected.id
      );

    if (!venue) {
      return NextResponse.json(
        {
          error:
            "No venue mapping is available for this team and season.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * Guests do not receive a persistent game session.
     */
    let gameSessionId:
      string | null = null;

    if (!user.is_anonymous) {
      /*
       * ==========================================================
       * AUTHORITATIVE GAME SESSION CONTEXT
       * ==========================================================
       *
       * This is where the challenge ID is stored.
       *
       * It will travel with the game session through all
       * subsequent spins and finally be read by the completion API.
       */

      const sessionContext:
        SessionContext = {
        version: 1,

        /*
         * Store challenge identity ONLY when this game
         * was started from a challenge.
         */
        ...(requestedChallengeId
          ? {
            challengeId:
              requestedChallengeId,
          }
          : {}),

        venueId:
          venue.id,

        venueSnapshot:
          venue,

        teamRespinUsed:
          false,

        seasonRespinUsed:
          false,

        initialTeamSeasonId:
          selected.id,

        initialTeamId:
          team.id,

        initialSeasonId:
          season.id,

        /*
         * ONE game session starts with
         * an empty draft.
         */
        draftSelections: [],

        currentRound: 1,
      };

      const {
        data: session,
        error: sessionError,
      } = await supabaseAdmin
        .from("game_sessions")
        .insert({
          user_id:
            user.id,

          game_mode:
            "ipl",

          status:
            "started",

          team_season_id:
            selected.id,

          challenge_id:
            requestedChallengeId || null,

          context:
            sessionContext,
        })
        .select("id")
        .single();

      if (sessionError) {
        console.error(
          "Game session creation error:",
          sessionError
        );

        return NextResponse.json(
          {
            error:
              "Unable to start the IPL game session.",
          },
          {
            status: 500,
          }
        );
      }

      gameSessionId =
        session.id;
    }

    return NextResponse.json({
      teamSeasonId:
        selected.id,

      team: {
        id:
          team.id,

        name:
          team.name,
      },

      season: {
        id:
          season.id,

        season:
          season.season,

        startYear:
          season.start_year,
      },

      venue,

      gameSessionId,
    });
  } catch (error) {
    console.error(
      "Random challenge endpoint error:",
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