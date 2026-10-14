import fs from "node:fs";
import path from "node:path";
import { WORLD_CRICSHEET_EDITIONS, type WorldEdition } from "./data/world/editions";

type Role = "BAT" | "WK" | "AR" | "BOWL";
type RoleProvider = "ICC" | "BOARD" | "ESPNCRICINFO";
type RoleEntry = {
  role: Role;
  source: { provider: RoleProvider; url: string; retrievedAt: string };
};
type PlayerLineup = Record<string, string[]>;
type RawWicket = {
  kind: string;
  player_out: string;
  fielders?: Array<{ name: string }>;
};
type RawDelivery = {
  batter: string;
  bowler: string;
  non_striker: string;
  runs: { batter: number; extras: number; total: number; non_boundary?: boolean };
  extras?: Record<string, number>;
  wickets?: RawWicket[];
};
type RawMatch = {
  info: {
    dates?: string[];
    teams: string[];
    players: PlayerLineup;
    registry?: { people?: Record<string, string> };
    event?: { name?: string; match_number?: number };
  };
  innings?: Array<{
    team: string;
    overs?: Array<{ deliveries?: RawDelivery[] }>;
  }>;
};
type RawEdition = {
  year?: number;
  matches?: RawMatch[];
};
type Accumulator = {
  id: string;
  name: string;
  team: string;
  matches: Set<string>;
  innings: number;
  runs: number;
  ballsFaced: number;
  dismissals: number;
  wickets: number;
  ballsBowled: number;
  runsConceded: number;
  catches: number;
  stumpings: number;
  inningsScores: number[];
};
type ProcessedPlayer = {
  fullName: string;
  sourcePlayerId: string;
  role: Role;
  roleSource: RoleEntry["source"];
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
  sources: string[];
};
type ProcessedTeam = {
  name: string;
  shortName: string;
  slug: string;
  players: ProcessedPlayer[];
  sources: string[];
};
type ProcessedSeason = {
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
  teams: ProcessedTeam[];
  sources: string[];
};

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "scripts", "data", "world", "raw");
const OUT_DIR = path.join(ROOT, "scripts", "data", "world", "processed");
const ROLE_FILE = path.join(ROOT, "scripts", "data", "world", "role-sources.json");
const CRICSHEET_URL = "https://cricsheet.org/downloads/";
const VALID_ROLES = new Set<Role>(["BAT", "WK", "AR", "BOWL"]);

