import fs from "node:fs";
import path from "node:path";

import {
  WORLD_HISTORICAL_SOURCES,
} from "./data/world/historical-sources";

type Player = {
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
};

type Season = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50 | 60;
  teams: Array<{
    name: string;
    shortName: string;
    slug: string;
    players: Player[];
    sources: string[];
  }>;
  sources: string[];
};

const OUTPUT_ROOT = path.join(
  process.cwd(),
  "scripts",
  "data",
  "world",
  "processed-historical"
);

function fail(message: string): never {
  throw new Error(`[WORLD HISTORICAL VALIDATION] ${message}`);
}

function readSeason(year: number): Season {
  const filePath = path.join(
    OUTPUT_ROOT,
    `${year}.json`
  );

  if (!fs.existsSync(filePath)) {
    fail(`Missing processed historical edition: ${filePath}`);
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  ) as Season;
}

function validateSeason(year: number): void {
  const source = WORLD_HISTORICAL_SOURCES.find(
    (entry) => entry.year === year
  );

  if (!source) {
    fail(`No source registry entry for ${year}.`);
  }

  const season = readSeason(year);

  if (season.year !== year) {
    fail(`${year}: year mismatch.`);
  }

  if (season.seasonName !== source.seasonName) {
    fail(`${year}: season name mismatch.`);
  }

  if (season.format !== "ODI") {
    fail(`${year}: invalid format.`);
  }

  if (
    season.competition !==
    "ICC Men's Cricket World Cup"
  ) {
    fail(`${year}: invalid competition.`);
  }

  if (season.oversPerInnings !== source.oversPerInnings) {
    fail(`${year}: overs per innings mismatch.`);
  }

  if (!Array.isArray(season.teams) || season.teams.length === 0) {
    fail(`${year}: no teams.`);
  }

  const players = new Map<string, Player>();

  for (const team of season.teams) {
    if (!team.name || !team.slug) {
      fail(`${year}: invalid team metadata.`);
    }

    if (!Array.isArray(team.players) || team.players.length === 0) {
      fail(`${year}/${team.name}: no players.`);
    }

    for (const player of team.players) {
      if (!player.sourcePlayerId) {
        fail(`${year}/${team.name}: missing player ID.`);
      }

      if (
        player.role !== "BAT" &&
        player.role !== "WK" &&
        player.role !== "AR" &&
        player.role !== "BOWL"
      ) {
        fail(
          `${year}/${team.name}/${player.fullName}: invalid role.`
        );
      }

      if (!player.roleSource?.url) {
        fail(
          `${year}/${team.name}/${player.fullName}: missing role source.`
        );
      }

      if (players.has(player.sourcePlayerId)) {
        fail(
          `${year}: duplicate source player ID ${player.sourcePlayerId} across teams.`
        );
      }

      players.set(player.sourcePlayerId, player);

      const stats = player.stats;

      for (const key of [
        "matches",
        "innings",
        "runs",
        "hundreds",
        "fifties",
        "wickets",
        "catches",
        "stumpings",
      ] as const) {
        if (!Number.isInteger(stats[key]) || stats[key] < 0) {
          fail(
            `${year}/${player.fullName}: ${key} must be a non-negative integer.`
          );
        }
      }

      if (stats.innings > stats.matches) {
        fail(`${year}/${player.fullName}: innings > matches.`);
      }

      if (stats.hundreds > stats.innings) {
        fail(`${year}/${player.fullName}: hundreds > innings.`);
      }

      if (stats.fifties > stats.innings) {
        fail(`${year}/${player.fullName}: fifties > innings.`);
      }
    }
  }

  const topRuns = Math.max(
    ...[...players.values()].map((player) => player.stats.runs)
  );
  const topWickets = Math.max(
    ...[...players.values()].map((player) => player.stats.wickets)
  );

  if (
    source.integrityChecks?.expectedTopRuns !== undefined &&
    topRuns !== source.integrityChecks.expectedTopRuns
  ) {
    fail(
      `${year}: top runs mismatch. Got ${topRuns}, expected ${source.integrityChecks.expectedTopRuns}.`
    );
  }

  if (
    source.integrityChecks?.expectedTopWickets !== undefined &&
    topWickets !== source.integrityChecks.expectedTopWickets
  ) {
    fail(
      `${year}: top wickets mismatch. Got ${topWickets}, expected ${source.integrityChecks.expectedTopWickets}.`
    );
  }

  console.log(
    `[WORLD HISTORICAL VALIDATION] ${year}: ${season.teams.length} teams, ${players.size} player records, top runs ${topRuns}, top wickets ${topWickets}`
  );
}

function main(): void {
  for (const source of WORLD_HISTORICAL_SOURCES) {
    validateSeason(source.year);
  }

  console.log(
    "[WORLD HISTORICAL VALIDATION] All historical editions passed."
  );
}

main();
