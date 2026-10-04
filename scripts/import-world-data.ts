import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  WORLD_EDITION_YEARS,
  getWorldEdition,
} from "./data/world/editions";

type WorldRole = "BAT" | "WK" | "AR" | "BOWL";

type WorldStats = {
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

type WorldPlayer = {
  fullName: string;
  sourcePlayerId: string;
  role: WorldRole;
  stats: WorldStats;
  sources?: string[];
};

type WorldTeam = {
  name: string;
  shortName: string;
  slug: string;
  players: WorldPlayer[];
  sources?: string[];
};

type WorldSeasonFile = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings?: number;
  teams: WorldTeam[];
  sources?: string[];
};

type DatabaseTeam = {
  id: string;
  name: string;
  short_name: string;
  slug: string | null;
};

type DatabaseSeason = {
  id: string;
  year: number;
};

type DatabasePlayer = {
  id: string;
  full_name: string;
  source_player_id: string | null;
};

type DatabaseTeamSeason = {
  id: string;
  team_id: string;
  season_id: string;
};

const WORLD_ROLES: readonly WorldRole[] = [
  "BAT",
  "WK",
  "AR",
  "BOWL",
];

const DATA_DIRECTORY = path.join(
  process.cwd(),
  "scripts",
  "data",
  "world",
  "processed",
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL in environment variables.",
  );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY in environment variables.",
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
);

function log(message: string) {
  console.log(`[WORLD IMPORT] ${message}`);
}

function fail(message: string): never {
  throw new Error(`[WORLD IMPORT] ${message}`);
}

function assertInteger(
  value: unknown,
  field: string,
  context: string,
) {
  if (!Number.isInteger(value)) {
    fail(`${context}: ${field} must be an integer.`);
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
  context: string,
) {
  assertInteger(value, field, context);

  if ((value as number) < 0) {
    fail(`${context}: ${field} cannot be negative.`);
  }
}

function assertNullableNumber(
  value: unknown,
  field: string,
  context: string,
) {
  if (value !== null && typeof value !== "number") {
    fail(`${context}: ${field} must be a number or null.`);
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    fail(`${context}: ${field} must be finite.`);
  }
}

function assertString(
  value: unknown,
  field: string,
  context: string,
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${context}: ${field} must be a non-empty string.`);
  }
}

function assertRole(
  role: unknown,
  context: string,
): asserts role is WorldRole {
  if (!WORLD_ROLES.includes(role as WorldRole)) {
    fail(
      `${context}: invalid role "${String(
        role,
      )}". Allowed roles: ${WORLD_ROLES.join(", ")}.`,
    );
  }
}

function validateStats(
  stats: WorldStats,
  context: string,
) {
  const integerFields: Array<keyof WorldStats> = [
    "matches",
    "innings",
    "runs",
    "hundreds",
    "fifties",
    "wickets",
    "catches",
    "stumpings",
  ];

  for (const field of integerFields) {
    assertNonNegativeInteger(
      stats[field],
      field,
      context,
    );
  }

  const numericFields: Array<keyof WorldStats> = [
    "batting_average",
    "strike_rate",
    "bowling_average",
    "economy",
  ];

  for (const field of numericFields) {
    assertNullableNumber(
      stats[field],
      field,
      context,
    );
  }

  if (stats.innings > stats.matches) {
    fail(
      `${context}: innings (${stats.innings}) cannot exceed matches (${stats.matches}).`,
    );
  }

  if (stats.hundreds > stats.innings) {
    fail(
      `${context}: hundreds cannot exceed innings.`,
    );
  }

  if (stats.fifties > stats.innings) {
    fail(
      `${context}: fifties cannot exceed innings.`,
    );
  }
}

