
import fs from "node:fs";
import path from "node:path";

import { WORLD_HISTORICAL_SOURCES } from "./data/world/historical-sources";

type WorldRole = "BAT" | "WK" | "AR" | "BOWL";
type RoleProvider = "ICC" | "BOARD" | "ESPNCRICINFO";

type RoleSource = {
  provider: string;
  url: string;
  retrievedAt: string;
};

type PlayerStats = {
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

type HistoricalPlayer = {
  fullName: string;
  sourcePlayerId: string;
  role: WorldRole | null;
  roleSource: RoleSource | null;
  stats: PlayerStats;
  sources?: string[];
};

type HistoricalEdition = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50 | 60;
  status: "staging-unverified-roles";
  playable: false;
  unresolvedRoleCount: number;
  unresolvedPlayers: Array<{
    year: number;
    sourcePlayerId: string;
    fullName: string;
    teamCode: string;
    sourceUrl: string;
  }>;
  teams: Array<{
    name: string;
    shortName: string;
    slug: string;
    players: HistoricalPlayer[];
    sources: string[];
  }>;
  sources: string[];
};

const STAGING_DIRECTORY = path.join(
  process.cwd(),
  "scripts",
  "data",
  "world",
  "staging",
  "historical-averages",
);

const INTEGER_STATS = [
  "matches",
  "innings",
  "runs",
  "hundreds",
  "fifties",
  "wickets",
  "catches",
  "stumpings",
] as const;

const DECIMAL_STATS = [
  "batting_average",
  "strike_rate",
  "bowling_average",
  "economy",
] as const;

function fail(message: string): never {
  throw new Error(
    `[WORLD HISTORICAL AVERAGES VALIDATION] ${message}`,
  );
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isWorldRole(value: unknown): value is WorldRole {
  return (
    value === "BAT" ||
    value === "WK" ||
    value === "AR" ||
    value === "BOWL"
  );
}

function isAllowedRoleProvider(
  value: unknown,
): value is RoleProvider {
  return (
    value === "ICC" ||
    value === "BOARD" ||
    value === "ESPNCRICINFO"
  );
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function isCanonicalCricsheetId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}$/i.test(value)
  );
}

