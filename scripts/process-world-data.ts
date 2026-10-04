import fs from "node:fs";
import path from "node:path";

import {
  WORLD_EDITIONS,
  WORLD_EDITION_YEARS,
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
  sources: string[];
};

type WorldTeam = {
  name: string;
  shortName: string;
  slug: string;
  players: WorldPlayer[];
  sources: string[];
};

type WorldSeason = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50 | 60;
  teams: WorldTeam[];
  sources: string[];
};

const ROOT = process.cwd();

const SOURCE_FILE = path.join(
  ROOT,
  "scripts",
  "data",
  "world",
  "source.json",
);

const PROCESSED_DIRECTORY = path.join(
  ROOT,
  "scripts",
  "data",
  "world",
  "processed",
);

function fail(message: string): never {
  throw new Error(
    `[WORLD PROCESSING] ${message}`,
  );
}

function ensureDirectory(
  directory: string,
) {
  if (fs.existsSync(directory)) {
    if (
      !fs.statSync(directory).isDirectory()
    ) {
      fail(
        `"${directory}" exists but is not a directory.`,
      );
    }

    return;
  }

  fs.mkdirSync(directory, {
    recursive: true,
  });
}

function readSource(): unknown {
  if (!fs.existsSync(SOURCE_FILE)) {
    fail(
      `Missing World source file:

${SOURCE_FILE}

Create the source file from the authoritative World Cup dataset before running processing.`,
    );
  }

  const raw = fs.readFileSync(
    SOURCE_FILE,
    "utf8",
  );

  if (!raw.trim()) {
    fail(
      `World source file is empty:

${SOURCE_FILE}`,
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(
      `World source file contains invalid JSON: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }
}

function requireString(
  value: unknown,
  field: string,
  context: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    fail(
      `${context}: ${field} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function requireInteger(
  value: unknown,
  field: string,
  context: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    fail(
      `${context}: ${field} must be a non-negative integer.`,
    );
  }

  return value;
}

function requireNumberOrNull(
  value: unknown,
  field: string,
  context: string,
): number | null {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    fail(
      `${context}: ${field} must be a non-negative number or null.`,
    );
  }

  return value;
}

function requireSources(
  value: unknown,
  context: string,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    fail(
      `${context}: at least one source URL is required.`,
    );
  }

  return value.map(
    (source, index) => {
      const url =
        requireString(
          source,
          `sources[${index}]`,
          context,
        );

      if (
        !url.startsWith(
          "https://",
        ) &&
        !url.startsWith(
          "http://",
        )
      ) {
        fail(
          `${context}: invalid source URL "${url}".`,
        );
      }

      return url;
    },
  );
}

function parseStats(
  value: unknown,
  context: string,
): WorldStats {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    fail(
      `${context}: stats must be an object.`,
    );
  }

  const stats =
    value as Record<
      string,
      unknown
    >;

  const result: WorldStats = {
    matches: requireInteger(
      stats.matches,
      "matches",
      context,
    ),

    innings: requireInteger(
      stats.innings,
      "innings",
      context,
    ),

    runs: requireInteger(
      stats.runs,
      "runs",
      context,
    ),

    batting_average:
      requireNumberOrNull(
        stats.batting_average,
        "batting_average",
        context,
      ),

    strike_rate:
      requireNumberOrNull(
        stats.strike_rate,
        "strike_rate",
        context,
      ),

    hundreds: requireInteger(
      stats.hundreds,
      "hundreds",
      context,
    ),

    fifties: requireInteger(
      stats.fifties,
      "fifties",
      context,
    ),

    wickets: requireInteger(
      stats.wickets,
      "wickets",
      context,
    ),

    bowling_average:
      requireNumberOrNull(
        stats.bowling_average,
        "bowling_average",
        context,
      ),

    economy:
      requireNumberOrNull(
        stats.economy,
        "economy",
        context,
      ),

    catches: requireInteger(
      stats.catches,
      "catches",
      context,
    ),

    stumpings: requireInteger(
      stats.stumpings,
      "stumpings",
      context,
    ),
  };

  if (
    result.innings >
    result.matches
  ) {
    fail(
      `${context}: innings cannot exceed matches.`,
    );
  }

  if (
    result.hundreds >
    result.innings
  ) {
    fail(
      `${context}: hundreds cannot exceed innings.`,
    );
  }

  if (
    result.fifties >
    result.innings
  ) {
    fail(
      `${context}: fifties cannot exceed innings.`,
    );
  }

  return result;
}

