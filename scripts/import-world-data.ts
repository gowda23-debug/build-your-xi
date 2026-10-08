import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  WORLD_AVAILABLE_EDITION_YEARS,
} from "./data/world/editions";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
  );
}

const db = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const DIR = path.join(
  process.cwd(),
  "scripts",
  "data",
  "world",
  "processed"
);

type Season = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50 | 60;
  teams: WorldTeam[];
  sources: string[];
};

type WorldTeam = {
  name: string;
  shortName: string;
  slug: string;
  players: WorldPlayer[];
  sources: string[];
};

type WorldPlayer = {
  fullName: string;
  sourcePlayerId: string;
  role: "BAT" | "WK" | "AR" | "BOWL";
  stats: {
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
  };
  roleSource: {
    provider: string;
    url: string;
    retrievedAt: string;
  };
  sources: string[];
};

function fail(message: string): never {
  throw new Error(`[WORLD IMPORT] ${message}`);
}

function read(year: number): Season {
  const filePath = path.join(DIR, `${year}.json`);

  if (!fs.existsSync(filePath)) {
    fail(`Missing processed file: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");

  if (!raw.trim()) {
    fail(`Processed file is empty: ${filePath}`);
  }

  try {
    return JSON.parse(raw) as Season;
  } catch (error) {
    fail(
      `Invalid JSON in ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function getSeason(year: number): Promise<string> {
  const existing = await db
    .from("seasons")
    .select("id")
    .eq("year", year)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    return existing.data.id;
  }

  const inserted = await db
    .from("seasons")
    .insert({ year })
    .select("id")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  if (!inserted.data) {
    fail(`Season ${year} was inserted but no ID was returned.`);
  }

  return inserted.data.id;
}

async function getTeam(team: WorldTeam): Promise<string> {
  const existing = await db
    .from("teams")
    .select("id,name,short_name,slug")
    .eq("slug", team.slug)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    if (
      existing.data.name !== team.name ||
      existing.data.short_name !== team.shortName
    ) {
      const updated = await db
        .from("teams")
        .update({
          name: team.name,
          short_name: team.shortName,
        })
        .eq("id", existing.data.id);

      if (updated.error) {
        throw updated.error;
      }
    }

    return existing.data.id;
  }

  const inserted = await db
    .from("teams")
    .insert({
      name: team.name,
      short_name: team.shortName,
      slug: team.slug,
    })
    .select("id")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  if (!inserted.data) {
    fail(`Team ${team.name} was inserted but no ID was returned.`);
  }

  return inserted.data.id;
}

async function getTeamSeason(
  teamId: string,
  seasonId: string
): Promise<string> {
  const existing = await db
    .from("team_seasons")
    .select("id")
    .eq("team_id", teamId)
    .eq("season_id", seasonId)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    return existing.data.id;
  }

  const inserted = await db
    .from("team_seasons")
    .insert({
      team_id: teamId,
      season_id: seasonId,
    })
    .select("id")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  if (!inserted.data) {
    fail(
      `Team season was inserted but no ID was returned. team=${teamId}, season=${seasonId}`
    );
  }

  return inserted.data.id;
}

async function getPlayer(
  player: WorldPlayer
): Promise<string> {
  const existing = await db
    .from("players")
    .select("id,full_name,source_player_id")
    .eq("source_player_id", player.sourcePlayerId)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    if (existing.data.full_name !== player.fullName) {
      fail(
        `Identity collision for ${player.sourcePlayerId}: ` +
          `"${existing.data.full_name}" vs "${player.fullName}".`
      );
    }

    return existing.data.id;
  }

  const inserted = await db
    .from("players")
    .insert({
      full_name: player.fullName,
      source_player_id: player.sourcePlayerId,
    })
    .select("id")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  if (!inserted.data) {
    fail(
      `Player ${player.fullName} was inserted but no ID was returned.`
    );
  }

  return inserted.data.id;
}

async function importPlayer(
  player: WorldPlayer,
  teamSeasonId: string
): Promise<void> {
  const playerId = await getPlayer(player);

  const role = await db
    .from("player_roles")
    .upsert(
      {
        player_id: playerId,
        role: player.role,
      },
      {
        onConflict: "player_id,role",
      }
    );

  if (role.error) {
    throw role.error;
  }

  const stats = await db
    .from("player_season_stats")
    .upsert(
      {
        player_id: playerId,
        team_season_id: teamSeasonId,

        matches: player.stats.matches,
        innings: player.stats.innings,
        runs: player.stats.runs,

        batting_average: player.stats.batting_average,
        strike_rate: player.stats.strike_rate,

        hundreds: player.stats.hundreds,
        fifties: player.stats.fifties,

        wickets: player.stats.wickets,
        bowling_average: player.stats.bowling_average,
        economy: player.stats.economy,

        catches: player.stats.catches,
        stumpings: player.stats.stumpings,
      },
      {
        onConflict: "player_id,team_season_id",
      }
    );

  if (stats.error) {
    throw stats.error;
  }

  /*
   * The canonical players.source_player_id is:
   *
   *   cricsheet:<Cricsheet Register ID>
   *
   * Provider-specific identities belong in
   * world_player_sources.
   */
  const sourceId = player.sourcePlayerId.replace(
    /^cricsheet:/,
    ""
  );

  const source = await db
    .from("world_player_sources")
    .upsert(
      {
        player_id: playerId,
        provider: "Cricsheet",
        source_player_id: sourceId,
        source_url: "https://cricsheet.org/",
        retrieved_at: new Date().toISOString(),
      },
      {
        onConflict: "provider,source_player_id",
      }
    );

  if (source.error) {
    throw source.error;
  }
}

async function main(): Promise<void> {
  console.log("[WORLD IMPORT] Starting.");

  for (const year of WORLD_AVAILABLE_EDITION_YEARS) {
    const season = read(year);

    const seasonId = await getSeason(year);

    for (const team of season.teams) {
      const teamId = await getTeam(team);

      const teamSeasonId = await getTeamSeason(
        teamId,
        seasonId
      );

      for (const player of team.players) {
        await importPlayer(
          player,
          teamSeasonId
        );
      }
    }

    console.log(
      `[WORLD IMPORT] ${year} imported.`
    );
  }

  console.log(
    "[WORLD IMPORT] Successful."
  );
}

main().catch((error) => {
  console.error(
    "[WORLD IMPORT] Failed:",
    error
  );

  process.exit(1);
});