function fail(message: string): never {
  throw new Error(`[WORLD PROCESSING] ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) fail(`Missing file: ${filePath}.`);
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) fail(`File is empty: ${filePath}.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    fail(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(parsed)) fail(`Expected a JSON object in ${filePath}.`);
  return parsed as T;
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

function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

function quarantineProcessedEdition(year: number, reason: string): void {
  const filePath = path.join(OUT_DIR, `${year}.json`);
  if (!fs.existsSync(filePath)) return;
  const quarantineDir = path.join(ROOT, "scripts", "data", "world", "quarantine", "processed");
  ensureDirectory(quarantineDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(quarantineDir, `${year}.${timestamp}.blocked.json`);
  fs.renameSync(filePath, destination);
  console.warn(`[WORLD PROCESSING] Quarantined stale ${year} processed data (${reason}): ${destination}`);
}

function loadRoles(): Map<string, RoleEntry> {
  if (!fs.existsSync(ROLE_FILE)) {
    fail(`Missing ${ROLE_FILE}. Run the role-review workflow and npm.cmd run data:build-world-roles first.`);
  }
  const file = readJson<{ players?: Record<string, RoleEntry> }>(ROLE_FILE);
  if (!file.players || typeof file.players !== "object" || Array.isArray(file.players)) {
    fail(`${ROLE_FILE} must contain a players object. Rebuild it with npm.cmd run data:build-world-roles.`);
  }

  const result = new Map<string, RoleEntry>();
  for (const [rawId, entry] of Object.entries(file.players)) {
    const id = rawId.toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(id)) fail(`Invalid Cricsheet Register ID "${rawId}" in role-sources.json.`);
    if (!entry || !VALID_ROLES.has(entry.role)) fail(`Invalid role mapping for player ${id}.`);
    if (!entry.source || !["ICC", "BOARD", "ESPNCRICINFO"].includes(entry.source.provider)) {
      fail(`Player ${id} role provider must be ICC, BOARD, or ESPNCRICINFO. CricketArchive is not an approved source.`);
    }
    if (typeof entry.source.url !== "string" || !roleSourceUrlAllowed(entry.source.provider, entry.source.url)) {
      fail(`Player ${id} has a role source URL that is invalid or does not match provider ${entry.source.provider}.`);
    }
    if (!entry.source.retrievedAt || Number.isNaN(Date.parse(entry.source.retrievedAt))) {
      fail(`Player ${id} has an invalid role source timestamp.`);
    }
    result.set(id, entry);
  }
  return result;
}

function readRawEdition(edition: WorldEdition): RawMatch[] {
  const filePath = path.join(RAW_DIR, `${edition.year}.json`);
  const wrapper = readJson<RawEdition>(filePath);
  if (wrapper.year !== edition.year) {
    fail(`${edition.year}: raw wrapper year is ${String(wrapper.year)}; expected ${edition.year}. Re-run data:download-world.`);
  }
  if (!Array.isArray(wrapper.matches)) fail(`${edition.year}: raw file must contain a matches array.`);
  return wrapper.matches;
}

function matchKey(match: RawMatch, year: number, index: number): string {
  const date = match.info?.dates?.[0];
  const teams = match.info?.teams;
  if (!date || !Array.isArray(teams) || teams.length !== 2) {
    fail(`${year}: match ${index + 1} is missing a valid date or two teams.`);
  }
  return `${date}|${String(match.info.event?.match_number ?? "")}|${[...teams].sort().join("|")}`;
}

function canonicalId(match: RawMatch, name: string, year: number): string {
  const id = match.info.registry?.people?.[name]?.toLowerCase();
  if (!id || !/^[0-9a-f]{8}$/.test(id)) fail(`${year}: missing valid Cricsheet Register ID for "${name}".`);
  return id;
}

function numeric(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`Invalid non-negative numeric value for ${label}.`);
  }
  return value;
}

function slugify(value: string): string {
  const slug = value.toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) fail(`Could not make a valid team slug from "${value}".`);
  return slug;
}

function shortName(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);
  const result = words.length === 1
    ? words[0].slice(0, 4).toUpperCase()
    : words.map((word) => word[0]).join("").slice(0, 4).toUpperCase();
  return result || value.slice(0, 4).toUpperCase();
}

function newAccumulator(id: string, name: string, team: string): Accumulator {
  return {
    id, name, team, matches: new Set<string>(), innings: 0, runs: 0,
    ballsFaced: 0, dismissals: 0, wickets: 0, ballsBowled: 0,
    runsConceded: 0, catches: 0, stumpings: 0, inningsScores: [],
  };
}

function isBowlerCredited(kind: string): boolean {
  return ![
    "run out", "retired hurt", "retired not out", "retired out",
    "obstructing the field", "timed out", "hit the ball twice",
  ].includes(kind.toLowerCase());
}

function isDismissal(kind: string): boolean {
  return !["retired hurt", "retired not out"].includes(kind.toLowerCase());
}

function hasPlayableXI(players: ProcessedPlayer[]): boolean {
  const wk = players.filter((player) => player.role === "WK").length;
  const bat = players.filter((player) => player.role === "BAT").length;
  const ar = players.filter((player) => player.role === "AR").length;
  const bowl = players.filter((player) => player.role === "BOWL").length;
  return players.length >= 11 && wk >= 1 && bat >= 4 && ar >= 1 && bowl >= 3 && ar + bowl >= 5;
}

