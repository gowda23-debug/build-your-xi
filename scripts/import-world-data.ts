import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { WORLD_CRICSHEET_EDITIONS, type WorldEdition } from "./data/world/editions";

type Role = "BAT" | "WK" | "AR" | "BOWL";
type RoleProvider = "ICC" | "BOARD" | "ESPNCRICINFO";
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
  teams: Array<{
    name: string;
    shortName: string;
    slug: string;
    players: Array<{
      fullName: string;
      sourcePlayerId: string;
      role: Role;
      roleSource: { provider: RoleProvider; url: string; retrievedAt: string };
      stats: PlayerStats;
      sources: string[];
    }>;
    sources: string[];
  }>;
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
    overs?: Array<{ deliveries?: Array<{
      batter: string;
      bowler: string;
      non_striker: string;
      runs: { batter: number; extras: number; total: number };
      wickets?: Array<{ player_out: string; fielders?: Array<{ name: string }> }>;
    }> }>;
  }>;
};
type RawEdition = { year?: number; matches?: RawMatch[] };
type RawPreflight = { matchCount: number; playerIds: Set<string> };
type RoleFile = { players?: Record<string, { role: Role; source: { provider: RoleProvider; url: string; retrievedAt: string } }> };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "scripts", "data", "world", "raw");
const PROCESSED_DIR = path.join(ROOT, "scripts", "data", "world", "processed");
const ROLE_FILE = path.join(ROOT, "scripts", "data", "world", "role-sources.json");
const ALLOWED_ROLES = new Set<Role>(["BAT", "WK", "AR", "BOWL"]);
const INTEGER_STATS = ["matches", "innings", "runs", "hundreds", "fifties", "wickets", "catches", "stumpings"] as const;
const DECIMAL_STATS = ["batting_average", "strike_rate", "bowling_average", "economy"] as const;

function fail(message: string): never {
  throw new Error(`[WORLD IMPORT] ${message}`);
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
  if (!fs.existsSync(filePath)) fail(`Missing ${filePath}. Run the source audit and processing steps first.`);
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) fail(`File is empty: ${filePath}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    fail(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(parsed)) fail(`${filePath} must contain a JSON object.`);
  return parsed as T;
}

function readRawCount(edition: WorldEdition): RawPreflight {
  const filePath = path.join(RAW_DIR, `${edition.year}.json`);
  const raw = readJson<RawEdition>(filePath);
  if (raw.year !== edition.year) fail(`${edition.year}: raw wrapper year is ${String(raw.year)}; expected ${edition.year}.`);
  if (!Array.isArray(raw.matches)) fail(`${edition.year}: raw file must contain a matches array.`);
  if (raw.matches.length !== edition.expectedMatchCount) {
    fail(`${edition.year}: source coverage is ${raw.matches.length}/${edition.expectedMatchCount}; refusing to import an incomplete edition.`);
  }
  const seenMatches = new Set<string>();
  const playerIds = new Set<string>();
  const validId = (registry: Record<string, string>, name: string, location: string): string => {
    const id = registry[name]?.toLowerCase();
    if (!id || !/^[0-9a-f]{8}$/.test(id)) fail(`${edition.year}: ${location} has no valid Cricsheet Register ID for "${name}".`);
    playerIds.add(id);
    return id;
  };
  raw.matches.forEach((match, index) => {
    const info = match?.info;
    const date = info?.dates?.[0];
    const teams = info?.teams;
    const lineups = info?.players;
    const registry = info?.registry?.people;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== edition.year || !Array.isArray(teams) || teams.length !== 2 || !teams.every((team) => typeof team === "string" && team.trim()) || !lineups || !registry || !Array.isArray(match.innings) || match.innings.length === 0) {
      fail(`${edition.year}: invalid raw match structure at match ${index + 1} (date, two teams, line-ups, registry IDs and innings are required).`);
    }
    if (Object.keys(lineups).length !== 2) fail(`${edition.year}: match ${index + 1} must contain line-ups for exactly two teams.`);
    for (const [team, names] of Object.entries(lineups)) {
      if (!teams.includes(team) || !Array.isArray(names) || names.length === 0) fail(`${edition.year}: match ${index + 1} has an invalid line-up for ${team}.`);
      for (const name of names) {
        if (typeof name !== "string" || !name.trim()) fail(`${edition.year}: match ${index + 1} has a blank player name in ${team}'s line-up.`);
        validId(registry, name, `match ${index + 1} line-up`);
      }
    }
    const key = `${date}|${String(info.event?.match_number ?? "")}|${[...teams].sort().join("|")}`;
    if (seenMatches.has(key)) fail(`${edition.year}: duplicate match date/number/team key detected at match ${index + 1}.`);
    seenMatches.add(key);

    for (const [inningsIndex, innings] of match.innings.entries()) {
      if (!innings || !teams.includes(innings.team) || !Array.isArray(innings.overs) || innings.overs.length === 0) {
        fail(`${edition.year}: match ${index + 1} innings ${inningsIndex + 1} has an invalid team or overs array.`);
      }
      for (const [overIndex, over] of innings.overs.entries()) {
        if (!over || !Array.isArray(over.deliveries)) fail(`${edition.year}: match ${index + 1}, innings ${inningsIndex + 1}, over ${overIndex + 1} has no deliveries array.`);
        for (const [deliveryIndex, delivery] of over.deliveries.entries()) {
          const label = `match ${index + 1}, innings ${inningsIndex + 1}, over ${overIndex + 1}, delivery ${deliveryIndex + 1}`;
          if (!delivery || typeof delivery.batter !== "string" || typeof delivery.bowler !== "string" || typeof delivery.non_striker !== "string" || !delivery.runs || ![delivery.runs.batter, delivery.runs.extras, delivery.runs.total].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)) {
            fail(`${edition.year}: ${label} has invalid batter/bowler/non-striker or runs data.`);
          }
          validId(registry, delivery.batter, label);
          validId(registry, delivery.bowler, label);
          validId(registry, delivery.non_striker, label);
          for (const wicket of delivery.wickets ?? []) {
            if (!wicket || typeof wicket.player_out !== "string") fail(`${edition.year}: ${label} has an invalid wicket record.`);
            validId(registry, wicket.player_out, `${label} wicket`);
            for (const fielder of wicket.fielders ?? []) {
              if (!fielder || typeof fielder.name !== "string") fail(`${edition.year}: ${label} has an invalid fielder record.`);
              validId(registry, fielder.name, `${label} fielder`);
            }
          }
        }
      }
    }
  });
  return { matchCount: raw.matches.length, playerIds };
}

