import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  WORLD_AVAILABLE_EDITION_YEARS,
  getWorldEdition,
} from "./data/world/editions";

type WorldRole =
  | "BAT"
  | "WK"
  | "AR"
  | "BOWL";

const VALID_ROLES =
  new Set<WorldRole>([
    "BAT",
    "WK",
    "AR",
    "BOWL",
  ]);

type WorldSeason = {
  year: number;

  seasonName: string;

  format: "ODI";

  competition:
    "ICC Men's Cricket World Cup";

  oversPerInnings:
    50 | 60;

  teams: Array<{
    name: string;
    shortName: string;
    slug: string;

    players: Array<{
      fullName: string;
      sourcePlayerId: string;

      role:
        | "BAT"
        | "WK"
        | "AR"
        | "BOWL";

      stats: {
        matches: number;
        innings: number;
        runs: number;

        batting_average:
          number | null;

        strike_rate:
          number | null;

        hundreds: number;
        fifties: number;

        wickets: number;

        bowling_average:
          number | null;

        economy:
          number | null;

        catches: number;
        stumpings: number;
      };

      sources: Array<{
        provider: string;
        url: string;
      }>;

      roleSource: {
        provider: string;
        url: string;
        retrievedAt: string;
      };
    }>;

    sources: string[];
  }>;

  sources: string[];
};

const supabaseUrl =
  process.env
    .NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env
    .SUPABASE_SERVICE_ROLE_KEY;

if (
  !supabaseUrl ||
  !serviceRoleKey
) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
  );
}

const supabase =
  createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken:
          false,
        persistSession:
          false,
      },
    }
  );

const DIRECTORY =
  path.join(
    process.cwd(),
    "scripts",
    "data",
    "world",
    "processed"
  );

function fail(
  message: string
): never {
  throw new Error(
    `[WORLD IMPORT] ${message}`
  );
}