function processEdition(edition: WorldEdition, roles: Map<string, RoleEntry>): ProcessedSeason {
  const matches = readRawEdition(edition);
  if (matches.length !== edition.expectedMatchCount) {
    fail(`${edition.year}: source coverage is incomplete (${matches.length}/${edition.expectedMatchCount}). Run npm.cmd run data:audit-world-source-coverage and do not import this edition.`);
  }

  const seenMatches = new Set<string>();
  const players = new Map<string, Accumulator>();
  const teamPlayers = new Map<string, Set<string>>();

  matches.forEach((match, index) => {
    if (!match.info || !Array.isArray(match.info.teams) || match.info.teams.length !== 2) {
      fail(`${edition.year}: match ${index + 1} has invalid info.teams.`);
    }
    const key = matchKey(match, edition.year, index);
    if (seenMatches.has(key)) fail(`${edition.year}: duplicate match key ${key}.`);
    seenMatches.add(key);

    const lineup = match.info.players;
    if (!lineup || typeof lineup !== "object" || Array.isArray(lineup)) {
      fail(`${edition.year}: match ${index + 1} has no player line-ups.`);
    }

    for (const [team, names] of Object.entries(lineup)) {
      if (!match.info.teams.includes(team) || !Array.isArray(names) || names.length === 0) {
        fail(`${edition.year}: invalid line-up for team "${team}" in match ${index + 1}.`);
      }
      const ids = teamPlayers.get(team) ?? new Set<string>();
      for (const name of names) {
        const id = canonicalId(match, name, edition.year);
        ids.add(id);
        const player = players.get(id);
        if (player && player.team !== team) {
          fail(`${edition.year}: Cricsheet ID ${id} is assigned to both "${player.team}" and "${team}" in the same edition.`);
        }
        const accumulator = player ?? newAccumulator(id, name, team);
        accumulator.matches.add(key);
        players.set(id, accumulator);
      }
      teamPlayers.set(team, ids);
    }

    for (const [inningsIndex, innings] of (match.innings ?? []).entries()) {
      if (!lineup[innings.team]) fail(`${edition.year}: innings ${inningsIndex + 1} has unknown batting team "${innings.team}".`);
      const inningScores = new Map<string, number>();
      const battingParticipants = new Set<string>();

      for (const over of innings.overs ?? []) {
        for (const delivery of over.deliveries ?? []) {
          const batterId = canonicalId(match, delivery.batter, edition.year);
          const bowlerId = canonicalId(match, delivery.bowler, edition.year);
          const nonStrikerId = canonicalId(match, delivery.non_striker, edition.year);
          const batter = players.get(batterId);
          const bowler = players.get(bowlerId);
          if (!batter || !bowler || !players.has(nonStrikerId)) {
            fail(`${edition.year}: a delivery references a player absent from the match line-up.`);
          }
          if (!delivery.runs || typeof delivery.runs !== "object") fail(`${edition.year}: delivery is missing its runs object.`);
          const batterRuns = numeric(delivery.runs.batter, `${edition.year}/${delivery.batter}/runs`);
          const totalRuns = numeric(delivery.runs.total, `${edition.year}/${delivery.batter}/total runs`);
          const extras = delivery.extras ?? {};
          const wides = numeric(extras.wides ?? 0, `${edition.year}/wides`);
          const noBalls = numeric(extras.noballs ?? 0, `${edition.year}/no-balls`);
          const byes = numeric(extras.byes ?? 0, `${edition.year}/byes`);
          const legByes = numeric(extras.legbyes ?? 0, `${edition.year}/leg-byes`);
          const penalty = numeric(extras.penalty ?? 0, `${edition.year}/penalty extras`);

          batter.runs += batterRuns;
          inningScores.set(batterId, (inningScores.get(batterId) ?? 0) + batterRuns);
          battingParticipants.add(batterId);
          battingParticipants.add(nonStrikerId);

          // A wide is not a ball faced. A no-ball is faced by the batter but is not a legal ball bowled.
          if (wides === 0) batter.ballsFaced += 1;
          if (wides === 0 && noBalls === 0) bowler.ballsBowled += 1;
          bowler.runsConceded += Math.max(0, totalRuns - byes - legByes - penalty);

          for (const wicket of delivery.wickets ?? []) {
            const outId = canonicalId(match, wicket.player_out, edition.year);
            const outPlayer = players.get(outId);
            if (!outPlayer) fail(`${edition.year}: wicket references unknown player "${wicket.player_out}".`);
            if (isDismissal(wicket.kind)) outPlayer.dismissals += 1;
            battingParticipants.add(outId);

            for (const fielder of wicket.fielders ?? []) {
              const fielderId = canonicalId(match, fielder.name, edition.year);
              let fielderPlayer = players.get(fielderId);
              if (!fielderPlayer) {
                // A named substitute fielder can receive a catch/stumping despite not being in the starting XI.
                const fieldingTeam = match.info.teams.find((team) => team !== innings.team);
                if (!fieldingTeam) fail(`${edition.year}: cannot identify fielding team for substitute fielder "${fielder.name}".`);
                fielderPlayer = newAccumulator(fielderId, fielder.name, fieldingTeam);
                fielderPlayer.matches.add(key);
                players.set(fielderId, fielderPlayer);
                const fieldingIds = teamPlayers.get(fieldingTeam) ?? new Set<string>();
                fieldingIds.add(fielderId);
                teamPlayers.set(fieldingTeam, fieldingIds);
              } else if (fielderPlayer.team === innings.team) {
                fail(`${edition.year}: fielder "${fielder.name}" is assigned to the batting team in a wicket record.`);
              }
              fielderPlayer.matches.add(key);
              if (wicket.kind.toLowerCase() === "stumped") fielderPlayer.stumpings += 1;
              if (["caught", "caught and bowled"].includes(wicket.kind.toLowerCase())) fielderPlayer.catches += 1;
            }
            if (isBowlerCredited(wicket.kind)) bowler.wickets += 1;
          }
        }
      }

      for (const id of battingParticipants) {
        const participant = players.get(id);
        if (!participant) fail(`${edition.year}: missing batting participant ${id}.`);
        participant.innings += 1;
        participant.inningsScores.push(inningScores.get(id) ?? 0);
      }
    }
  });

  const outputTeams: ProcessedTeam[] = [...teamPlayers.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([team, ids]) => {
      const outputPlayers: ProcessedPlayer[] = [...ids]
        .sort((a, b) => a.localeCompare(b))
        .map((id) => {
          const player = players.get(id);
          if (!player) fail(`${edition.year}/${team}: internal error; player ${id} missing.`);
          const role = roles.get(id);
          if (!role) fail(`${edition.year}/${team}/${player.name}: role not verified for Cricsheet ID ${id}.`);

          const hundreds = player.inningsScores.filter((score) => score >= 100).length;
          const fifties = player.inningsScores.filter((score) => score >= 50 && score < 100).length;
          return {
            fullName: player.name,
            sourcePlayerId: `cricsheet:${player.id}`,
            role: role.role,
            roleSource: role.source,
            stats: {
              matches: player.matches.size,
              innings: player.innings,
              runs: player.runs,
              batting_average: player.dismissals > 0 ? player.runs / player.dismissals : null,
              strike_rate: player.ballsFaced > 0 ? (player.runs / player.ballsFaced) * 100 : null,
              hundreds,
              fifties,
              wickets: player.wickets,
              bowling_average: player.wickets > 0 ? player.runsConceded / player.wickets : null,
              economy: player.ballsBowled > 0 ? player.runsConceded / (player.ballsBowled / 6) : null,
              catches: player.catches,
              stumpings: player.stumpings,
            },
            sources: [CRICSHEET_URL],
          };
        });

      if (!hasPlayableXI(outputPlayers)) {
        fail(`${edition.year}/${team}: resolved players do not contain enough verified roles for a playable XI (needs WK>=1, BAT>=4, AR>=1, BOWL>=3, AR+BOWL>=5 and 11 players).`);
      }
      return {
        name: team,
        shortName: shortName(team),
        slug: slugify(team),
        players: outputPlayers,
        sources: [CRICSHEET_URL],
      };
    });

  return {
    year: edition.year,
    seasonName: edition.seasonName,
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: edition.oversPerInnings,
    sourceProvider: "Cricsheet",
    sourceUrl: edition.sourceUrl,
    license: edition.license,
    expectedMatchCount: edition.expectedMatchCount,
    sourceMatchCount: matches.length,
    coverageStatus: "complete",
    teams: outputTeams,
    sources: [edition.sourceUrl, "https://opendatacommons.org/licenses/by/1-0/"],
  };
}

