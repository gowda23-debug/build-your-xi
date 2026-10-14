import fs from "node:fs";
import path from "node:path";
import { WORLD_CRICSHEET_EDITIONS, type WorldEdition } from "./data/world/editions";

type Role = "BAT" | "WK" | "AR" | "BOWL";
type RoleProvider = "ICC" | "BOARD" | "ESPNCRICINFO";
type PlayerStats = {
  matches: number;
  innings: number;
  runs: number;
  hundreds: number;
  fifties: number;
  wickets: number;
  catches: number;
  stumpings: number;
  batting_average: number | null;
  strike_rate: number | null;
  bowling_average: number | null;
  economy: number | null;
};
type RoleSource = { provider: RoleProvider; url: string; retrievedAt: string };
type Player = {
  fullName: string;
  sourcePlayerId: string;
  role: Role;
  roleSource: RoleSource;
  stats: PlayerStats;
  sources: string[];
};
type Team = { name: string; shortName: string; slug: string; players: Player[]; sources: string[] };
type SeasonFile = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50;
  sourceProvider: "Cricsheet";
  sourceUrl: string;
  license: "ODC-By-1.0";
  expectedMatchCount: number;
  sourceMatchCount: number;
  coverageStatus: "complete";
  teams: Team[];
  sources: string[];
};
type RawMatch = {
  info?: {
    dates?: string[];
    teams?: string[];
    players?: Record<string, string[]>;
    registry?: { people?: Record<string, string> };
    event?: { match_number?: number };
  };
  innings?: Array<{
    team: string;
    overs?: Array<{ deliveries?: Array<{ wickets?: Array<{ player_out: string; fielders?: Array<{ name: string }> }> }> }>;
  }>;
};
type RawEdition = { year?: number; matches?: RawMatch[] };

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "scripts", "data", "world", "raw");
const PROCESSED_DIR = path.join(ROOT, "scripts", "data", "world", "processed");
const ROLE_FILE = path.join(ROOT, "scripts", "data", "world", "role-sources.json");
const VALID_ROLES = new Set<Role>(["BAT", "WK", "AR", "BOWL"]);
const INTEGER_STATS = ["matches", "innings", "runs", "hundreds", "fifties", "wickets", "catches", "stumpings"] as const;
const DECIMAL_STATS = ["batting_average", "strike_rate", "bowling_average", "economy"] as const;

function fail(message: string): never {
  throw new Error(`[WORLD VALIDATION] ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roleSourceUrlAllowed(provider: RoleProvider, value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (provider === "ICC") return host === "icc-cricket.com" || host.endsWith(".icc-cricket.com");
  if (provider === "ESPNCRICINFO") return host === "espncricinfo.com" || host.endsWith(".espncricinfo.com") || host === "core.espnuk.org";
  return host.length > 0;
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) fail(`Missing file: ${filePath}`);
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) fail(`File is empty: ${filePath}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    fail(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(parsed)) fail(`Expected a JSON object in ${filePath}`);
  return parsed as T;
}

function loadRoles(): Map<string, { role: Role; source: RoleSource }> {
  if (!fs.existsSync(ROLE_FILE)) return new Map();
  const value = readJson<{ players?: Record<string, { role: Role; source: RoleSource }> }>(ROLE_FILE);
  if (!value.players || typeof value.players !== "object" || Array.isArray(value.players)) {
    fail(`${ROLE_FILE} must contain a players object.`);
  }
  const roles = new Map<string, { role: Role; source: RoleSource }>();
  for (const [rawId, entry] of Object.entries(value.players)) {
    const id = rawId.toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(id)) fail(`Invalid Cricsheet Register ID in role-sources.json: ${rawId}.`);
    if (!entry || !VALID_ROLES.has(entry.role)) fail(`Invalid role entry for ${id}.`);
    if (!entry.source || !["ICC", "BOARD", "ESPNCRICINFO"].includes(entry.source.provider)) fail(`Invalid/prohibited role provider for ${id}.`);
    if (typeof entry.source.url !== "string" || !roleSourceUrlAllowed(entry.source.provider, entry.source.url)) fail(`Invalid role source URL/provider for ${id}.`);
    if (typeof entry.source.retrievedAt !== "string" || Number.isNaN(Date.parse(entry.source.retrievedAt))) fail(`Invalid role source timestamp for ${id}.`);
    roles.set(id, entry);
  }
  return roles;
}