function parsePlayer(
  value: unknown,
  context: string,
): WorldPlayer {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    fail(
      `${context}: player must be an object.`,
    );
  }

  const player =
    value as Record<
      string,
      unknown
    >;

  const role =
    requireString(
      player.role,
      "role",
      context,
    );

  if (
    ![
      "BAT",
      "WK",
      "AR",
      "BOWL",
    ].includes(role)
  ) {
    fail(
      `${context}: invalid role "${role}".`,
    );
  }

  return {
    fullName:
      requireString(
        player.fullName,
        "fullName",
        context,
      ),

    sourcePlayerId:
      requireString(
        player.sourcePlayerId,
        "sourcePlayerId",
        context,
      ),

    role: role as WorldRole,

    stats: parseStats(
      player.stats,
      context,
    ),

    sources:
      requireSources(
        player.sources,
        context,
      ),
  };
}

function parseTeam(
  value: unknown,
  context: string,
): WorldTeam {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    fail(
      `${context}: team must be an object.`,
    );
  }

  const team =
    value as Record<
      string,
      unknown
    >;

  if (
    !Array.isArray(
      team.players,
    )
  ) {
    fail(
      `${context}: players must be an array.`,
    );
  }

  if (
    team.players.length === 0
  ) {
    fail(
      `${context}: players cannot be empty.`,
    );
  }

  const players =
    team.players.map(
      (
        player,
        index,
      ) =>
        parsePlayer(
          player,
          `${context}/player-${index}`,
        ),
    );

  const playerIds =
    new Set<string>();

  for (const player of players) {
    if (
      playerIds.has(
        player.sourcePlayerId,
      )
    ) {
      fail(
        `${context}: duplicate sourcePlayerId "${player.sourcePlayerId}".`,
      );
    }

    playerIds.add(
      player.sourcePlayerId,
    );
  }

  return {
    name:
      requireString(
        team.name,
        "name",
        context,
      ),

    shortName:
      requireString(
        team.shortName,
        "shortName",
        context,
      ),

    slug:
      requireString(
        team.slug,
        "slug",
        context,
      ),

    players,

    sources:
      requireSources(
        team.sources,
        context,
      ),
  };
}

function parseSeason(
  value: unknown,
  expectedYear: number,
): WorldSeason {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    fail(
      `${expectedYear}: season must be an object.`,
    );
  }

  const season =
    value as Record<
      string,
      unknown
    >;

  const year =
    requireInteger(
      season.year,
      "year",
      String(expectedYear),
    );

  if (
    year !== expectedYear
  ) {
    fail(
      `Expected ${expectedYear}, received ${year}.`,
    );
  }

  const edition =
    WORLD_EDITIONS.find(
      (item) =>
        item.year === year,
    );

  if (!edition) {
    fail(
      `${year}: unsupported World Cup edition.`,
    );
  }

  const seasonName =
    requireString(
      season.seasonName,
      "seasonName",
      String(year),
    );

  if (
    seasonName !==
    edition.seasonName
  ) {
    fail(
      `${year}: seasonName must be "${edition.seasonName}".`,
    );
  }

  if (
    season.format !== "ODI"
  ) {
    fail(
      `${year}: format must be ODI.`,
    );
  }

  if (
    season.competition !==
    "ICC Men's Cricket World Cup"
  ) {
    fail(
      `${year}: invalid competition.`,
    );
  }

  const overs =
    requireInteger(
      season.oversPerInnings,
      "oversPerInnings",
      String(year),
    );

  if (
    overs !==
    edition.oversPerInnings
  ) {
    fail(
      `${year}: oversPerInnings must be ${edition.oversPerInnings}.`,
    );
  }

  if (
    !Array.isArray(
      season.teams,
    ) ||
    season.teams.length === 0
  ) {
    fail(
      `${year}: teams cannot be empty.`,
    );
  }

  const teamNames =
    new Set<string>();

  const teams =
    season.teams.map(
      (
        team,
        index,
      ) => {
        const parsed =
          parseTeam(
            team,
            `${year}/team-${index}`,
          );

        const key =
          parsed.name
            .toLowerCase();

        if (
          teamNames.has(key)
        ) {
          fail(
            `${year}: duplicate team "${parsed.name}".`,
          );
        }

        teamNames.add(key);

        return parsed;
      },
    );

  return {
    year,

    seasonName,

    format: "ODI",

    competition:
      "ICC Men's Cricket World Cup",

    oversPerInnings:
      edition.oversPerInnings,

    teams,

    sources:
      requireSources(
        season.sources,
        String(year),
      ),
  };
}

