import fs from "node:fs";
import path from "node:path";

import {
  WORLD_AVAILABLE_EDITION_YEARS,
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

const DATA_DIRECTORY =
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
    `[WORLD VALIDATION] ${message}`
  );
}

function readJson(
  filePath: string
): unknown {
  if (
    !fs.existsSync(filePath)
  ) {
    fail(
      `Missing file: ${filePath}`
    );
  }

  const raw =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  if (!raw.trim()) {
    fail(
      `File is empty: ${filePath}`
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(
      `${path.basename(filePath)}: invalid JSON. ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}

function validateSources(
  sources: unknown,
  context: string
) {
  if (
    !Array.isArray(
      sources
    ) ||
    sources.length === 0
  ) {
    fail(
      `${context}: at least one official source is required.`
    );
  }

  for (
    const source of sources
  ) {
    if (
      typeof source !==
        "string" ||
      source.trim().length === 0 ||
      (
        !source.startsWith(
          "https://"
        ) &&
        !source.startsWith(
          "http://"
        )
      )
    ) {
      fail(
        `${context}: invalid source URL.`
      );
    }
  }
}

function validateStats(
  stats: WorldStats,
  context: string
) {
  if (
    !stats ||
    typeof stats !==
      "object"
  ) {
    fail(
      `${context}: stats are required.`
    );
  }

  const integers =
    [
      "matches",
      "innings",
      "runs",
      "hundreds",
      "fifties",
      "wickets",
      "catches",
      "stumpings",
    ] as const;

  for (
    const field of integers
  ) {
    const value =
      stats[field];

    if (
      !Number.isInteger(
        value
      ) ||
      value < 0
    ) {
      fail(
        `${context}: ${field} must be a non-negative integer.`
      );
    }
  }

  const decimals =
    [
      "batting_average",
      "strike_rate",
      "bowling_average",
      "economy",
    ] as const;

  for (
    const field of decimals
  ) {
    const value =
      stats[field];

    if (
      value !== null &&
      (
        typeof value !==
          "number" ||
        !Number.isFinite(
          value
        ) ||
        value < 0
      )
    ) {
      fail(
        `${context}: ${field} must be a non-negative number or null.`
      );
    }
  }

  if (
    stats.innings >
    stats.matches
  ) {
    fail(
      `${context}: innings cannot exceed matches.`
    );
  }

  if (
    stats.hundreds >
    stats.innings
  ) {
    fail(
      `${context}: hundreds cannot exceed innings.`
    );
  }

  if (
    stats.fifties >
    stats.innings
  ) {
    fail(
      `${context}: fifties cannot exceed innings.`
    );
  }
}

function validateSeason(
  season: WorldSeasonFile,
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
      `${year}: edition is not currently available.`
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
      `${year}: invalid seasonName.`
    );
  }

  if (
    season.format !==
    "ODI"
  ) {
    fail(
      `${year}: format must be ODI.`
    );
  }

  if (
    season.competition !==
    "ICC Men's Cricket World Cup"
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
      `${year}: oversPerInnings must be ${edition.oversPerInnings}.`
    );
  }

  validateSources(
    season.sources,
    String(year)
  );

  if (
    !Array.isArray(
      season.teams
    ) ||
    season.teams.length === 0
  ) {
    fail(
      `${year}: teams cannot be empty.`
    );
  }

  const teamNames =
    new Set<string>();

  const sourcePlayers =
    new Map<
      string,
      string
    >();

  for (
    const team of
      season.teams
  ) {
    const teamKey =
      team.name
        .trim()
        .toLowerCase();

    if (
      teamNames.has(
        teamKey
      )
    ) {
      fail(
        `${year}: duplicate team ${team.name}.`
      );
    }

    teamNames.add(
      teamKey
    );

    validateSources(
      team.sources,
      `${year}/${team.name}`
    );

    if (
      !Array.isArray(
        team.players
      ) ||
      team.players.length ===
        0
    ) {
      fail(
        `${year}/${team.name}: players are required.`
      );
    }

    const teamPlayerIds =
      new Set<string>();

    for (
      const player of
        team.players
    ) {
      if (
        !player.fullName?.trim()
      ) {
        fail(
          `${year}/${team.name}: player name is required.`
        );
      }

      if (
        !player.sourcePlayerId?.trim()
      ) {
        fail(
          `${year}/${team.name}/${player.fullName}: sourcePlayerId is required.`
        );
      }

      if (
        !ROLES.includes(
          player.role
        )
      ) {
        fail(
          `${year}/${team.name}/${player.fullName}: invalid role.`
        );
      }

      if (
        teamPlayerIds.has(
          player.sourcePlayerId
        )
      ) {
        fail(
          `${year}/${team.name}: duplicate player sourcePlayerId ${player.sourcePlayerId}.`
        );
      }

      teamPlayerIds.add(
        player.sourcePlayerId
      );

      const existingName =
        sourcePlayers.get(
          player.sourcePlayerId
        );

      if (
        existingName &&
        existingName !==
          player.fullName
      ) {
        fail(
          `${year}: sourcePlayerId ${player.sourcePlayerId} maps to multiple names.`
        );
      }

      sourcePlayers.set(
        player.sourcePlayerId,
        player.fullName
      );

      validateSources(
        player.sources,
        `${year}/${team.name}/${player.fullName}`
      );

      validateStats(
        player.stats,
        `${year}/${team.name}/${player.fullName}`
      );
    }
  }
}

function main() {
  console.log(
    "[WORLD VALIDATION] Starting."
  );

  console.log(
    `[WORLD VALIDATION] Enabled editions: ${WORLD_AVAILABLE_EDITION_YEARS.join(
      ", "
    )}`
  );

  const files =
    fs.existsSync(
      DATA_DIRECTORY
    )
      ? fs.readdirSync(
          DATA_DIRECTORY
        )
      : [];

  const expected =
    new Set(
      WORLD_AVAILABLE_EDITION_YEARS.map(
        (year) =>
          `${year}.json`
      )
    );

  for (
    const file of files
  ) {
    if (
      file.endsWith(
        ".json"
      ) &&
      !expected.has(file)
    ) {
      fail(
        `Unexpected processed World file: ${file}`
      );
    }
  }

  for (
    const year of
      WORLD_AVAILABLE_EDITION_YEARS
  ) {
    const fileName =
      `${year}.json`;

    const filePath =
      path.join(
        DATA_DIRECTORY,
        fileName
      );

    const parsed =
      readJson(
        filePath
      );

    validateSeason(
      parsed as WorldSeasonFile,
      year
    );

    const season =
      parsed as WorldSeasonFile;

    const playerCount =
      season.teams.reduce(
        (
          total,
          team
        ) =>
          total +
          team.players.length,
        0
      );

    console.log(
      `[WORLD VALIDATION] ${year}: ${season.teams.length} teams / ${playerCount} players`
    );
  }

  console.log("");
  console.log(
    "[WORLD VALIDATION] Successful."
  );
}

main();