function validateSeasonFile(
  data: WorldSeasonFile,
  fileName: string,
) {
  assertInteger(
    data.year,
    "year",
    fileName,
  );

  if (!WORLD_EDITION_YEARS.includes(data.year)) {
    fail(
      `${fileName}: unsupported World Cup year ${data.year}.`,
    );
  }

  const edition =
    getWorldEdition(data.year);

  if (!edition) {
    fail(
      `${fileName}: no World Cup edition configuration found for ${data.year}.`,
    );
  }

  if (
    data.seasonName !==
    edition.seasonName
  ) {
    fail(
      `${fileName}: seasonName must be "${edition.seasonName}".`,
    );
  }

  if (
    data.format !==
    edition.format
  ) {
    fail(
      `${fileName}: format must be ${edition.format}.`,
    );
  }

  if (
    data.competition !==
    edition.competition
  ) {
    fail(
      `${fileName}: invalid competition.`,
    );
  }

  if (
    data.oversPerInnings !== undefined &&
    data.oversPerInnings !==
    edition.oversPerInnings
  ) {
    fail(
      `${fileName}: oversPerInnings must be ${edition.oversPerInnings}.`,
    );
  }

  if (data.seasonName.trim().length === 0) {
    fail(`${fileName}: seasonName cannot be empty.`);
  }

  if (data.format !== "ODI") {
    fail(
      `${fileName}: format must be ODI.`,
    );
  }

  if (
    data.competition !==
    "ICC Men's Cricket World Cup"
  ) {
    fail(
      `${fileName}: invalid competition.`,
    );
  }

  if (!Array.isArray(data.teams)) {
    fail(
      `${fileName}: teams must be an array.`,
    );
  }

  if (data.teams.length === 0) {
    fail(
      `${fileName}: no teams found.`,
    );
  }

  const teamNames = new Set<string>();

  for (const team of data.teams) {
    const teamContext =
      `${data.year}/${team.name}`;

    assertString(
      team.name,
      "name",
      teamContext,
    );

    assertString(
      team.shortName,
      "shortName",
      teamContext,
    );

    assertString(
      team.slug,
      "slug",
      teamContext,
    );

    const normalizedTeamName =
      team.name.trim().toLowerCase();

    if (teamNames.has(normalizedTeamName)) {
      fail(
        `${fileName}: duplicate team "${team.name}".`,
      );
    }

    teamNames.add(normalizedTeamName);

    if (!Array.isArray(team.players)) {
      fail(
        `${teamContext}: players must be an array.`,
      );
    }

    if (team.players.length === 0) {
      fail(
        `${teamContext}: no players found.`,
      );
    }

    const playerNames = new Set<string>();
    const sourcePlayerIds = new Set<string>();

    for (const player of team.players) {
      const playerContext =
        `${data.year}/${team.name}/${player.fullName}`;

      assertString(
        player.fullName,
        "fullName",
        playerContext,
      );

      assertString(
        player.sourcePlayerId,
        "sourcePlayerId",
        playerContext,
      );

      assertRole(
        player.role,
        playerContext,
      );

      if (
        playerNames.has(
          player.fullName.trim().toLowerCase(),
        )
      ) {
        fail(
          `${fileName}: duplicate player "${player.fullName}" in ${team.name}.`,
        );
      }

      playerNames.add(
        player.fullName.trim().toLowerCase(),
      );

      if (
        sourcePlayerIds.has(
          player.sourcePlayerId,
        )
      ) {
        fail(
          `${fileName}: duplicate sourcePlayerId "${player.sourcePlayerId}".`,
        );
      }

      sourcePlayerIds.add(
        player.sourcePlayerId,
      );

      validateStats(
        player.stats,
        playerContext,
      );

      if (
        !player.sources ||
        player.sources.length === 0
      ) {
        fail(
          `${playerContext}: at least one official source is required.`,
        );
      }
    }
  }
}

function loadSeasonFiles(): WorldSeasonFile[] {
  if (!fs.existsSync(DATA_DIRECTORY)) {
    fail(
      `Processed data directory does not exist: ${DATA_DIRECTORY}`,
    );
  }

  const files = fs
    .readdirSync(DATA_DIRECTORY)
    .filter(
      (file) =>
        file.endsWith(".json") &&
        !file.startsWith("_"),
    )
    .sort();

  if (files.length === 0) {
    fail(
      `No processed World JSON files found in ${DATA_DIRECTORY}.`,
    );
  }

  const seasons: WorldSeasonFile[] = [];

  for (const file of files) {
    const fullPath =
      path.join(DATA_DIRECTORY, file);

    const raw = fs.readFileSync(
      fullPath,
      "utf8",
    );

    let parsed: WorldSeasonFile;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      fail(
        `${file}: invalid JSON. ${String(error)}`,
      );
    }

    validateSeasonFile(
      parsed,
      file,
    );

    seasons.push(parsed);
  }

  const years = new Set<number>();

  for (const season of seasons) {
    if (years.has(season.year)) {
      fail(
        `Duplicate season year ${season.year} across processed files.`,
      );
    }

    years.add(season.year);
  }

  for (const requiredYear of WORLD_EDITION_YEARS) {
    if (!years.has(requiredYear)) {
      fail(
        `Missing required World Cup edition ${requiredYear}.`,
      );
    }
  }

  return seasons.sort(
    (a, b) => a.year - b.year,
  );
}