function readSeason(
  year: number
): WorldSeason {
  const filePath =
    path.join(
      DIRECTORY,
      `${year}.json`
    );

  if (
    !fs.existsSync(
      filePath
    )
  ) {
    fail(
      `Missing processed file ${filePath}`
    );
  }

  const raw =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  if (!raw.trim()) {
    fail(
      `${filePath} is empty.`
    );
  }

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(raw);
  } catch (error) {
    fail(
      `Invalid JSON in ${filePath}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }

  return parsed as WorldSeason;
}

function validateSeason(
  season: WorldSeason,
  year: number
) {
  const edition =
    getWorldEdition(
      year
    );

  if (
    !edition ||
    edition.status !==
      "available"
  ) {
    fail(
      `${year} is not an available edition.`
    );
  }

  if (
    season.year !==
    year
  ) {
    fail(
      `${year}: year mismatch.`
    );
  }

  if (
    season.seasonName !==
    edition.seasonName
  ) {
    fail(
      `${year}: invalid season name.`
    );
  }

  if (
    season.format !==
    "ODI"
  ) {
    fail(
      `${year}: invalid format.`
    );
  }

  if (
    season.competition !==
    edition.competition
  ) {
    fail(
      `${year}: invalid competition.`
    );
  }

  if (
    season.oversPerInnings !==
    edition.oversPerInnings
  ) {
    fail(
      `${year}: invalid overs per innings.`
    );
  }

  if (
    !Array.isArray(
      season.teams
    ) ||
    season.teams.length ===
      0
  ) {
    fail(
      `${year}: no teams found.`
    );
  }

  for (
    const team of
      season.teams
  ) {
    if (
      !team.name ||
      !team.slug
    ) {
      fail(
        `${year}: invalid team.`
      );
    }

    if (
      !Array.isArray(
        team.players
      ) ||
      team.players.length ===
        0
    ) {
      fail(
        `${year}/${team.name}: no players.`
      );
    }

    const ids =
      new Set<string>();

    for (
      const player of
        team.players
    ) {
      if (
        ids.has(
          player.sourcePlayerId
        )
      ) {
        fail(
          `${year}/${team.name}: duplicate player ID ${player.sourcePlayerId}.`
        );
      }

      ids.add(
        player.sourcePlayerId
      );

      if (
        !VALID_ROLES.has(
          player.role
        )
      ) {
        fail(
          `${year}/${team.name}/${player.fullName}: invalid role.`
        );
      }

      if (
        !Array.isArray(
          player.sources
        ) ||
        player.sources.length ===
          0
      ) {
        fail(
          `${year}/${team.name}/${player.fullName}: missing sources.`
        );
      }
    }
  }
}

async function getOrCreateSeason(
  year: number
) {
  const {
    data,
    error,
  } = await supabase
    .from("seasons")
    .select("id")
    .eq(
      "year",
      year
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data.id;
  }

  const {
    data: inserted,
    error:
      insertError,
  } = await supabase
    .from("seasons")
    .insert({
      year,
    })
    .select("id")
    .single();

  if (insertError) {
    throw insertError;
  }

  return inserted.id;
}

async function getOrCreateTeam(
  team: WorldSeason["teams"][number]
) {
  const {
    data,
    error,
  } = await supabase
    .from("teams")
    .select(
      "id, name, short_name, slug"
    )
    .eq(
      "slug",
      team.slug
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    if (
      data.name !==
        team.name ||
      data.short_name !==
        team.shortName
    ) {
      const {
        error:
          updateError,
      } = await supabase
        .from("teams")
        .update({
          name:
            team.name,
          short_name:
            team.shortName,
        })
        .eq(
          "id",
          data.id
        );

      if (updateError) {
        throw updateError;
      }
    }

    return data.id;
  }

  const {
    data: inserted,
    error:
      insertError,
  } = await supabase
    .from("teams")
    .insert({
      name:
        team.name,
      short_name:
        team.shortName,
      slug:
        team.slug,
    })
    .select("id")
    .single();

  if (insertError) {
    throw insertError;
  }

  return inserted.id;
}

async function getOrCreateTeamSeason(
  teamId: string,
  seasonId: string
) {
  const {
    data,
    error,
  } = await supabase
    .from("team_seasons")
    .select("id")
    .eq(
      "team_id",
      teamId
    )
    .eq(
      "season_id",
      seasonId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data.id;
  }

  const {
    data: inserted,
    error:
      insertError,
  } = await supabase
    .from("team_seasons")
    .insert({
      team_id:
        teamId,
      season_id:
        seasonId,
    })
    .select("id")
    .single();

  if (insertError) {
    throw insertError;
  }

  return inserted.id;
}

async function getOrCreatePlayer(
  player: WorldSeason["teams"][number]["players"][number]
) {
  const {
    data,
    error,
  } = await supabase
    .from("players")
    .select(
      "id, full_name"
    )
    .eq(
      "source_player_id",
      player.sourcePlayerId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    if (
      data.full_name !==
      player.fullName
    ) {
      fail(
        `Source player ${player.sourcePlayerId} maps to both "${data.full_name}" and "${player.fullName}".`
      );
    }

    return data.id;
  }

  const {
    data: inserted,
    error:
      insertError,
  } = await supabase
    .from("players")
    .insert({
      full_name:
        player.fullName,
      source_player_id:
        player.sourcePlayerId,
    })
    .select("id")
    .single();

  if (insertError) {
    throw insertError;
  }

  return inserted.id;
}

async function importPlayer(
  player: WorldSeason["teams"][number]["players"][number],
  teamSeasonId: string
) {
  const playerId =
    await getOrCreatePlayer(
      player
    );

  const {
    error:
      roleError,
  } = await supabase
    .from("player_roles")
    .upsert(
      {
        player_id:
          playerId,
        role:
          player.role,
      },
      {
        onConflict:
          "player_id,role",
      }
    );

  if (roleError) {
    throw roleError;
  }

  const {
    error:
      statsError,
  } = await supabase
    .from(
      "player_season_stats"
    )
    .upsert(
      {
        player_id:
          playerId,

        team_season_id:
          teamSeasonId,

        matches:
          player.stats.matches,

        innings:
          player.stats.innings,

        runs:
          player.stats.runs,

        batting_average:
          player.stats
            .batting_average,

        strike_rate:
          player.stats
            .strike_rate,

        hundreds:
          player.stats.hundreds,

        fifties:
          player.stats.fifties,

        wickets:
          player.stats.wickets,

        bowling_average:
          player.stats
            .bowling_average,

        economy:
          player.stats.economy,

        catches:
          player.stats.catches,

        stumpings:
          player.stats.stumpings,
      },
      {
        onConflict:
          "player_id,team_season_id",
      }
    );

  if (statsError) {
    throw statsError;
  }
}

async function importSeason(
  season: WorldSeason
) {
  const seasonId =
    await getOrCreateSeason(
      season.year
    );

  for (
    const team of
      season.teams
  ) {
    const teamId =
      await getOrCreateTeam(
        team
      );

    const teamSeasonId =
      await getOrCreateTeamSeason(
        teamId,
        seasonId
      );

    for (
      const player of
        team.players
    ) {
      await importPlayer(
        player,
        teamSeasonId
      );
    }
  }
}

async function main() {
  console.log(
    "[WORLD IMPORT] Starting."
  );

  for (
    const year of
      WORLD_AVAILABLE_EDITION_YEARS
  ) {
    const season =
      readSeason(
        year
      );

    validateSeason(
      season,
      year
    );

    await importSeason(
      season
    );

    console.log(
      `[WORLD IMPORT] Imported ${year}.`
    );
  }

  console.log(
    "[WORLD IMPORT] Successful."
  );
}

main().catch(
  (error) => {
    console.error(
      "[WORLD IMPORT] Failed:",
      error
    );

    process.exit(1);
  }
);