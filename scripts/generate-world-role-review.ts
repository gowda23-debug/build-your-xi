import fs from "node:fs";
import path from "node:path";

import { WORLD_AVAILABLE_EDITIONS } from "./data/world/editions";

type WorldRole = "BAT" | "WK" | "AR" | "BOWL";
type RoleSource = { provider: "ICC" | "BOARD"; url: string; retrievedAt: string };
type RoleEntry = { role: WorldRole; source: RoleSource };
type ReviewPlayer = {
  sourcePlayerId: string;
  fullName: string;
  names: string[];
  teams: string[];
  editions: number[];
  sourceUrls: string[];
  status: "verified" | "needs-verification";
  role: WorldRole | null;
};
type ReviewAccumulator = Omit<ReviewPlayer, "status" | "role">;
type RawMatch = {
  info: {
    players?: Record<string, string[]>;
    registry?: { people?: Record<string, string> };
  };
};
type RawEdition = { matches: RawMatch[] };
type EditionJson = {
  year: number;
  teams: Array<{
    name: string;
    players: Array<{
      fullName: string;
      sourcePlayerId: string;
      sources?: string[];
      sourceUrl?: string;
      role?: WorldRole | null;
      roleSource?: RoleSource | null;
    }>;
  }>;
};
type RoleFile = { players?: Record<string, RoleEntry> };

const ROOT = process.cwd();
const RAW = path.join(ROOT, "scripts/data/world/raw");
const STAGING = path.join(ROOT, "scripts/data/world/staging/historical-averages");
const PROCESSED = path.join(ROOT, "scripts/data/world/processed");
const ROLE_FILE = path.join(ROOT, "scripts/data/world/verified-world-roles.json");
const REVIEW_FILE = path.join(ROOT, "scripts/data/world/role-review.json");