async function upsertSeasons(
  seasons: WorldSeasonFile[],
) {
  log("Upserting seasons...");

  const rows = seasons.map(
    (season) => ({
      year: season.year,
    }),
  );

  const { data, error } =
    await supabase
      .from("seasons")
      .upsert(
        rows,
        {
          onConflict: "year",
        },
      )
      .select(
        "id, year",
      );

  if (error) {
    fail(
      `Failed to upsert seasons: ${error.message}`,
    );
  }

  return data as DatabaseSeason[];
}

async function upsertTeams(
  seasons: WorldSeasonFile[],
) {
  log("Upserting teams...");

  const teamMap = new Map<
    string,
    {
      name: string;
      short_name: string;
      slug: string;
    }
  >();

  for (const season of seasons) {
    for (const team of season.teams) {
      const key =
        team.name.trim().toLowerCase();

      if (!teamMap.has(key)) {
        teamMap.set(
          key,
          {
            name: team.name.trim(),
            short_name:
              team.shortName.trim(),
            slug: team.slug.trim(),
          },
        );
      }
    }
  }

  const rows =
    Array.from(teamMap.values());

  const { data, error } =
    await supabase
      .from("teams")
      .upsert(
        rows,
        {
          onConflict: "name",
        },
      )
      .select(
        "id, name, short_name, slug",
      );

  if (error) {
    fail(
      `Failed to upsert teams: ${error.message}`,
    );
  }

  return data as DatabaseTeam[];
}

async function upsertTeamSeasons(
  seasons: WorldSeasonFile[],
  databaseSeasons: DatabaseSeason[],
  databaseTeams: DatabaseTeam[],
) {
  log(
    "Upserting team-season relationships...",
  );

  const seasonMap =
    new Map<number, string>();

  for (const season of databaseSeasons) {
    seasonMap.set(
      season.year,
      season.id,
    );
  }

  const teamMap =
    new Map<string, string>();

  for (const team of databaseTeams) {
    teamMap.set(
      team.name.trim().toLowerCase(),
      team.id,
    );
  }

  const rows: Array<{
    team_id: string;
    season_id: string;
  }> = [];

  for (const season of seasons) {
    const seasonId =
      seasonMap.get(season.year);

    if (!seasonId) {
      fail(
        `No database season ID found for ${season.year}.`,
      );
    }

    for (const team of season.teams) {
      const teamId =
        teamMap.get(
          team.name.trim().toLowerCase(),
        );

      if (!teamId) {
        fail(
          `No database team ID found for "${team.name}".`,
        );
      }

      rows.push({
        team_id: teamId,
        season_id: seasonId,
      });
    }
  }

  const { data, error } =
    await supabase
      .from("team_seasons")
      .upsert(
        rows,
        {
          onConflict:
            "team_id,season_id",
        },
      )
      .select(
        "id, team_id, season_id",
      );

  if (error) {
    fail(
      `Failed to upsert team_seasons: ${error.message}`,
    );
  }

  return data as DatabaseTeamSeason[];
}

async function upsertPlayers(
  seasons: WorldSeasonFile[],
) {
  log("Upserting players...");

  const playerMap =
    new Map<
      string,
      {
        full_name: string;
        source_player_id: string;
      }
    >();

  for (const season of seasons) {
    for (const team of season.teams) {
      for (const player of team.players) {
        const key =
          player.sourcePlayerId.trim();

        const existing =
          playerMap.get(key);

        if (
          existing &&
          existing.full_name !==
          player.fullName.trim()
        ) {
          fail(
            `sourcePlayerId "${key}" is assigned to multiple players.`,
          );
        }

        playerMap.set(
          key,
          {
            full_name:
              player.fullName.trim(),
            source_player_id:
              key,
          },
        );
      }
    }
  }

  const rows =
    Array.from(playerMap.values());

  const { data, error } =
    await supabase
      .from("players")
      .upsert(
        rows,
        {
          onConflict:
            "source_player_id",
        },
      )
      .select(
        "id, full_name, source_player_id",
      );

  if (error) {
    fail(
      `Failed to upsert players: ${error.message}`,
    );
  }

  return data as DatabasePlayer[];
}

