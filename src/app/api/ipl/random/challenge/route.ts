import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRandomVenueForTeamSeason } from "@/lib/ipl-challenge/server-venue";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    /*
     * Authentication
     */
    const {
      user,
      error: authError,
    } = await requireUser();

    if (authError) {
      return authError;
    }

    /*
     * Retrieve valid team-season combinations.
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
     * Select a random team-season.
     */
    const selected =
      teamSeasons[
        Math.floor(
          Math.random() *
            teamSeasons.length
        )
      ];

    const team =
      Array.isArray(selected.team)
        ? selected.team[0]
        : selected.team;

    const season =
      Array.isArray(selected.season)
        ? selected.season[0]
        : selected.season;

    if (!team || !season) {
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
     * Resolve the venue from the database.
     *
     * This is the venue that becomes
     * locked for the entire game.
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
     * Guest users can play without creating
     * persistent game-session rows.
     *
     * Registered users get an authoritative
     * server-side game session.
     */
    let gameSessionId:
      string | null = null;

    if (!user.is_anonymous) {
      const sessionContext = {
        version: 1,

        /*
         * This venue is locked for the
         * entire game.
         */
        venueId: venue.id,

        venueSnapshot: venue,

        /*
         * Server-side respin state.
         *
         * These values will be updated
         * by the team/season respin APIs.
         */
        teamRespinUsed: false,
        seasonRespinUsed: false,

        /*
         * Keep the original challenge
         * information for auditability.
         */
        initialTeamSeasonId:
          selected.id,

        initialTeamId:
          team.id,

        initialSeasonId:
          season.id,
      };

      const {
        data: session,
        error: sessionError,
      } = await supabaseAdmin
        .from("game_sessions")
        .insert({
          user_id: user.id,

          game_mode: "ipl",

          status: "started",

          team_season_id:
            selected.id,

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

      /*
       * null for guests.
       *
       * A registered user's session ID
       * is used only by our server APIs.
       */
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