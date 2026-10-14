import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorldPlayer } from "@/types/world";
import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const worldDb = supabaseAdmin as unknown as SupabaseClient;
const VALID_ROLES = new Set(["BAT", "WK", "AR", "BOWL"]);

type TeamSeasonRow = {
  id: string;
  world_edition_id: string | null;
  team: { id: string; name: string; short_name: string; slug: string } | Array<{ id: string; name: string; short_name: string; slug: string }> | null;
  season: { id: string; year: number } | Array<{ id: string; year: number }> | null;
};

type StatsRow = {
  player_id: string;
  matches: number;
  innings: number;
  runs: number;
  batting_average: number | null;
  strike_rate: number | null;
  hundreds: number;
  fifties: number;
  wickets: number;
  bowling_average: number | null;
  economy: number | null;
  catches: number;
  stumpings: number;
  player: { id: string; full_name: string } | Array<{ id: string; full_name: string }> | null;
};

type EditionRow = { id: string; year: number; season_name: string; overs_per_innings: 50 | 60; status: string };
type RoleRow = { player_id: string; role: string };

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { error: authError } = await requireUser();
    if (authError) return authError;

    const { id } = await context.params;
    if (!id || id.length > 100) {
      return NextResponse.json({ error: "A valid World team-season ID is required." }, { status: 400 });
    }

    const { data: teamSeasonRows, error: teamSeasonError } = await worldDb
      .from("team_seasons")
      .select("id,world_edition_id,team:teams(id,name,short_name,slug),season:seasons(id,year)")
      .eq("id", id)
      .returns<TeamSeasonRow[]>();

    if (teamSeasonError) throw teamSeasonError;
    const teamSeason = teamSeasonRows?.[0] ?? null;
    if (!teamSeason || !teamSeason.world_edition_id) {
      return NextResponse.json({ error: "World team-season not found." }, { status: 404 });
    }

    const { data: editionRows, error: editionError } = await worldDb
      .from("world_editions")
      .select("id,year,season_name,overs_per_innings,status")
      .eq("id", teamSeason.world_edition_id)
      .eq("status", "published")
      .returns<EditionRow[]>();

    if (editionError) throw editionError;
    const edition = editionRows?.[0] ?? null;
    if (!edition) {
      return NextResponse.json({ error: "This World Cup edition is not published." }, { status: 409 });
    }

    const team = Array.isArray(teamSeason.team) ? teamSeason.team[0] : teamSeason.team;
    const season = Array.isArray(teamSeason.season) ? teamSeason.season[0] : teamSeason.season;
    if (!team || !season || season.year !== edition.year) {
      throw new Error("World team-season metadata does not match its published edition.");
    }

    const { data: stats, error: statsError } = await worldDb
      .from("player_season_stats")
      .select("player_id,matches,innings,runs,batting_average,strike_rate,hundreds,fifties,wickets,bowling_average,economy,catches,stumpings,player:players(id,full_name)")
      .eq("team_season_id", id)
      .order("runs", { ascending: false })
      .returns<StatsRow[]>();

    if (statsError) throw statsError;
    const rows = stats ?? [];
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: "No validated players are available for this World Cup team.",
          code: "WORLD_PLAYER_POOL_NOT_READY",
        },
        { status: 404 }
      );
    }

    const playerIds = rows.map((row) => row.player_id);
    const { data: roles, error: rolesError } = await worldDb
      .from("world_edition_player_roles")
      .select("player_id,role")
      .eq("world_edition_id", edition.id)
      .in("player_id", playerIds)
      .returns<RoleRow[]>();

    if (rolesError) throw rolesError;
    const roleMap = new Map<string, string>();
    for (const row of roles ?? []) {
      if (VALID_ROLES.has(row.role)) roleMap.set(row.player_id, row.role);
    }

    const players = rows.flatMap((row): WorldPlayer[] => {
      const role = roleMap.get(row.player_id);

      // An unresolved role excludes this player from the game pool.
      if (
        role !== "BAT" &&
        role !== "WK" &&
        role !== "AR" &&
        role !== "BOWL"
      ) {
        return [];
      }

      const player = Array.isArray(row.player)
        ? row.player[0]
        : row.player;

      if (!player) {
        throw new Error(
          `Player relationship missing for player_id=${row.player_id}.`
        );
      }

      return [{
        id: player.id,
        name: player.full_name,
        role,
        stats: {
          matches: row.matches,
          innings: row.innings,
          runs: row.runs,
          battingAverage: row.batting_average,
          strikeRate: row.strike_rate,
          hundreds: row.hundreds,
          fifties: row.fifties,
          wickets: row.wickets,
          bowlingAverage: row.bowling_average,
          economy: row.economy,
          catches: row.catches,
          stumpings: row.stumpings,
        },
      }];
    });

    const roleCounts = {
      WK: players.filter((p) => p.role === "WK").length,
      BAT: players.filter((p) => p.role === "BAT").length,
      AR: players.filter((p) => p.role === "AR").length,
      BOWL: players.filter((p) => p.role === "BOWL").length,
    };

    const poolCanFormXI =
      players.length >= 11 &&
      roleCounts.WK >= 1 &&
      roleCounts.BAT >= 4 &&
      roleCounts.AR >= 1 &&
      roleCounts.BOWL >= 3 &&
      roleCounts.AR + roleCounts.BOWL >= 5;

    if (!poolCanFormXI) {
      return NextResponse.json(
        {
          error:
            "This World Cup team does not yet have enough verified players to form a valid XI.",
          code: "WORLD_PLAYER_POOL_NOT_READY",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ players });
  } catch (error) {
    console.error("World player pool endpoint failed:", error);
    return NextResponse.json({ error: "Unable to load World Cup players." }, { status: 500 });
  }
}