function rawMatches(edition: WorldEdition): RawMatch[] | null {
  const filePath = path.join(RAW_DIR, `${edition.year}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = readJson<RawEdition>(filePath);
  if (raw.year !== edition.year) fail(`${edition.year}: raw wrapper year is ${String(raw.year)}; expected ${edition.year}.`);
  if (!Array.isArray(raw.matches)) fail(`${edition.year}: raw file must contain a matches array.`);
  return raw.matches;
}

function rawPlayerIds(matches: RawMatch[], year: number): Set<string> {
  const result = new Set<string>();
  for (const [matchIndex, match] of matches.entries()) {
    const info = match.info;
    if (!info?.players || !info.registry?.people) fail(`${year}: match ${matchIndex + 1} is missing line-ups or registry IDs.`);
    for (const names of Object.values(info.players)) {
      for (const name of names) {
        const id = info.registry.people[name]?.toLowerCase();
        if (!id || !/^[0-9a-f]{8}$/.test(id)) fail(`${year}: invalid Cricsheet Register ID for "${name}" in match ${matchIndex + 1}.`);
        result.add(id);
      }
    }
    for (const innings of match.innings ?? []) {
      for (const over of innings.overs ?? []) {
        for (const delivery of over.deliveries ?? []) {
          for (const wicket of delivery.wickets ?? []) {
            for (const name of [wicket.player_out, ...(wicket.fielders ?? []).map((fielder) => fielder.name)]) {
              const id = info.registry.people[name]?.toLowerCase();
              if (!id || !/^[0-9a-f]{8}$/.test(id)) fail(`${year}: invalid registry ID for wicket participant "${name}".`);
              result.add(id);
            }
          }
        }
      }
    }
  }
  return result;
}

function validateSeason(season: SeasonFile, edition: WorldEdition, rawIds: Set<string>, roles: Map<string, { role: Role; source: RoleSource }>): number {
  const year = edition.year;
  if (season.year !== year) fail(`${year}: year mismatch (${season.year}).`);
  if (season.seasonName !== edition.seasonName) fail(`${year}: season name mismatch.`);
  if (season.format !== "ODI") fail(`${year}: invalid format.`);
  if (season.competition !== "ICC Men's Cricket World Cup") fail(`${year}: invalid competition.`);
  if (season.oversPerInnings !== 50) fail(`${year}: innings-over limit mismatch.`);
  if (season.sourceProvider !== "Cricsheet") fail(`${year}: unsupported source provider.`);
  if (season.sourceUrl !== edition.sourceUrl) fail(`${year}: source URL mismatch.`);
  if (season.license !== "ODC-By-1.0") fail(`${year}: missing/incorrect Cricsheet license attribution.`);
  if (season.coverageStatus !== "complete") fail(`${year}: coverageStatus must be complete.`);
  if (season.expectedMatchCount !== edition.expectedMatchCount) fail(`${year}: expected match count mismatch.`);
  if (season.sourceMatchCount !== edition.expectedMatchCount) fail(`${year}: processed data does not contain the full expected match count.`);
  if (!Array.isArray(season.sources) || !season.sources.some((url) => url.includes("cricsheet.org"))) fail(`${year}: Cricsheet attribution is missing.`);
  if (!Array.isArray(season.teams) || season.teams.length < 2) fail(`${year}: at least two teams are required.`);

  const seenTeamNames = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenPlayerIds = new Set<string>();
  let playerCount = 0;

  for (const team of season.teams) {
    if (!team.name?.trim() || !team.shortName?.trim() || !team.slug?.trim()) fail(`${year}: invalid team metadata.`);
    if (seenTeamNames.has(team.name)) fail(`${year}: duplicate team name "${team.name}".`);
    if (seenSlugs.has(team.slug)) fail(`${year}: duplicate team slug "${team.slug}".`);
    seenTeamNames.add(team.name);
    seenSlugs.add(team.slug);
    if (!Array.isArray(team.players) || team.players.length < 11) fail(`${year}/${team.name}: fewer than 11 player records.`);

    for (const player of team.players) {
      playerCount++;
      if (!player.fullName?.trim()) fail(`${year}/${team.name}: player has no name.`);
      if (!/^cricsheet:[0-9a-f]{8}$/.test(player.sourcePlayerId)) fail(`${year}/${team.name}/${player.fullName}: invalid canonical source ID.`);
      const bareId = player.sourcePlayerId.replace(/^cricsheet:/i, "").toLowerCase();
      if (seenPlayerIds.has(bareId)) fail(`${year}: duplicate player ID ${bareId} across team pools.`);
      seenPlayerIds.add(bareId);
      if (!rawIds.has(bareId)) fail(`${year}/${player.fullName}: processed player is not present in the raw source data.`);
      if (!VALID_ROLES.has(player.role)) fail(`${year}/${player.fullName}: invalid role.`);
      if (!player.roleSource || !["ICC", "BOARD", "ESPNCRICINFO"].includes(player.roleSource.provider)) fail(`${year}/${player.fullName}: role provider must be ICC, BOARD, or ESPNCRICINFO; CricketArchive is prohibited.`);
      if (typeof player.roleSource.url !== "string" || !roleSourceUrlAllowed(player.roleSource.provider, player.roleSource.url)) fail(`${year}/${player.fullName}: role source URL is invalid or does not match provider ${player.roleSource.provider}.`);
      if (Number.isNaN(Date.parse(player.roleSource.retrievedAt))) fail(`${year}/${player.fullName}: invalid role source timestamp.`);
      const approvedRole = roles.get(bareId);
      if (!approvedRole) fail(`${year}/${player.fullName}: role ${bareId} is no longer present in the approved role map; reprocess this edition.`);
      if (approvedRole.role !== player.role || approvedRole.source.provider !== player.roleSource.provider || approvedRole.source.url !== player.roleSource.url || approvedRole.source.retrievedAt !== player.roleSource.retrievedAt) {
        fail(`${year}/${player.fullName}: processed role/provenance is stale compared with role-sources.json; rerun data:process-world.`);
      }
      if (!player.stats || typeof player.stats !== "object") fail(`${year}/${player.fullName}: missing statistics.`);

      for (const field of INTEGER_STATS) {
        const value = player.stats[field];
        if (!Number.isInteger(value) || value < 0) fail(`${year}/${player.fullName}: ${field} must be a non-negative integer.`);
      }
      for (const field of DECIMAL_STATS) {
        const value = player.stats[field];
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
          fail(`${year}/${player.fullName}: ${field} must be null or a non-negative finite number.`);
        }
      }
      if (player.stats.innings > player.stats.matches) fail(`${year}/${player.fullName}: innings exceed matches.`);
      if (player.stats.hundreds > player.stats.innings || player.stats.fifties > player.stats.innings || player.stats.hundreds + player.stats.fifties > player.stats.innings) {
        fail(`${year}/${player.fullName}: innings/50s/100s counts are inconsistent.`);
      }
      if (!Array.isArray(player.sources) || !player.sources.some((url) => url.includes("cricsheet.org"))) fail(`${year}/${player.fullName}: player source attribution is missing.`);
    }

    const wk = team.players.filter((player) => player.role === "WK").length;
    const bat = team.players.filter((player) => player.role === "BAT").length;
    const ar = team.players.filter((player) => player.role === "AR").length;
    const bowl = team.players.filter((player) => player.role === "BOWL").length;
    if (!(wk >= 1 && bat >= 4 && ar >= 1 && bowl >= 3 && ar + bowl >= 5)) {
      fail(`${year}/${team.name}: role pool cannot form a valid XI (WK>=1, BAT>=4, AR>=1, BOWL>=3, AR+BOWL>=5).`);
    }
  }

  const missingPlayers = [...rawIds].filter((id) => !seenPlayerIds.has(id));
  if (missingPlayers.length) fail(`${year}: processed data omitted ${missingPlayers.length} source player(s); first missing IDs: ${missingPlayers.slice(0, 12).join(", ")}.`);
  if (playerCount === 0) fail(`${year}: zero player records.`);
  return playerCount;
}

function main(): void {
  console.log("[WORLD VALIDATION] Auditing source coverage and any editions that are ready for validation.");
  const roles = loadRoles();
  const ready: number[] = [];
  const blocked: string[] = [];
  const invalid: string[] = [];

  for (const edition of WORLD_CRICSHEET_EDITIONS) {
    const processedPath = path.join(PROCESSED_DIR, `${edition.year}.json`);
    let matches: RawMatch[] | null;
    try {
      matches = rawMatches(edition);
    } catch (error) {
      invalid.push(`${edition.year}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`[WORLD VALIDATION] ${edition.year}: invalid raw source file.`);
      continue;
    }
    if (!matches) {
      blocked.push(`${edition.year}: raw file missing; run npm.cmd run data:download-world.`);
      console.log(`[WORLD VALIDATION] ${edition.year}: PENDING (no raw file).`);
      continue;
    }
    if (matches.length !== edition.expectedMatchCount) {
      const message = `${edition.year}: source coverage ${matches.length}/${edition.expectedMatchCount}; edition remains blocked and must not be imported.`;
      blocked.push(message);
      console.log(`[WORLD VALIDATION] ${message}`);
      if (fs.existsSync(processedPath)) {
        console.warn(`[WORLD VALIDATION] ${edition.year}: an old processed file exists but is ineligible because source coverage is incomplete. Re-run data:process-world to quarantine stale output.`);
      }
      continue;
    }

    let ids: Set<string>;
    try {
      ids = rawPlayerIds(matches, edition.year);
    } catch (error) {
      invalid.push(`${edition.year}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const unresolved = [...ids].filter((id) => !roles.has(id));
    if (unresolved.length > 0) {
      blocked.push(`${edition.year}: ${unresolved.length}/${ids.size} player roles remain unresolved.`);
      console.log(`[WORLD VALIDATION] ${edition.year}: PENDING ROLE REVIEW (${unresolved.length}/${ids.size} unresolved).`);
      continue;
    }
    if (!fs.existsSync(processedPath)) {
      invalid.push(`${edition.year}: source coverage and role mapping are complete, but ${processedPath} is missing; run npm.cmd run data:process-world.`);
      continue;
    }

    try {
      const season = readJson<SeasonFile>(processedPath);
      const playerCount = validateSeason(season, edition, ids, roles);
      ready.push(edition.year);
      console.log(`[WORLD VALIDATION] ${edition.year}: VALID (${season.teams.length} teams / ${playerCount} players / ${season.sourceMatchCount} matches).`);
    } catch (error) {
      invalid.push(`${edition.year}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (blocked.length) {
    console.log(`[WORLD VALIDATION] Editions not ready: ${blocked.length}.`);
    for (const message of blocked) console.log(`  - ${message}`);
  }
  if (invalid.length) {
    console.error(`[WORLD VALIDATION] Validation errors: ${invalid.length}.`);
    for (const message of invalid) console.error(`  - ${message}`);
  }
  if (ready.length === 0) {
    console.error("[WORLD VALIDATION] No edition has passed validation. Resolve source coverage and roles, then process the complete edition before importing.");
    process.exitCode = 2;
    return;
  }
  if (invalid.length > 0) {
    process.exitCode = 2;
    return;
  }
  console.log(`[WORLD VALIDATION] Successful for ${ready.length} edition(s): ${ready.join(", ")}. Only these editions are candidates for import.`);
}

try {
  main();
} catch (error: unknown) {
  console.error(`[WORLD VALIDATION] Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
