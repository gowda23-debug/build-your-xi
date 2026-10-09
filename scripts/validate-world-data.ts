import fs from "node:fs";
import path from "node:path";

import {
  WORLD_AVAILABLE_EDITIONS,
} from "./data/world/editions";

const ROOT =
  process.cwd();

const DIRECTORY =
  path.join(
    ROOT,
    "scripts",
    "data",
    "world",
    "processed"
  );

const VALID_ROLES =
  new Set([
    "BAT",
    "WK",
    "AR",
    "BOWL",
  ]);

function fail(
  message: string
): never {
  throw new Error(
    `[WORLD VALIDATION] ${message}`
  );
}

function readJson(
  filePath: string
): any {
  if (
    !fs.existsSync(
      filePath
    )
  ) {
    fail(
      `Missing ${filePath}`
    );
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        filePath,
        "utf8"
      )
    );
  } catch (error) {
    fail(
      `Invalid JSON ${filePath}: ${error}`
    );
  }
}

function validateNumber(
  value: unknown,
  name: string
): void {
  if (
    !Number.isFinite(
      value
    ) ||
    Number(value) < 0
  ) {
    fail(
      `${name} must be a non-negative number.`
    );
  }
}

for (
  const edition of
  WORLD_AVAILABLE_EDITIONS
) {
  const season =
    readJson(
      path.join(
        DIRECTORY,
        `${edition.year}.json`
      )
    );

  if (
    season.year !==
    edition.year
  ) {
    fail(
      `${edition.year}: year mismatch.`
    );
  }

  if (
    season.seasonName !==
    edition.seasonName
  ) {
    fail(
      `${edition.year}: season name mismatch.`
    );
  }

  if (
    season.format !==
    "ODI"
  ) {
    fail(
      `${edition.year}: invalid format.`
    );
  }

  if (
    season.competition !==
    "ICC Men's Cricket World Cup"
  ) {
    fail(
      `${edition.year}: invalid competition.`
    );
  }

  if (
    season.oversPerInnings !==
    edition.oversPerInnings
  ) {
    fail(
      `${edition.year}: overs mismatch.`
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
      `${edition.year}: no teams.`
    );
  }

  const playerIds =
    new Set<string>();

  let playerCount = 0;

  for (
    const team of
    season.teams
  ) {
    if (
      !team.name ||
      !team.slug
    ) {
      fail(
        `${edition.year}: invalid team metadata.`
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
        `${edition.year}/${team.name}: no players.`
      );
    }

    for (
      const player of
      team.players
    ) {
      playerCount++;


      const validSourcePlayerId =
        typeof player.sourcePlayerId === "string" &&
        (edition.sourceType === "cricsheet"
          ? /^cricsheet:[0-9a-f]{8}$/i.test(player.sourcePlayerId)
          : /^cricketarchive:\/players?\//i.test(player.sourcePlayerId));

      if (!validSourcePlayerId) {
        fail(
          `${edition.year}/${team.name}/${player.fullName}: invalid canonical player ID for source type ${edition.sourceType}.`
        );
      }


      if (
        playerIds.has(
          player.sourcePlayerId
        )
      ) {
        fail(
          `${edition.year}: duplicate player ${player.sourcePlayerId}.`
        );
      }

      playerIds.add(
        player.sourcePlayerId
      );

      if (
        !VALID_ROLES.has(
          player.role
        )
      ) {
        fail(
          `${edition.year}/${player.fullName}: invalid role.`
        );
      }

      if (
        !player.roleSource ||
        ![
          "ICC",
          "BOARD",
        ].includes(
          player.roleSource.provider
        )
      ) {
        fail(
          `${edition.year}/${player.fullName}: role is not backed by ICC/BOARD.`
        );
      }

      if (
        typeof player.roleSource.url !==
        "string" ||
        !player.roleSource.url.startsWith(
          "https://"
        )
      ) {
        fail(
          `${edition.year}/${player.fullName}: invalid role source URL.`
        );
      }

      const stats =
        player.stats;

      for (
        const field of [
          "matches",
          "innings",
          "runs",
          "hundreds",
          "fifties",
          "wickets",
          "catches",
          "stumpings",
        ]
      ) {
        if (
          !Number.isInteger(
            stats?.[field]
          ) ||
          stats[field] < 0
        ) {
          fail(
            `${edition.year}/${player.fullName}: invalid ${field}.`
          );
        }
      }

      for (
        const field of [
          "batting_average",
          "strike_rate",
          "bowling_average",
          "economy",
        ]
      ) {
        if (
          stats[field] !==
          null &&
          !Number.isFinite(
            stats[field]
          )
        ) {
          fail(
            `${edition.year}/${player.fullName}: invalid ${field}.`
          );
        }
      }

      if (
        stats.innings >
        stats.matches
      ) {
        fail(
          `${edition.year}/${player.fullName}: innings > matches.`
        );
      }

      if (
        stats.hundreds >
        stats.innings
      ) {
        fail(
          `${edition.year}/${player.fullName}: hundreds > innings.`
        );
      }

      if (
        stats.fifties >
        stats.innings
      ) {
        fail(
          `${edition.year}/${player.fullName}: fifties > innings.`
        );
      }

      validateNumber(
        stats.runs,
        `${edition.year}/${player.fullName}/runs`
      );
    }
  }

  if (
    playerCount === 0
  ) {
    fail(
      `${edition.year}: zero players.`
    );
  }

  console.log(
    `[WORLD VALIDATION] ${edition.year}: ${season.teams.length} teams / ${playerCount} players`
  );
}

console.log(
  "[WORLD VALIDATION] Successful."
);