function fail(message: string): never {
  throw new Error(`[WORLD ROLE REVIEW] ${message}`);
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}`);
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) fail(`Required file is empty: ${filePath}`);
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    fail(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadVerifiedRoles(): Record<string, RoleEntry> {
  const file = readJson<RoleFile>(ROLE_FILE);
  if (!file.players || typeof file.players !== "object" || Array.isArray(file.players)) {
    fail("verified-world-roles.json must contain a players object.");
  }
  return file.players;
}

function addPlayer(
  map: Map<string, ReviewAccumulator>,
  input: { sourcePlayerId: string; fullName: string; team: string; year: number; sourceUrls?: string[] },
): void {
  const id = input.sourcePlayerId.trim();
  const name = input.fullName.trim();
  const team = input.team.trim();
  if (!id || !name || !team) fail(`${input.year}: player record has a blank identity, name, or team.`);

  const current = map.get(id);
  if (!current) {
    map.set(id, {
      sourcePlayerId: id,
      fullName: name,
      names: [name],
      teams: [team],
      editions: [input.year],
      sourceUrls: [...new Set(input.sourceUrls ?? [])].filter(Boolean),
    });
    return;
  }

  if (!current.names.includes(name)) current.names.push(name);
  if (!current.teams.includes(team)) current.teams.push(team);
  if (!current.editions.includes(input.year)) current.editions.push(input.year);
  for (const url of input.sourceUrls ?? []) {
    if (url && !current.sourceUrls.includes(url)) current.sourceUrls.push(url);
  }
}

function collectCricsheetPlayers(map: Map<string, ReviewAccumulator>, year: number): void {
  const filePath = path.join(RAW, `${year}.json`);
  const edition = readJson<RawEdition>(filePath);
  if (!Array.isArray(edition.matches) || edition.matches.length === 0) {
    fail(`${year}: raw Cricsheet file has no matches.`);
  }

  for (const match of edition.matches) {
    for (const [team, names] of Object.entries(match.info.players ?? {})) {
      for (const name of names) {
        const id = match.info.registry?.people?.[name]?.toLowerCase();
        if (!id || !/^[0-9a-f]{8}$/.test(id)) {
          fail(`${year}: missing valid Cricsheet registry ID for ${name}.`);
        }
        addPlayer(map, { sourcePlayerId: id, fullName: name, team, year, sourceUrls: ["https://cricsheet.org/"] });
      }
    }
  }
}

function collectCricketArchivePlayers(map: Map<string, ReviewAccumulator>, year: number): void {
  const processedPath = path.join(PROCESSED, `${year}.json`);
  const stagingPath = path.join(STAGING, `${year}.json`);
  let filePath = stagingPath;
  let edition: EditionJson;

  if (fs.existsSync(processedPath)) {
    const processed = readJson<EditionJson>(processedPath);
    const processedHasVerifiedRoles = Array.isArray(processed.teams)
      && processed.teams.length > 0
      && processed.teams.every(team => Array.isArray(team.players) && team.players.every(player =>
        player.role != null && player.roleSource != null
          && (player.roleSource.provider === "ICC" || player.roleSource.provider === "BOARD")
          && typeof player.roleSource.url === "string"
          && player.roleSource.url.startsWith("https://")
          && !Number.isNaN(Date.parse(player.roleSource.retrievedAt))));
    if (processedHasVerifiedRoles || !fs.existsSync(stagingPath)) {
      filePath = processedPath;
      edition = processed;
    } else {
      edition = readJson<EditionJson>(stagingPath);
    }
  } else {
    edition = readJson<EditionJson>(stagingPath);
  }

  if (edition.year !== year || !Array.isArray(edition.teams) || edition.teams.length === 0) {
    fail(`${year}: historical averages file has an invalid year or no teams (${filePath}).`);
  }

  for (const team of edition.teams) {
    for (const player of team.players ?? []) {
      if (!player.sourcePlayerId.startsWith("cricketarchive:")) {
        fail(`${year}/${player.fullName}: expected a cricketarchive: identity, got ${player.sourcePlayerId}.`);
      }
      addPlayer(map, {
        sourcePlayerId: player.sourcePlayerId,
        fullName: player.fullName,
        team: team.name,
        year,
        sourceUrls: [...(player.sources ?? []), ...(player.sourceUrl ? [player.sourceUrl] : [])],
      });
    }
  }
}

function main(): void {
  console.log("[WORLD ROLE REVIEW] Building a unified review from all configured World Cup editions.");
  const players = new Map<string, ReviewAccumulator>();
  const verifiedRoles = loadVerifiedRoles();

  for (const edition of WORLD_AVAILABLE_EDITIONS) {
    if (edition.sourceType === "cricsheet") collectCricsheetPlayers(players, edition.year);
    else collectCricketArchivePlayers(players, edition.year);
  }

  const unknownVerifiedIds = Object.keys(verifiedRoles).filter(id => !players.has(id));
  if (unknownVerifiedIds.length) {
    fail(`verified-world-roles.json contains ${unknownVerifiedIds.length} IDs not found in the current player pool; first: ${unknownVerifiedIds.slice(0, 10).join(", ")}`);
  }

  const review: ReviewPlayer[] = [...players.values()]
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.sourcePlayerId.localeCompare(b.sourcePlayerId))
    .map(player => {
      const verified = verifiedRoles[player.sourcePlayerId];
      return {
        ...player,
        names: player.names.sort((a, b) => a.localeCompare(b)),
        teams: player.teams.sort((a, b) => a.localeCompare(b)),
        editions: player.editions.sort((a, b) => a - b),
        sourceUrls: player.sourceUrls.sort((a, b) => a.localeCompare(b)),
        status: verified ? "verified" : "needs-verification",
        role: verified?.role ?? null,
      };
    });

  fs.mkdirSync(path.dirname(REVIEW_FILE), { recursive: true });
  fs.writeFileSync(REVIEW_FILE, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    editions: WORLD_AVAILABLE_EDITIONS.map(edition => edition.year),
    totalPlayers: review.length,
    verifiedPlayers: review.filter(player => player.status === "verified").length,
    unresolvedPlayers: review.filter(player => player.status !== "verified").length,
    players: review,
  }, null, 2)}\n`, "utf8");

  const byProvider = {
    cricketarchive: review.filter(player => player.sourcePlayerId.startsWith("cricketarchive:")).length,
    cricsheet: review.filter(player => /^[0-9a-f]{8}$/i.test(player.sourcePlayerId)).length,
  };
  console.log(`[WORLD ROLE REVIEW] Editions: ${WORLD_AVAILABLE_EDITIONS.map(edition => edition.year).join(", ")}`);
  console.log(`[WORLD ROLE REVIEW] Unique players: ${review.length} (${byProvider.cricketarchive} CricketArchive, ${byProvider.cricsheet} Cricsheet).`);
  console.log(`[WORLD ROLE REVIEW] Verified roles: ${review.length - review.filter(player => player.status !== "verified").length}.`);
  console.log(`[WORLD ROLE REVIEW] Roles needing official verification: ${review.filter(player => player.status !== "verified").length}.`);
  console.log(`[WORLD ROLE REVIEW] Wrote ${REVIEW_FILE}.`);
}

main();