function readPlayerIds(matches: RawMatch[], year: number): Set<string> {
  const ids = new Set<string>();
  for (const [matchIndex, match] of matches.entries()) {
    const info = match.info;
    if (!info?.players || !info.registry?.people) fail(`${year}: match ${matchIndex + 1} is missing line-ups or registry IDs.`);
    for (const names of Object.values(info.players)) {
      for (const name of names) ids.add(canonicalId(match, name, year));
    }
    for (const innings of match.innings ?? []) {
      for (const over of innings.overs ?? []) {
        for (const delivery of over.deliveries ?? []) {
          for (const wicket of delivery.wickets ?? []) {
            ids.add(canonicalId(match, wicket.player_out, year));
            for (const fielder of wicket.fielders ?? []) ids.add(canonicalId(match, fielder.name, year));
          }
        }
      }
    }
  }
  return ids;
}

function main(): void {
  console.log("[WORLD PROCESSING] Starting; incomplete editions will be skipped, never published.");
  const roles = loadRoles();
  ensureDirectory(OUT_DIR);
  const completed: number[] = [];
  const blockers: string[] = [];

  for (const edition of WORLD_CRICSHEET_EDITIONS) {
    // A previously processed file is never trusted on a new run: it must be
    // regenerated from today's raw coverage and currently approved role map.
    quarantineProcessedEdition(edition.year, "re-processing with current source/role gates");
    const rawPath = path.join(RAW_DIR, `${edition.year}.json`);
    if (!fs.existsSync(rawPath)) {
      blockers.push(`${edition.year}: missing raw file; run data:download-world.`);
      console.log(`[WORLD PROCESSING] ${edition.year}: SKIPPED (raw file missing).`);
      continue;
    }

    let matches: RawMatch[];
    try {
      matches = readRawEdition(edition);
    } catch (error) {
      blockers.push(`${edition.year}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`[WORLD PROCESSING] ${edition.year}: BLOCKED by invalid raw data.`);
      continue;
    }

    if (matches.length !== edition.expectedMatchCount) {
      const message = `${edition.year}: source coverage ${matches.length}/${edition.expectedMatchCount}; missing ${Math.max(0, edition.expectedMatchCount - matches.length)} match(es).`;
      blockers.push(message);
      console.log(`[WORLD PROCESSING] ${message} Not processing this edition.`);
      continue;
    }

    let editionIds: Set<string>;
    try {
      editionIds = readPlayerIds(matches, edition.year);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      blockers.push(`${edition.year}: ${message}`);
      console.error(`[WORLD PROCESSING] ${edition.year}: BLOCKED: ${message}`);
      continue;
    }
    const unresolved = [...editionIds].filter((id) => !roles.has(id));
    if (unresolved.length > 0) {
      const message = `${edition.year}: ${unresolved.length} of ${editionIds.size} Cricsheet players do not have verified roles. First unresolved IDs: ${unresolved.slice(0, 12).join(", ")}.`;
      blockers.push(message);
      console.log(`[WORLD PROCESSING] ${message}`);
      continue;
    }

    try {
      const output = processEdition(edition, roles);
      const outputPath = path.join(OUT_DIR, `${edition.year}.json`);
      const tempPath = `${outputPath}.tmp`;
      fs.writeFileSync(tempPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
      fs.renameSync(tempPath, outputPath);
      completed.push(edition.year);
      console.log(`[WORLD PROCESSING] ${edition.year}: processed ${output.sourceMatchCount} matches, ${output.teams.length} teams.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      blockers.push(`${edition.year}: ${message}`);
      console.error(`[WORLD PROCESSING] ${edition.year}: BLOCKED: ${message}`);
    }
  }

  console.log(`[WORLD PROCESSING] Completed editions: ${completed.length ? completed.join(", ") : "none"}.`);
  if (blockers.length > 0) {
    console.log(`[WORLD PROCESSING] Blockers (${blockers.length}):`);
    for (const blocker of blockers) console.log(`  - ${blocker}`);
  }
  if (completed.length === 0) {
    console.error("[WORLD PROCESSING] No edition reached processed-ready state. Run data:audit-world-source-coverage, generate/export/review roles, then data:build-world-roles. Do not run the importer yet.");
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(`[WORLD PROCESSING] Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