async function buildPlayerMap() {
  const { data, error } =
    await supabase
      .from("players")
      .select(
        "id, full_name, source_player_id",
      );

  if (error) {
    fail(
      `Failed to fetch players: ${error.message}`,
    );
  }

  const map =
    new Map<string, DatabasePlayer>();

  for (const player of data as DatabasePlayer[]) {
    if (
      player.source_player_id
    ) {
      map.set(
        player.source_player_id,
        player,
      );
    }
  }

  return map;
}

async function upsertRoles(
  seasons: WorldSeasonFile[],
  playerMap: Map<string, DatabasePlayer>,
) {
  log("Upserting player roles...");

  const rows: Array<{
    player_id: string;
    role: WorldRole;
  }> = [];

  const roleMap =
    new Map<string, WorldRole>();

  for (const season of seasons) {
    for (const team of season.teams) {
      for (const player of team.players) {
        const databasePlayer =
          playerMap.get(
            player.sourcePlayerId,
          );

        if (!databasePlayer) {
          fail(
            `Player "${player.fullName}" was not found after player upsert.`,
          );
        }

        const existingRole =
          roleMap.get(
            databasePlayer.id,
          );

        if (
          existingRole &&
          existingRole !== player.role
        ) {
          fail(
            `Player "${player.fullName}" has conflicting roles: ${existingRole} and ${player.role}.`,
          );
        }

        roleMap.set(
          databasePlayer.id,
          player.role,
        );
      }
    }
  }

  for (
    const [playerId, role]
    of roleMap.entries()
  ) {
    rows.push({
      player_id: playerId,
      role,
    });
  }

  const { error } =
    await supabase
      .from("player_roles")
      .upsert(
        rows,
        {
          onConflict:
            "player_id,role",
        },
      );

  if (error) {
    fail(
      `Failed to upsert player_roles: ${error.message}`,
    );
  }
}

async function upsertStats(
  seasons: WorldSeasonFile[],
  playerMap: Map<string, DatabasePlayer>,
  teamSeasonMap: Map<string, DatabaseTeamSeason>,
) {
  log(
    "Upserting player-season statistics...",
  );

  const rows: Array<{
    player_id: string;
    team_season_id: string;
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
  }> = [];

  for (const season of seasons) {
    for (const team of season.teams) {
      const teamSeasonKey =
        `${season.year}:${team.name
          .trim()
          .toLowerCase()}`;

      const teamSeason =
        teamSeasonMap.get(
          teamSeasonKey,
        );

      if (!teamSeason) {
        fail(
          `Missing team-season relationship for ${team.name} / ${season.year}.`,
        );
      }

      for (const player of team.players) {
        const databasePlayer =
          playerMap.get(
            player.sourcePlayerId,
          );

        if (!databasePlayer) {
          fail(
            `Player "${player.fullName}" not found while importing stats.`,
          );
        }

        rows.push({
          player_id:
            databasePlayer.id,
          team_season_id:
            teamSeason.id,
          matches:
            player.stats.matches,
          innings:
            player.stats.innings,
          runs:
            player.stats.runs,
          batting_average:
            player.stats.batting_average,
          strike_rate:
            player.stats.strike_rate,
          hundreds:
            player.stats.hundreds,
          fifties:
            player.stats.fifties,
          wickets:
            player.stats.wickets,
          bowling_average:
            player.stats.bowling_average,
          economy:
            player.stats.economy,
          catches:
            player.stats.catches,
          stumpings:
            player.stats.stumpings,
        });
      }
    }
  }

  const CHUNK_SIZE = 500;

  for (
    let index = 0;
    index < rows.length;
    index += CHUNK_SIZE
  ) {
    const chunk =
      rows.slice(
        index,
        index + CHUNK_SIZE,
      );

    const { error } =
      await supabase
        .from(
          "player_season_stats",
        )
        .upsert(
          chunk,
          {
            onConflict:
              "player_id,team_season_id",
          },
        );

    if (error) {
      fail(
        `Failed to upsert player_season_stats at rows ${index}-${index + chunk.length - 1}: ${error.message}`,
      );
    }

    log(
      `Imported stats ${Math.min(
        index + chunk.length,
        rows.length,
      )}/${rows.length}`,
    );
  }
}

