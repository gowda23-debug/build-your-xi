import fs from "node:fs";
import path from "node:path";
import { WORLD_CRICSHEET_EDITIONS } from "./data/world/editions";

type JsonObject = Record<string, unknown>;
type RawDelivery = {
  batter?: string;
  bowler?: string;
  non_striker?: string;
  wickets?: Array<{
    player_out?: string;
    fielders?: Array<{ name?: string; substitute?: boolean }>;
  }>;
};
type RawMatch = {
  info?: {
    dates?: string[];
    teams?: string[];
    players?: Record<string, string[]>;
    registry?: { people?: Record<string, string> };
    event?: { name?: string; match_number?: number };
  };
  innings?: Array<{
    team?: string;
    overs?: Array<{ deliveries?: RawDelivery[] }>;
  }>;
};
type RawEdition = { year?: number; matches?: RawMatch[] };
type PlayerAccumulator = {
  sourcePlayerId: string;
  names: Set<string>;
  teams: Set<string>;
  editions: Set<number>;
  sourceUrls: Set<string>;
};
type CoverageEntry = { year: number; expectedMatchCount: number; actualMatchCount: number; coverage: "complete" | "incomplete" };

const ROOT = process.cwd();
const WORLD_DIR = path.join(ROOT, "scripts", "data", "world");
const RAW_DIR = path.join(WORLD_DIR, "raw");
const REVIEW_PATH = path.join(WORLD_DIR, "role-review.json");
const CRICSHEET_SOURCE_URL = "https://cricsheet.org/downloads/";
const CRICSHEET_REGISTER_URL = "https://cricsheet.org/register/";

