import fs from "node:fs";
import path from "node:path";

type WorldRole =
  | "BAT"
  | "WK"
  | "AR"
  | "BOWL";

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
  teams: WorldTeam[];
  sources?: string[];
};

const REQUIRED_YEARS = [
  2011,
  2015,
  2019,
  2023,
];

const ROLES: WorldRole[] = [
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

function fail(message: string): never {
  throw new Error(
    `[WORLD VALIDATION] ${message}`,
  );
}

function isFiniteNumber(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function validateStats(
  stats: WorldStats,
  context: string,
) {
  const integerFields = [
    "matches",
    "innings",
    "runs",
    "hundreds",
    "fifties",
    "wickets",
    "catches",
    "stumpings",
  ] as const;

  for (const field of integerFields) {
    const value =
      stats[field];

    if (
      !Number.isInteger(value) ||
      value < 0
    ) {
      fail(
        `${context}: ${field} must be a non-negative integer.`,
      );
    }
  }

  const numericFields = [
    "batting_average",
    "strike_rate",
    "bowling_average",
    "economy",
  ] as const;

  for (const field of numericFields) {
    const value =
      stats[field];

    if (
      value !== null &&
      !isFiniteNumber(value)
    ) {
      fail(
        `${context}: ${field} must be a finite number or null.`,
      );
    }

    if (
      typeof value === "number" &&
      value < 0
    ) {
      fail(
        `${context}: ${field} cannot be negative.`,
      );
    }
  }

  if (
    stats.innings >
    stats.matches
  ) {
    fail(
      `${context}: innings cannot exceed matches.`,
    );
  }

  if (
    stats.hundreds >
    stats.innings
  ) {
    fail(
      `${context}: hundreds cannot exceed innings.`,
    );
  }

  if (
    stats.fifties >
    stats.innings
  ) {
    fail(
      `${context}: fifties cannot exceed innings.`,
    );
  }
}

function validatePlayer(
  player: WorldPlayer,
  context: string,
) {
  if (
    !player.fullName ||
    !player.fullName.trim()
  ) {
    fail(
      `${context}: fullName is required.`,
    );
  }

  if (
    !player.sourcePlayerId ||
    !player.sourcePlayerId.trim()
  ) {
    fail(
      `${context}: sourcePlayerId is required.`,
    );
  }

  if (
    !ROLES.includes(
      player.role,
    )
  ) {
    fail(
      `${context}: invalid role ${player.role}.`,
    );
  }

  if (
    !player.sources ||
    player.sources.length === 0
  ) {
    fail(
      `${context}: official source is required.`,
    );
  }

  validateStats(
    player.stats,
    context,
  );
}

function validateSeason(
  season: WorldSeasonFile,
  fileName: string,
) {
  if (
    !REQUIRED_YEARS.includes(
      season.year,
    )
  ) {
    fail(
      `${fileName}: unsupported year ${season.year}.`,
    );
  }

  if (
    season.format !== "ODI"
  ) {
    fail(
      `${fileName}: format must be ODI.`,
    );
  }

  if (
    season.competition !==
    "ICC Men's Cricket World Cup"
  ) {
    fail(
      `${fileName}: invalid competition.`,
    );
  }

  if (
    !Array.isArray(
      season.teams,
    ) ||
    season.teams.length === 0
  ) {
    fail(
      `${fileName}: teams array is empty.`,
    );
  }

  const teamKeys =
    new Set<string>();

  const globalSourceIds =
    new Set<string>();

  for (const team of season.teams) {
    const teamKey =
      team.name
        .trim()
        .toLowerCase();

    if (
      teamKeys.has(teamKey)
    ) {
      fail(
        `${fileName}: duplicate team ${team.name}.`,
      );
    }

    teamKeys.add(teamKey);

    if (
      !Array.isArray(
        team.players,
      ) ||
      team.players.length === 0
    ) {
      fail(
        `${fileName}: ${team.name} has no players.`,
      );
    }

    const playerKeys =
      new Set<string>();

    for (const player of team.players) {
      const playerContext =
        `${season.year}/${team.name}/${player.fullName}`;

      const playerKey =
        player.fullName
          .trim()
          .toLowerCase();

      if (
        playerKeys.has(
          playerKey,
        )
      ) {
        fail(
          `${fileName}: duplicate player ${player.fullName} in ${team.name}.`,
        );
      }

      playerKeys.add(
        playerKey,
      );

      if (
        globalSourceIds.has(
          player.sourcePlayerId,
        )
      ) {
        /*
         * A player may legitimately appear in more than one
         * World Cup edition, but the same sourcePlayerId must
         * refer to the same player.
         *
         * Therefore we do not reject it here.
         */
      }

      globalSourceIds.add(
        player.sourcePlayerId,
      );

      validatePlayer(
        player,
        playerContext,
      );
    }
  }
}

function main() {
  if (
    !fs.existsSync(
      DATA_DIRECTORY,
    )
  ) {
    fail(
      `Missing directory ${DATA_DIRECTORY}`,
    );
  }

  const files =
    fs
      .readdirSync(
        DATA_DIRECTORY,
      )
      .filter(
        (file) =>
          file.endsWith(
            ".json",
          ),
      )
      .sort();

  if (
    files.length !==
    REQUIRED_YEARS.length
  ) {
    fail(
      `Expected ${REQUIRED_YEARS.length} processed World Cup JSON files, found ${files.length}.`,
    );
  }

  const years =
    new Set<number>();

  let totalTeams = 0;
  let totalPlayers = 0;

  for (const file of files) {
    const raw =
      fs.readFileSync(
        path.join(
          DATA_DIRECTORY,
          file,
        ),
        "utf8",
      );

    let parsed: WorldSeasonFile;

    try {
      parsed =
        JSON.parse(raw);
    } catch {
      fail(
        `${file}: invalid JSON.`,
      );
    }

    validateSeason(
      parsed,
      file,
    );

    if (
      years.has(
        parsed.year,
      )
    ) {
      fail(
        `Duplicate season ${parsed.year}.`,
      );
    }

    years.add(
      parsed.year,
    );

    totalTeams +=
      parsed.teams.length;

    totalPlayers +=
      parsed.teams.reduce(
        (sum, team) =>
          sum +
          team.players.length,
        0,
      );

    console.log(
      `[WORLD VALIDATION] ${parsed.year}: ${parsed.teams.length} teams / ${parsed.teams.reduce(
        (sum, team) =>
          sum +
          team.players.length,
        0,
      )} players`,
    );
  }

  for (const year of REQUIRED_YEARS) {
    if (!years.has(year)) {
      fail(
        `Missing required edition ${year}.`,
      );
    }
  }

  console.log("");
  console.log(
    "[WORLD VALIDATION] Validation successful.",
  );
  console.log(
    `[WORLD VALIDATION] Editions: ${years.size}`,
  );
  console.log(
    `[WORLD VALIDATION] Team entries: ${totalTeams}`,
  );
  console.log(
    `[WORLD VALIDATION] Player entries: ${totalPlayers}`,
  );
}

main();