function loadApprovedRoles(): Map<string, { role: Role; source: { provider: RoleProvider; url: string; retrievedAt: string } }> {
  const file = readJson<RoleFile>(ROLE_FILE);
  if (!file.players || typeof file.players !== "object" || Array.isArray(file.players)) {
    fail(`${ROLE_FILE} must contain a players object. Run npm.cmd run data:build-world-roles first.`);
  }
  const roles = new Map<string, { role: Role; source: { provider: RoleProvider; url: string; retrievedAt: string } }>();
  for (const [rawId, entry] of Object.entries(file.players)) {
    const id = rawId.toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(id) || !entry || !ALLOWED_ROLES.has(entry.role)) fail(`Invalid approved World role entry: ${rawId}.`);
    if (!entry.source || !["ICC", "BOARD", "ESPNCRICINFO"].includes(entry.source.provider)) fail(`${id}: approved role provider is missing or prohibited.`);
    if (typeof entry.source.url !== "string" || !roleSourceUrlAllowed(entry.source.provider, entry.source.url)) fail(`${id}: role source URL/provider is invalid.`);
    if (typeof entry.source.retrievedAt !== "string" || Number.isNaN(Date.parse(entry.source.retrievedAt))) fail(`${id}: role source timestamp is invalid.`);
    roles.set(id, entry);
  }
  return roles;
}

