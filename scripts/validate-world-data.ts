import fs from "node:fs";
import path from "node:path";

import {
  WORLD_EDITION_YEARS,
  getWorldEdition,
} from "./data/world/editions";

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
  oversPerInnings?: number;
  teams: WorldTeam[];
  sources?: string[];
};

const ROLES: readonly WorldRole[] = [
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
  if (!stats || typeof stats !== "object") {
    fail(`${context}: stats object is required.`);
  }

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
    const value = stats[field];

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
    const value = stats[field];

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

function validateSources(
  sources: unknown,
  context: string,
) {
  if (
    !Array.isArray(sources) ||
    sources.length === 0
  ) {
    fail(
      `${context}: at least one official source is required.`,
    );
  }

  for (const source of sources) {
    if (
      typeof source !== "string" ||
      source.trim().length === 0
    ) {
      fail(
        `${context}: every source must be a non-empty string.`,
      );
    }

    if (
      !source.startsWith("http://") &&
      !source.startsWith("https://")
    ) {
      fail(
        `${context}: invalid source URL "${source}".`,
      );
    }
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
    !ROLES.includes(player.role)
  ) {
    fail(
      `${context}: invalid role "${String(
        player.role,
      )}".`,
    );
  }

  validateSources(
    player.sources,
    context,
  );

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
    !WORLD_EDITION_YEARS.includes(
      season.year,
    )
  ) {
    fail(
      `${fileName}: unsupported World Cup year ${season.year}.`,
    );
  }

  const edition =
    getWorldEdition(season.year);

  if (!edition) {
    fail(
      `${fileName}: no edition configuration exists for ${season.year}.`,
    );
  }

  if (
    season.seasonName !==
    edition.seasonName
  ) {
    fail(
      `${fileName}: seasonName must be "${edition.seasonName}".`,
    );
  }

  if (
    season.format !==
    edition.format
  ) {
    fail(
      `${fileName}: format must be ${edition.format}.`,
    );
  }

  if (
    season.competition !==
    edition.competition
  ) {
    fail(
      `${fileName}: invalid competition.`,
    );
  }

  if (
    season.oversPerInnings !== undefined &&
    season.oversPerInnings !==
      edition.oversPerInnings
  ) {
    fail(
      `${fileName}: oversPerInnings must be ${edition.oversPerInnings}.`,
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

  validateSources(
    season.sources,
    fileName,
  );

  const teamKeys =
    new Set<string>();

  const editionSourceIds =
    new Map<
      string,
      string
    >();

  for (const team of season.teams) {
    if (
      !team.name ||
      !team.name.trim()
    ) {
      fail(
        `${fileName}: team name is required.`,
      );
    }

    if (
      !team.shortName ||
      !team.shortName.trim()
    ) {
      fail(
        `${fileName}: ${team.name}: shortName is required.`,
      );
    }

    if (
      !team.slug ||
      !team.slug.trim()
    ) {
      fail(
        `${fileName}: ${team.name}: slug is required.`,
      );
    }

    const teamKey =
      team.name
        .trim()
        .toLowerCase();

    if (
      teamKeys.has(teamKey)
    ) {
      fail(
        `${fileName}: duplicate team "${team.name}".`,
      );
    }

    teamKeys.add(teamKey);

    validateSources(
      team.sources,
      `${season.year}/${team.name}`,
    );

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
          `${fileName}: duplicate player "${player.fullName}" in ${team.name}.`,
        );
      }

      playerKeys.add(
        playerKey,
      );

      const sourceId =
        player.sourcePlayerId.trim();

      const previousPlayer =
        editionSourceIds.get(
          sourceId,
        );

      if (
        previousPlayer &&
        previousPlayer !==
          player.fullName.trim()
      ) {
        fail(
          `${fileName}: sourcePlayerId "${sourceId}" maps to both "${previousPlayer}" and "${player.fullName}".`,
        );
      }

      editionSourceIds.set(
        sourceId,
        player.fullName.trim(),
      );

      validatePlayer(
        player,
        playerContext,
      );
    }
  }
}

function main() {
  console.log(
    "[WORLD VALIDATION] Starting validation.",
  );

  console.log(
    `[WORLD VALIDATION] Expected editions: ${WORLD_EDITION_YEARS.join(
      ", ",
    )}`,
  );

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
          file.endsWith(".json") &&
          !file.startsWith("_"),
      )
      .sort();

  if (
    files.length !==
    WORLD_EDITION_YEARS.length
  ) {
    fail(
      `Expected ${WORLD_EDITION_YEARS.length} processed World Cup JSON files, found ${files.length}.`,
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

    const playerCount =
      parsed.teams.reduce(
        (sum, team) =>
          sum +
          team.players.length,
        0,
      );

    totalTeams +=
      parsed.teams.length;

    totalPlayers +=
      playerCount;

    console.log(
      `[WORLD VALIDATION] ${parsed.year}: ${parsed.teams.length} teams / ${playerCount} players / ${parsed.oversPerInnings ?? getWorldEdition(parsed.year)!.oversPerInnings} overs`,
    );
  }

  for (
    const year of WORLD_EDITION_YEARS
  ) {
    if (
      !years.has(year)
    ) {
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