function fail(message: string): never {
  throw new Error(`[WORLD ROLE REVIEW] ${message}`);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(filePath: string): unknown {
  if (!fs.existsSync(filePath)) fail(`Missing file: ${filePath}`);
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) fail(`File is empty: ${filePath}`);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    fail(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function main(): void {
  const players = new Map<string, PlayerAccumulator>();
  const coverage: CoverageEntry[] = [];

  function addPlayer(match: RawMatch, name: unknown, team: string, year: number, location: string): void {
    if (typeof name !== "string" || !name.trim()) fail(`${year}: ${location} has a blank player name.`);
    const id = match.info?.registry?.people?.[name]?.toLowerCase();
    if (!id || !/^[0-9a-f]{8}$/.test(id)) {
      fail(`${year}: ${location} has no valid Cricsheet Register ID for "${name}".`);
    }
    const existing = players.get(id) ?? {
      sourcePlayerId: id,
      names: new Set<string>(),
      teams: new Set<string>(),
      editions: new Set<number>(),
      sourceUrls: new Set<string>(),
    };
    existing.names.add(normalizeName(name));
    if (team.trim()) existing.teams.add(team.trim());
    existing.editions.add(year);
    existing.sourceUrls.add(CRICSHEET_REGISTER_URL);
    players.set(id, existing);
  }

  for (const edition of WORLD_CRICSHEET_EDITIONS) {
    const rawPath = path.join(RAW_DIR, `${edition.year}.json`);
    const rawValue = readJson(rawPath);
    if (!isObject(rawValue) || rawValue.year !== edition.year || !Array.isArray(rawValue.matches)) {
      fail(`${edition.year}: raw wrapper must have the correct year and a matches array.`);
    }
    const matches = rawValue.matches as RawMatch[];
    coverage.push({
      year: edition.year,
      expectedMatchCount: edition.expectedMatchCount,
      actualMatchCount: matches.length,
      coverage: matches.length === edition.expectedMatchCount ? "complete" : "incomplete",
    });

    const seenMatchKeys = new Set<string>();
    for (const [matchIndex, match] of matches.entries()) {
      const info = match.info;
      if (!info || !Array.isArray(info.dates) || typeof info.dates[0] !== "string" || Number(info.dates[0].slice(0, 4)) !== edition.year) {
        fail(`${edition.year}: match ${matchIndex + 1} has an invalid date.`);
      }
      if (!Array.isArray(info.teams) || info.teams.length !== 2 || !info.teams.every((team) => typeof team === "string" && team.trim())) {
        fail(`${edition.year}: match ${matchIndex + 1} must identify exactly two teams.`);
      }
      if (!info.event?.name || !info.event.name.toLowerCase().includes("world cup")) {
        fail(`${edition.year}: match ${matchIndex + 1} is not identified as a World Cup event.`);
      }
      if (!info.players || !info.registry?.people || !Array.isArray(match.innings) || match.innings.length === 0) {
        fail(`${edition.year}: match ${matchIndex + 1} is missing line-ups, register IDs, or innings.`);
      }

      const matchKey = `${info.dates[0]}|${String(info.event?.match_number ?? "")}|${[...info.teams].sort().join("|")}`;
      if (seenMatchKeys.has(matchKey)) fail(`${edition.year}: duplicate match key ${matchKey}.`);
      seenMatchKeys.add(matchKey);

      for (const [team, names] of Object.entries(info.players)) {
        if (!info.teams.includes(team) || !Array.isArray(names) || names.length === 0) {
          fail(`${edition.year}: match ${matchIndex + 1} has an invalid lineup for ${team}.`);
        }
        for (const name of names) addPlayer(match, name, team, edition.year, `match ${matchIndex + 1} lineup`);
      }

      for (const [inningsIndex, innings] of match.innings.entries()) {
        if (!innings.team || !info.teams.includes(innings.team)) {
          fail(`${edition.year}: match ${matchIndex + 1}, innings ${inningsIndex + 1} has an invalid batting team.`);
        }
        const fieldingTeam = info.teams.find((team) => team !== innings.team);
        if (!fieldingTeam) fail(`${edition.year}: cannot resolve the fielding team for match ${matchIndex + 1}.`);
        for (const [overIndex, over] of (innings.overs ?? []).entries()) {
          for (const [deliveryIndex, delivery] of (over.deliveries ?? []).entries()) {
            const where = `match ${matchIndex + 1}, innings ${inningsIndex + 1}, over ${overIndex + 1}, delivery ${deliveryIndex + 1}`;
            addPlayer(match, delivery.batter, innings.team, edition.year, where);
            addPlayer(match, delivery.non_striker, innings.team, edition.year, where);
            addPlayer(match, delivery.bowler, fieldingTeam, edition.year, where);
            for (const wicket of delivery.wickets ?? []) {
              addPlayer(match, wicket.player_out, innings.team, edition.year, `${where} wicket`);
              for (const fielder of wicket.fielders ?? []) {
                addPlayer(match, fielder.name, fieldingTeam, edition.year, `${where} fielder`);
              }
            }
          }
        }
      }
    }
  }

  const reviewPlayers = [...players.values()]
    .sort((a, b) => {
      const aName = [...a.names].sort((x, y) => x.localeCompare(y))[0] ?? "";
      const bName = [...b.names].sort((x, y) => x.localeCompare(y))[0] ?? "";
      return aName.localeCompare(bName) || a.sourcePlayerId.localeCompare(b.sourcePlayerId);
    })
    .map((player) => ({
      sourcePlayerId: player.sourcePlayerId,
      fullName: [...player.names].sort((a, b) => a.localeCompare(b))[0] ?? "",
      names: [...player.names].sort((a, b) => a.localeCompare(b)),
      teams: [...player.teams].sort((a, b) => a.localeCompare(b)),
      editions: [...player.editions].sort((a, b) => a - b),
      sourceUrls: [...player.sourceUrls].sort((a, b) => a.localeCompare(b)),
    }));

  const payload = {
    version: 4,
    generatedAt: new Date().toISOString(),
    scope: "Cricsheet men's ODI Cricket World Cup editions configured in scripts/data/world/editions.ts",
    sourcePolicy: {
      primary: ["ICC player profile or tournament media guide", "Official national cricket board profile or squad release"],
      fallback: ["ESPNcricinfo player profile with an explicit playing-role field"],
      prohibited: ["CricketArchive role/identity import", "role inference from statistics", "name-only identity merges"],
    },
    coverage,
    totalPlayers: reviewPlayers.length,
    players: reviewPlayers,
  };

  fs.mkdirSync(WORLD_DIR, { recursive: true });
  const tempPath = `${REVIEW_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, REVIEW_PATH);

  console.log(`[WORLD ROLE REVIEW] Cricsheet player identities discovered: ${reviewPlayers.length}.`);
  for (const item of coverage) {
    console.log(`[WORLD ROLE REVIEW] ${item.year}: ${item.actualMatchCount}/${item.expectedMatchCount} matches (${item.coverage}). Incomplete editions remain blocked from import.`);
  }
  console.log(`[WORLD ROLE REVIEW] Wrote ${REVIEW_PATH}. Historical ESPN/CricketArchive records are intentionally excluded from this review inventory.`);
}

try {
  main();
} catch (error: unknown) {
  console.error(`[WORLD ROLE REVIEW] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