function main() {
  console.log(
    "[WORLD PROCESSING] Starting World Cup processing.",
  );

  console.log(
    `[WORLD PROCESSING] Expected editions: ${WORLD_EDITION_YEARS.join(
      ", ",
    )}`,
  );

  ensureDirectory(
    PROCESSED_DIRECTORY,
  );

  const source =
    readSource();

  if (
    typeof source !== "object" ||
    source === null ||
    Array.isArray(source)
  ) {
    fail(
      "source.json must contain an object.",
    );
  }

  const sourceObject =
    source as Record<
      string,
      unknown
    >;

  if (
    !Array.isArray(
      sourceObject.editions,
    )
  ) {
    fail(
      "source.json must contain an editions array.",
    );
  }

  const sourceYears =
    new Set<number>();

  for (
    const edition of
      sourceObject.editions
  ) {
    if (
      typeof edition ===
      "object" &&
      edition !== null &&
      !Array.isArray(
        edition,
      )
    ) {
      const year =
        (edition as Record<
          string,
          unknown
        >).year;

      if (
        typeof year ===
        "number"
      ) {
        sourceYears.add(
          year,
        );
      }
    }
  }

  for (
    const year of
      WORLD_EDITION_YEARS
  ) {
    if (
      !sourceYears.has(
        year,
      )
    ) {
      fail(
        `source.json is missing World Cup edition ${year}.`,
      );
    }
  }

  const processedYears =
    new Set<number>();

  for (
    const edition of
      sourceObject.editions
  ) {
    if (
      typeof edition !==
        "object" ||
      edition === null ||
      Array.isArray(
        edition,
      )
    ) {
      fail(
        "Invalid edition entry in source.json.",
      );
    }

    const year =
      (edition as Record<
        string,
        unknown
      >).year;

    if (
      typeof year !==
      "number"
    ) {
      fail(
        "Every edition must have a numeric year.",
      );
    }

    const season =
      parseSeason(
        edition,
        year,
      );

    processedYears.add(
      year,
    );

    const outputPath =
      path.join(
        PROCESSED_DIRECTORY,
        `${year}.json`,
      );

    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(
        season,
        null,
        2,
      )}\n`,
      "utf8",
    );

    const playerCount =
      season.teams.reduce(
        (
          total,
          team,
        ) =>
          total +
          team.players.length,
        0,
      );

    console.log(
      `[WORLD PROCESSING] ${year}: ${season.teams.length} teams / ${playerCount} players`,
    );
  }

  if (
    processedYears.size !==
    WORLD_EDITION_YEARS.length
  ) {
    fail(
      `Expected ${WORLD_EDITION_YEARS.length} processed editions, found ${processedYears.size}.`,
    );
  }

  console.log("");
  console.log(
    "[WORLD PROCESSING] Processing successful.",
  );
}

main();