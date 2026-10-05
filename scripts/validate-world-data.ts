import fs from "node:fs";
import path from "node:path";

import {
  WORLD_AVAILABLE_EDITIONS,
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

type Player = {
  fullName: string;
  sourcePlayerId: string;
  role: WorldRole;

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

  sources: Array<
    string | {
      provider: string;
      url: string;
    }
  >;

  roleSource: {
    provider: string;
    url: string;
    retrievedAt: string;
  };
};

type Team = {
  name: string;
  shortName: string;
  slug: string;
  players: Player[];
  sources: string[];
};

type SeasonFile = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition:
    "ICC Men's Cricket World Cup";
  oversPerInnings:
    50 | 60;
  teams: Team[];
  sources: string[];
};

const PROCESSED_DIRECTORY =
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

function isFiniteOrNull(
  value: unknown
): value is number | null {
  return (
    value === null ||
    (
      typeof value ===
        "number" &&
      Number.isFinite(
        value
      )
    )
  );
}

function validatePlayer(
  player: Player,
  context: string
) {
  if (
    !player.fullName
  ) {
    fail(
      `${context}: missing fullName.`
    );
  }

  if (
    !player.sourcePlayerId
  ) {
    fail(
      `${context}: missing sourcePlayerId.`
    );
  }

  if (
    !VALID_ROLES.has(
      player.role
    )
  ) {
    fail(
      `${context}: invalid role ${player.role}.`
    );
  }

  if (
    !player.roleSource ||
    !player.roleSource.provider ||
    !player.roleSource.url
  ) {
    fail(
      `${context}: missing roleSource.`
    );
  }

  const stats =
    player.stats;

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

  for (
    const field of
      integerFields
  ) {
    if (
      !Number.isInteger(
        stats[field]
      ) ||
      stats[field] < 0
    ) {
      fail(
        `${context}: ${field} must be a non-negative integer.`
      );
    }
  }

  const numericFields = [
    "batting_average",
    "strike_rate",
    "bowling_average",
    "economy",
  ] as const;

  for (
    const field of
      numericFields
  ) {
    if (
      !isFiniteOrNull(
        stats[field]
      )
    ) {
      fail(
        `${context}: ${field} must be numeric or null.`
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
  year: number
) {
  const filePath =
    path.join(
      PROCESSED_DIRECTORY,
      `${year}.json`
    );

  if (
    !fs.existsSync(
      filePath
    )
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

  if (
    !raw.trim()
  ) {
    fail(
      `${year}.json is empty.`
    );
  }

  let season:
    SeasonFile;

  try {
    season =
      JSON.parse(
        raw
      ) as SeasonFile;
  } catch {
    fail(
      `${year}.json contains invalid JSON.`
    );
  }

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
      `${year} is not configured as an available edition.`
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
      `${year}: season name mismatch.`
    );
  }

  if (
    season.format !==
    edition.format
  ) {
    fail(
      `${year}: format mismatch.`
    );
  }

  if (
    season.competition !==
    edition.competition
  ) {
    fail(
      `${year}: competition mismatch.`
    );
  }

  if (
    season.oversPerInnings !==
    edition.oversPerInnings
  ) {
    fail(
      `${year}: overs mismatch.`
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
      `${year}: no teams.`
    );
  }

  const teamNames =
    new Set<string>();

  const sourceIds =
    new Map<
      string,
      string
    >();

  let totalPlayers = 0;

  for (
    const team of
      season.teams
  ) {
    if (
      teamNames.has(
        team.name
      )
    ) {
      fail(
        `${year}: duplicate team ${team.name}.`
      );
    }

    teamNames.add(
      team.name
    );

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

    const playerIds =
      new Set<string>();

    for (
      const player of
        team.players
    ) {
      const context =
        `${year}/${team.name}/${player.fullName}`;

      if (
        playerIds.has(
          player.sourcePlayerId
        )
      ) {
        fail(
          `${context}: duplicate sourcePlayerId.`
        );
      }

      playerIds.add(
        player.sourcePlayerId
      );

      const previous =
        sourceIds.get(
          player.sourcePlayerId
        );

      if (
        previous &&
        previous !==
          player.fullName
      ) {
        fail(
          `${context}: sourcePlayerId maps to both ${previous} and ${player.fullName}.`
        );
      }

      sourceIds.set(
        player.sourcePlayerId,
        player.fullName
      );

      validatePlayer(
        player,
        context
      );

      totalPlayers +=
        1;
    }
  }

  if (
    totalPlayers ===
    0
  ) {
    fail(
      `${year}: zero playable players.`
    );
  }

  console.log(
    `[WORLD VALIDATION] ${year}: ${season.teams.length} teams / ${totalPlayers} players`
  );
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

  for (
    const edition of
      WORLD_AVAILABLE_EDITIONS
  ) {
    validateSeason(
      edition.year
    );
  }

  console.log(
    "[WORLD VALIDATION] Successful."
  );
}

main();