function buildTeamSeasonMap(
  seasons: WorldSeasonFile[],
  databaseSeasons: DatabaseSeason[],
  databaseTeams: DatabaseTeam[],
  databaseTeamSeasons: DatabaseTeamSeason[],
) {
  const seasonMap =
    new Map<number, string>();

  for (const season of databaseSeasons) {
    seasonMap.set(
      season.year,
      season.id,
    );
  }

  const teamMap =
    new Map<string, string>();

  for (const team of databaseTeams) {
    teamMap.set(
      team.name.trim().toLowerCase(),
      team.id,
    );
  }

  const result =
    new Map<string, DatabaseTeamSeason>();

  for (
    const teamSeason
    of databaseTeamSeasons
  ) {
    const year =
      Array.from(
        seasonMap.entries(),
      ).find(
        ([, seasonId]) =>
          seasonId ===
          teamSeason.season_id,
      )?.[0];

    if (year === undefined) {
      continue;
    }

    const teamName =
      Array.from(
        teamMap.entries(),
      ).find(
        ([, teamId]) =>
          teamId ===
          teamSeason.team_id,
      )?.[0];

    if (!teamName) {
      continue;
    }

    result.set(
      `${year}:${teamName}`,
      teamSeason,
    );
  }

  return result;
}

async function verifyImport(
  seasons: WorldSeasonFile[],
) {
  log("Running post-import verification...");

  const expectedTeams =
    seasons.reduce(
      (total, season) =>
        total + season.teams.length,
      0,
    );

  const expectedPlayers =
    new Set(
      seasons.flatMap(
        (season) =>
          season.teams.flatMap(
            (team) =>
              team.players.map(
                (player) =>
                  player.sourcePlayerId,
              ),
          ),
      ),
    ).size;

  const expectedStats =
    seasons.reduce(
      (total, season) =>
        total +
        season.teams.reduce(
          (teamTotal, team) =>
            teamTotal +
            team.players.length,
          0,
        ),
      0,
    );

  const { count: seasonCount, error: seasonError } =
    await supabase
      .from("seasons")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      )
      .in(
        "year",
        WORLD_EDITION_YEARS,
      );

  if (seasonError) {
    fail(
      `Verification failed for seasons: ${seasonError.message}`,
    );
  }

  if (
    seasonCount !==
    WORLD_EDITION_YEARS.length
  ) {
    fail(
      `Expected ${WORLD_EDITION_YEARS.length} World seasons but found ${seasonCount}.`,
    );
  }

  const { count: teamCount, error: teamError } =
    await supabase
      .from("teams")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      );

  if (teamError) {
    fail(
      `Verification failed for teams: ${teamError.message}`,
    );
  }

  log(
    `Database currently contains ${teamCount ?? 0} teams total. Expected World import processed ${expectedTeams} team-season entries.`,
  );

  const { count: playerCount, error: playerError } =
    await supabase
      .from("players")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      );

  if (playerError) {
    fail(
      `Verification failed for players: ${playerError.message}`,
    );
  }

  if (
    (playerCount ?? 0) <
    expectedPlayers
  ) {
    fail(
      `Expected at least ${expectedPlayers} players after import but found ${playerCount}.`,
    );
  }

  const { count: statsCount, error: statsError } =
    await supabase
      .from(
        "player_season_stats",
      )
      .select(
        "id",
        {
          count: "exact",
          head: true,
        },
      );

  if (statsError) {
    fail(
      `Verification failed for player_season_stats: ${statsError.message}`,
    );
  }

  if (
    (statsCount ?? 0) <
    expectedStats
  ) {
    fail(
      `Expected at least ${expectedStats} player-season stat rows after import but found ${statsCount}.`,
    );
  }

  log(
    "Post-import verification passed.",
  );
}

async function main() {
  log(
    "Starting World data import.",
  );

  log(
    `Supported editions: ${WORLD_EDITION_YEARS.join(", ")}`,
  );

  const seasons =
    loadSeasonFiles();

  log(
    `Loaded ${seasons.length} processed World Cup files.`,
  );

  const databaseSeasons =
    await upsertSeasons(
      seasons,
    );

  const databaseTeams =
    await upsertTeams(
      seasons,
    );

  const databaseTeamSeasons =
    await upsertTeamSeasons(
      seasons,
      databaseSeasons,
      databaseTeams,
    );

  await upsertPlayers(
    seasons,
  );

  const playerMap =
    await buildPlayerMap();

  await upsertRoles(
    seasons,
    playerMap,
  );

  const teamSeasonMap =
    buildTeamSeasonMap(
      seasons,
      databaseSeasons,
      databaseTeams,
      databaseTeamSeasons,
    );

  await upsertStats(
    seasons,
    playerMap,
    teamSeasonMap,
  );

  await verifyImport(
    seasons,
  );

  log(
    "World data import completed successfully.",
  );
}

main().catch(
  (error) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exit(1);
  },
);