function readProcessed(edition: WorldEdition, approvedRoles: Map<string, { role: Role; source: { provider: RoleProvider; url: string; retrievedAt: string } }>, rawPlayerIds: Set<string>): SeasonFile {
  const filePath = path.join(PROCESSED_DIR, `${edition.year}.json`);
  const season = readJson<SeasonFile>(filePath);
  if (season.year !== edition.year) fail(`${edition.year}: processed file has year ${season.year}.`);
  if (season.seasonName !== edition.seasonName || season.format !== "ODI" || season.competition !== "ICC Men's Cricket World Cup") {
    fail(`${edition.year}: processed metadata does not match the source registry.`);
  }
  if (season.oversPerInnings !== 50 || season.sourceProvider !== "Cricsheet" || season.sourceUrl !== edition.sourceUrl || season.license !== edition.license) {
    fail(`${edition.year}: processed source metadata or licensing attribution is invalid.`);
  }
  if (season.coverageStatus !== "complete" || season.expectedMatchCount !== edition.expectedMatchCount || season.sourceMatchCount !== edition.expectedMatchCount) {
    fail(`${edition.year}: processed JSON is not marked as complete for all ${edition.expectedMatchCount} matches.`);
  }
  if (!Array.isArray(season.teams) || season.teams.length < 2) fail(`${edition.year}: processed file has no valid team array.`);

  const teamSlugs = new Set<string>();
  const playerIds = new Set<string>();
  for (const team of season.teams) {
    if (!team.name?.trim() || !team.shortName?.trim() || !team.slug?.trim()) fail(`${edition.year}: invalid team metadata.`);
    if (teamSlugs.has(team.slug)) fail(`${edition.year}: duplicate team slug ${team.slug}.`);
    teamSlugs.add(team.slug);
    if (!Array.isArray(team.players) || team.players.length < 11) fail(`${edition.year}/${team.name}: team must have at least 11 player records.`);
    for (const player of team.players) {
      if (!player.fullName?.trim()) fail(`${edition.year}/${team.name}: player name is blank.`);
      if (!/^cricsheet:[0-9a-f]{8}$/.test(player.sourcePlayerId)) fail(`${edition.year}/${team.name}/${player.fullName}: invalid canonical Cricsheet ID.`);
      if (playerIds.has(player.sourcePlayerId.toLowerCase())) fail(`${edition.year}: duplicate player ID ${player.sourcePlayerId}.`);
      playerIds.add(player.sourcePlayerId.toLowerCase());
      if (!ALLOWED_ROLES.has(player.role)) fail(`${edition.year}/${player.fullName}: invalid role.`);
      if (!player.roleSource || !["ICC", "BOARD", "ESPNCRICINFO"].includes(player.roleSource.provider)) fail(`${edition.year}/${player.fullName}: role provenance is missing or uses a prohibited provider.`);
      if (typeof player.roleSource.url !== "string" || !roleSourceUrlAllowed(player.roleSource.provider, player.roleSource.url) || Number.isNaN(Date.parse(player.roleSource.retrievedAt))) fail(`${edition.year}/${player.fullName}: invalid role source URL/provider or timestamp.`);
      const currentRole = approvedRoles.get(player.sourcePlayerId.replace(/^cricsheet:/i, "").toLowerCase());
      if (!currentRole || currentRole.role !== player.role || currentRole.source.provider !== player.roleSource.provider || currentRole.source.url !== player.roleSource.url || currentRole.source.retrievedAt !== player.roleSource.retrievedAt) fail(`${edition.year}/${player.fullName}: processed role/provenance is stale or no longer approved; rerun data:process-world.`);
      if (!player.stats || typeof player.stats !== "object") fail(`${edition.year}/${player.fullName}: stats object is missing.`);
      for (const field of INTEGER_STATS) {
        const value = player.stats[field];
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail(`${edition.year}/${player.fullName}: ${field} must be a non-negative integer.`);
      }
      for (const field of DECIMAL_STATS) {
        const value = player.stats[field];
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) fail(`${edition.year}/${player.fullName}: ${field} must be null or a non-negative finite number.`);
      }
      if (player.stats.innings > player.stats.matches || player.stats.hundreds + player.stats.fifties > player.stats.innings) fail(`${edition.year}/${player.fullName}: inconsistent innings/50s/100s stats.`);
      if (!Array.isArray(player.sources) || !player.sources.some((source) => source.includes("cricsheet.org"))) fail(`${edition.year}/${player.fullName}: missing source attribution.`);
    }
    const wk = team.players.filter((player) => player.role === "WK").length;
    const bat = team.players.filter((player) => player.role === "BAT").length;
    const ar = team.players.filter((player) => player.role === "AR").length;
    const bowl = team.players.filter((player) => player.role === "BOWL").length;
    if (!(wk >= 1 && bat >= 4 && ar >= 1 && bowl >= 3 && ar + bowl >= 5)) fail(`${edition.year}/${team.name}: roles do not support a valid XI.`);
  }
  const missingRawPlayers = [...rawPlayerIds].filter((id) => !playerIds.has(`cricsheet:${id}`));
  if (missingRawPlayers.length) fail(`${edition.year}: processed JSON omits ${missingRawPlayers.length} raw source player(s); first IDs: ${missingRawPlayers.slice(0, 12).join(", ")}.`);
  const extraProcessedPlayers = [...playerIds].map((id) => id.replace(/^cricsheet:/, "")).filter((id) => !rawPlayerIds.has(id));
  if (extraProcessedPlayers.length) fail(`${edition.year}: processed JSON contains ${extraProcessedPlayers.length} player(s) absent from the raw edition; first IDs: ${extraProcessedPlayers.slice(0, 12).join(", ")}.`);
  return season;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const allReady = args.includes("--all-ready");
  const yearArgs = args.filter((arg) => arg.startsWith("--year="));
  if ((allReady && yearArgs.length > 0) || (!allReady && yearArgs.length !== 1)) {
    fail("Specify exactly one of --year=YYYY or --all-ready. Add --dry-run to validate without database writes.");
  }

  let requested: WorldEdition[];
  if (allReady) {
    requested = WORLD_CRICSHEET_EDITIONS.filter((edition) => fs.existsSync(path.join(PROCESSED_DIR, `${edition.year}.json`)));
  } else {
    const year = Number(yearArgs[0].slice("--year=".length));
    if (!Number.isInteger(year)) fail("--year must be an integer, for example --year=2011.");
    const edition = WORLD_CRICSHEET_EDITIONS.find((item) => item.year === year);
    if (!edition) fail(`${year} is not an enabled Cricsheet edition. Historical editions require a separately approved source pipeline.`);
    requested = [edition];
  }
  if (requested.length === 0) fail("No processed editions were found. Run source audit, role review, processing, and validation first.");

  // Perform ALL selected-edition preflight checks before the first database write.
  const approvedRoles = loadApprovedRoles();
  const inputs: Array<{ edition: WorldEdition; sourceMatchCount: number; season: SeasonFile }> = [];
  const preflightErrors: string[] = [];
  for (const edition of requested) {
    try {
      const raw = readRawCount(edition);
      const season = readProcessed(edition, approvedRoles, raw.playerIds);
      inputs.push({ edition, sourceMatchCount: raw.matchCount, season });
    } catch (error) {
      const message = `${edition.year}: ${error instanceof Error ? error.message : String(error)}`;
      if (allReady) {
        console.warn(`[WORLD IMPORT] Skipping blocked edition during --all-ready preflight: ${message}`);
      } else {
        preflightErrors.push(message);
      }
    }
  }
  if (preflightErrors.length > 0) {
    fail(`Preflight rejected ${preflightErrors.length} edition(s); zero database writes were made.\n${preflightErrors.map((message) => ` - ${message}`).join("\n")}`);
  }
  if (inputs.length === 0) fail("No edition passed preflight; zero database writes were made. Resolve the listed coverage, role, source, and validation blockers first.");
  console.log(`[WORLD IMPORT] Preflight passed for ${inputs.length} edition(s): ${inputs.map((item) => item.edition.year).join(", ")}.`);
  if (dryRun) {
    for (const item of inputs) console.log(`[WORLD IMPORT] DRY RUN ${item.edition.year}: ${item.season.teams.length} teams, ${item.season.teams.reduce((sum, team) => sum + team.players.length, 0)} player-team records, ${item.sourceMatchCount} matches.`);
    console.log("[WORLD IMPORT] Dry run complete; no database writes were performed.");
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local. A dry run does not need credentials, but a live import does.");
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Read-only schema preflight avoids attempting the RPC against an unmigrated DB.
  const schema = await db.from("world_editions").select("id,status").limit(1);
  if (schema.error) {
    fail(`Database schema preflight failed (${schema.error.code ?? "UNKNOWN"}): ${schema.error.message}. Apply supabase/migrations/20261012_world_pipeline_hardening.sql after 20261008_world_player_sources.sql before running a live import.`);
  }

  for (const item of inputs) {
    console.log(`[WORLD IMPORT] Importing ${item.edition.year} through transactional RPC...`);
    const result = await db.rpc("import_world_edition", {
      p_edition: item.season,
      p_expected_match_count: item.edition.expectedMatchCount,
      p_source_match_count: item.sourceMatchCount,
    });
    if (result.error) {
      fail(`${item.edition.year}: transactional import failed. No partial writes from this edition should have been committed. Details: ${result.error.message}. Ensure supabase/migrations/20261012_world_pipeline_hardening.sql is applied after 20261008_world_player_sources.sql, then retry after fixing the reported constraint/data issue.`);
    }
    console.log(`[WORLD IMPORT] ${item.edition.year}: committed and published. Result: ${JSON.stringify(result.data)}`);
  }

  console.log(`[WORLD IMPORT] Successful. Published editions: ${inputs.map((item) => item.edition.year).join(", ")}.`);
}

main().catch((error) => {
  console.error(`[WORLD IMPORT] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