function readEdition(year: number): HistoricalEdition {
  const filePath = path.join(
    STAGING_DIRECTORY,
    `${year}.json`,
  );

  if (!fs.existsSync(filePath)) {
    fail(
      `Missing staged averages file: ${filePath}. ` +
      "Run npm.cmd run data:import-world-historical-averages first.",
    );
  }

  const raw = fs.readFileSync(filePath, "utf8");

  if (!raw.trim()) {
    fail(`Staged averages file is empty: ${filePath}`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    fail(
      `Invalid JSON in ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!isObject(parsed)) {
    fail(`Staged averages file must contain a JSON object: ${filePath}`);
  }

  return parsed as unknown as HistoricalEdition;
}

function validateRoleSource(
  year: number,
  player: HistoricalPlayer,
): void {
  if (player.role === null) {
    if (player.roleSource !== null) {
      fail(
        `${year}/${player.fullName}: roleSource must be null ` +
        "when the role is unresolved.",
      );
    }

    return;
  }

  if (!isWorldRole(player.role)) {
    fail(`${year}/${player.fullName}: invalid role.`);
  }

  const source = player.roleSource;

  if (
    !isObject(source) ||
    !isAllowedRoleProvider(source.provider) ||
    !isHttpsUrl(source.url) ||
    typeof source.retrievedAt !== "string"
  ) {
    fail(
      `${year}/${player.fullName}: invalid or unapproved role-source metadata.`,
    );
  }

  const retrievedAt = Date.parse(source.retrievedAt);

  if (
    !Number.isFinite(retrievedAt) ||
    retrievedAt > Date.now() + 86_400_000
  ) {
    fail(
      `${year}/${player.fullName}: invalid or future role retrieval timestamp.`,
    );
  }

  const host = new URL(source.url).hostname.toLowerCase();

  const hostMatchesProvider =
    (
      source.provider === "ICC" &&
      (
        host === "icc-cricket.com" ||
        host.endsWith(".icc-cricket.com")
      )
    ) ||
    (
      source.provider === "ESPNCRICINFO" &&
      (
        host === "espncricinfo.com" ||
        host.endsWith(".espncricinfo.com") ||
        host === "core.espnuk.org"
      )
    ) ||
    (
      source.provider === "BOARD" &&
      host.includes(".")
    );

  if (!hostMatchesProvider) {
    fail(
      `${year}/${player.fullName}: role-source host "${host}" ` +
      `does not match provider "${source.provider}".`,
    );
  }
}

function validateStats(
  year: number,
  player: HistoricalPlayer,
): void {
  if (!isObject(player.stats)) {
    fail(`${year}/${player.fullName}: missing statistics.`);
  }

  const stats = player.stats;

  for (const field of INTEGER_STATS) {
    const value = stats[field];

    if (!Number.isInteger(value) || value < 0) {
      fail(
        `${year}/${player.fullName}: ${field} must be a ` +
        "non-negative integer.",
      );
    }
  }

  for (const field of DECIMAL_STATS) {
    const value = stats[field];

    if (
      value !== null &&
      (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0
      )
    ) {
      fail(
        `${year}/${player.fullName}: invalid ${field}.`,
      );
    }
  }

  if (stats.innings > stats.matches) {
    fail(`${year}/${player.fullName}: innings exceed matches.`);
  }

  if (
    stats.hundreds > stats.innings ||
    stats.fifties > stats.innings ||
    stats.hundreds + stats.fifties > stats.innings
  ) {
    fail(
      `${year}/${player.fullName}: inconsistent innings, fifties or hundreds.`,
    );
  }
}

function validateEdition(year: number): void {
  const source = WORLD_HISTORICAL_SOURCES.find(
    (item) => item.year === year,
  );

  if (!source) {
    fail(`No historical source registry entry for ${year}.`);
  }

  const edition = readEdition(year);

  if (
    edition.year !== source.year ||
    edition.seasonName !== source.seasonName ||
    edition.format !== "ODI" ||
    edition.competition !== "ICC Men's Cricket World Cup" ||
    edition.oversPerInnings !== source.oversPerInnings
  ) {
    fail(
      `${year}: edition metadata does not match the source registry.`,
    );
  }

  // Historical averages are staging data only. They cannot be published
  // through the live Cricsheet import contract.
  if (
    edition.status !== "staging-unverified-roles" ||
    edition.playable !== false
  ) {
    fail(
      `${year}: historical averages must remain staging-only and non-playable.`,
    );
  }

  if (!Array.isArray(edition.teams) || edition.teams.length === 0) {
    fail(`${year}: no teams found.`);
  }

  if (!Array.isArray(edition.sources) || edition.sources.length === 0) {
    fail(`${year}: missing source attribution.`);
  }

  for (const url of edition.sources) {
    if (!isHttpsUrl(url)) {
      fail(`${year}: invalid edition source URL.`);
    }
  }

  const seenIds = new Set<string>();
  const players: HistoricalPlayer[] = [];

  for (const team of edition.teams) {
    if (
      typeof team.name !== "string" ||
      !team.name.trim() ||
      typeof team.shortName !== "string" ||
      !team.shortName.trim() ||
      typeof team.slug !== "string" ||
      !team.slug.trim() ||
      !Array.isArray(team.players) ||
      team.players.length === 0
    ) {
      fail(`${year}: invalid or empty team record.`);
    }

    for (const player of team.players) {
      if (
        !player ||
        typeof player.fullName !== "string" ||
        !player.fullName.trim()
      ) {
        fail(`${year}: a player has an empty name.`);
      }

      // sourcePlayerId in this staging format is the raw Cricsheet
      // Register ID. The production import adds the "cricsheet:" prefix.
      if (!isCanonicalCricsheetId(player.sourcePlayerId)) {
        fail(
          `${year}/${player.fullName}: expected a canonical 8-character ` +
          "Cricsheet Register ID. Provider-specific IDs are prohibited.",
        );
      }

      const canonicalId = player.sourcePlayerId.toLowerCase();

      if (seenIds.has(canonicalId)) {
        fail(
          `${year}: duplicate player ID ${canonicalId} across teams.`,
        );
      }

      seenIds.add(canonicalId);

      validateRoleSource(year, player);
      validateStats(year, player);
      players.push(player);
    }
  }

  if (players.length === 0) {
    fail(`${year}: zero players found.`);
  }

  const unresolved = players.filter(
    (player) => player.role === null,
  );

  if (
    !Number.isInteger(edition.unresolvedRoleCount) ||
    edition.unresolvedRoleCount !== unresolved.length
  ) {
    fail(
      `${year}: unresolvedRoleCount does not match the unresolved roles.`,
    );
  }

  if (
    !Array.isArray(edition.unresolvedPlayers) ||
    edition.unresolvedPlayers.length !== unresolved.length
  ) {
    fail(
      `${year}: unresolvedPlayers does not match the unresolved role count.`,
    );
  }

  const reviewIds = new Set(
    edition.unresolvedPlayers.map(
      (player) => player.sourcePlayerId.toLowerCase(),
    ),
  );

  for (const player of unresolved) {
    if (!reviewIds.has(player.sourcePlayerId.toLowerCase())) {
      fail(
        `${year}: unresolved player ${player.fullName} ` +
        "is missing from the role-review list.",
      );
    }
  }

  const topRuns = Math.max(
    ...players.map((player) => player.stats.runs),
  );

  const topWickets = Math.max(
    ...players.map((player) => player.stats.wickets),
  );

  if (
    source.integrityChecks?.expectedTopRuns !== undefined &&
    topRuns !== source.integrityChecks.expectedTopRuns
  ) {
    fail(
      `${year}: top runs mismatch. Got ${topRuns}; ` +
      `expected ${source.integrityChecks.expectedTopRuns}.`,
    );
  }

  if (
    source.integrityChecks?.expectedTopWickets !== undefined &&
    topWickets !== source.integrityChecks.expectedTopWickets
  ) {
    fail(
      `${year}: top wickets mismatch. Got ${topWickets}; ` +
      `expected ${source.integrityChecks.expectedTopWickets}.`,
    );
  }

  console.log(
    `[WORLD HISTORICAL AVERAGES VALIDATION] ${year}: ` +
    `${edition.teams.length} teams, ${players.length} players, ` +
    `${unresolved.length} unresolved roles. ` +
    "Staging data valid; NOT PLAYABLE.",
  );
}

function main(): void {
  const years = WORLD_HISTORICAL_SOURCES
    .filter((source) => source.year <= 1999)
    .map((source) => source.year);

  if (years.length === 0) {
    fail("No historical averages editions are configured.");
  }

  for (const year of years) {
    validateEdition(year);
  }

  console.log(
    "[WORLD HISTORICAL AVERAGES VALIDATION] All staged historical " +
    "averages passed. Staging data is not publishable or playable.",
  );
}

main();
