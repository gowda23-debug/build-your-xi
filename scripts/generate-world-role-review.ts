import fs from "node:fs";
import path from "node:path";

import {
  WORLD_AVAILABLE_EDITIONS,
} from "./data/world/editions";

type PlayerReview = {
  sourcePlayerId: string;
  fullName: string;
  teams: string[];
  editions: number[];
};

type RawMatch = {
  info: {
    teams: string[];
    players: Record<
      string,
      string[]
    >;
    registry?: {
      people?: Record<
        string,
        string
      >;
    };
    dates?: string[];
  };
};

type RawFile = {
  year?: number;
  matches: RawMatch[];
};

type HistoricalNormalized = {
  year: number;
  matches: Array<{
    players: Array<{
      sourcePlayerId: string;
      fullName: string;
      team: string;
    }>;
  }>;
};

type RoleSourceFile = {
  players: Record<
    string,
    unknown
  >;
};

const ROOT =
  process.cwd();

const RAW_DIRECTORY =
  path.join(
    ROOT,
    "scripts",
    "data",
    "world",
    "raw"
  );

const HISTORICAL_DIRECTORY =
  path.join(
    ROOT,
    "scripts",
    "data",
    "world",
    "historical-normalized"
  );

const ROLE_SOURCE_PATH =
  path.join(
    ROOT,
    "scripts",
    "data",
    "world",
    "role-sources.json"
  );

const REVIEW_PATH =
  path.join(
    ROOT,
    "scripts",
    "data",
    "world",
    "role-review.json"
  );

function fail(
  message: string
): never {
  throw new Error(
    `[WORLD ROLE REVIEW] ${message}`
  );
}

function readJson<T>(
  filePath: string
): T {
  if (
    !fs.existsSync(
      filePath
    )
  ) {
    fail(
      `Missing ${filePath}`
    );
  }

  const raw =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  if (!raw.trim()) {
    fail(
      `Empty ${filePath}`
    );
  }

  try {
    return JSON.parse(
      raw
    ) as T;
  } catch (error) {
    fail(
      `Invalid JSON ${filePath}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}

function loadExistingRoles(): Record<
  string,
  unknown
> {
  if (
    !fs.existsSync(
      ROLE_SOURCE_PATH
    )
  ) {
    return {};
  }

  const file =
    readJson<RoleSourceFile>(
      ROLE_SOURCE_PATH
    );

  return file.players ?? {};
}

function addPlayer(
  players: Map<
    string,
    PlayerReview
  >,
  player: {
    sourcePlayerId: string;
    fullName: string;
    team: string;
    year: number;
  }
): void {
  const existing =
    players.get(
      player.sourcePlayerId
    );

  if (!existing) {
    players.set(
      player.sourcePlayerId,
      {
        sourcePlayerId:
          player.sourcePlayerId,
        fullName:
          player.fullName,
        teams: [
          player.team,
        ],
        editions: [
          player.year,
        ],
      }
    );

    return;
  }

  if (
    existing.fullName !==
    player.fullName
  ) {
    fail(
      `Canonical ID ${player.sourcePlayerId} has conflicting names: "${existing.fullName}" vs "${player.fullName}".`
    );
  }

  if (
    !existing.teams.includes(
      player.team
    )
  ) {
    existing.teams.push(
      player.team
    );
  }

  if (
    !existing.editions.includes(
      player.year
    )
  ) {
    existing.editions.push(
      player.year
    );
  }
}

function collectModernPlayers(
  players: Map<
    string,
    PlayerReview
  >
): void {
  for (
    const edition of
    WORLD_AVAILABLE_EDITIONS
  ) {
    if (
      edition.year < 2003
    ) {
      continue;
    }

    const filePath =
      path.join(
        RAW_DIRECTORY,
        `${edition.year}.json`
      );

    const file =
      readJson<RawFile>(
        filePath
      );

    for (
      const match of
      file.matches
    ) {
      for (
        const [
          team,
          teamPlayers,
        ] of Object.entries(
          match.info.players
        )
      ) {
        for (
          const fullName of
          teamPlayers
        ) {
          const id =
            match.info.registry
              ?.people?.[
              fullName
            ];

          if (
            !id ||
            !/^[0-9a-f]{8}$/i.test(
              id
            )
          ) {
            fail(
              `${edition.year}: missing canonical Cricsheet ID for ${fullName}.`
            );
          }

          addPlayer(
            players,
            {
              sourcePlayerId:
                id.toLowerCase(),
              fullName,
              team,
              year:
                edition.year,
            }
          );
        }
      }
    }
  }
}

function collectHistoricalPlayers(
  players: Map<
    string,
    PlayerReview
  >
): void {
  for (
    const edition of
    WORLD_AVAILABLE_EDITIONS
  ) {
    if (
      edition.year >= 2003
    ) {
      continue;
    }

    const filePath =
      path.join(
        HISTORICAL_DIRECTORY,
        `${edition.year}.json`
      );

    const file =
      readJson<HistoricalNormalized>(
        filePath
      );

    for (
      const match of
      file.matches
    ) {
      for (
        const player of
        match.players
      ) {
        addPlayer(
          players,
          {
            sourcePlayerId:
              player.sourcePlayerId,
            fullName:
              player.fullName,
            team:
              player.team,
            year:
              edition.year,
          }
        );
      }
    }
  }
}

function main(): void {
  console.log(
    "[WORLD ROLE REVIEW] Starting."
  );

  const players =
    new Map<
      string,
      PlayerReview
    >();

  collectModernPlayers(
    players
  );

  collectHistoricalPlayers(
    players
  );

  const existingRoles =
    loadExistingRoles();

  const review =
    [...players.values()]
      .sort(
        (a, b) =>
          a.fullName.localeCompare(
            b.fullName
          )
      )
      .map(
        (player) => ({
          ...player,
          status:
            existingRoles[
              player.sourcePlayerId
            ]
              ? "verified"
              : "needs-verification",
          role:
            existingRoles[
              player.sourcePlayerId
            ] ?? null,
        })
      );

  fs.writeFileSync(
    REVIEW_PATH,
    `${JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),
        totalPlayers:
          review.length,
        verifiedPlayers:
          review.filter(
            (player) =>
              player.status ===
              "verified"
          ).length,
        unresolvedPlayers:
          review.filter(
            (player) =>
              player.status ===
              "needs-verification"
          ).length,
        players:
          review,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `[WORLD ROLE REVIEW] Total players: ${review.length}`
  );

  console.log(
    `[WORLD ROLE REVIEW] Verified: ${
      review.filter(
        (player) =>
          player.status ===
          "verified"
      ).length
    }`
  );

  console.log(
    `[WORLD ROLE REVIEW] Unresolved: ${
      review.filter(
        (player) =>
          player.status ===
          "needs-verification"
      ).length
    }`
  );

  console.log(
    `[WORLD ROLE REVIEW] Output: ${REVIEW_PATH}`
  );
}

main();