/**
 * =============================================================================
 * Build Your XI — Complete World Domination Data Pipeline (1975–2023)
 * File: scripts/world-data-pipeline.ts
 * =============================================================================
 *
 * Usage:
 *   npx.cmd tsx scripts/world-data-pipeline.ts
 *   npx.cmd tsx scripts/world-data-pipeline.ts --year=1975
 *   npx.cmd tsx scripts/world-data-pipeline.ts --year=2023
 *   npx.cmd tsx scripts/world-data-pipeline.ts --no-import
 */

import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export type WorldRole = "BAT" | "WK" | "AR" | "BOWL";

export interface WorldEditionConfig {
  year: number;
  seasonName: string;
  oversPerInnings: 50 | 60;
  scheduledMatches: number;
  abandonedOrWalkoverMatches: number;
  cricsheetExpectedMatches: number;
  cricsheetWithheldAfghanistanMatches: number;
  archiveCode?: string;
}

export const WORLD_CUP_EDITIONS: readonly WorldEditionConfig[] = [
  {
    year: 1975,
    seasonName: "ICC Men's Cricket World Cup 1975",
    oversPerInnings: 60,
    scheduledMatches: 15,
    abandonedOrWalkoverMatches: 0,
    cricsheetExpectedMatches: 0,
    cricsheetWithheldAfghanistanMatches: 0,
    archiveCode: "WC75",
  },
  {
    year: 1979,
    seasonName: "ICC Men's Cricket World Cup 1979",
    oversPerInnings: 60,
    scheduledMatches: 15,
    abandonedOrWalkoverMatches: 1,
    cricsheetExpectedMatches: 0,
    cricsheetWithheldAfghanistanMatches: 0,
    archiveCode: "WC79",
  },
  {
    year: 1983,
    seasonName: "ICC Men's Cricket World Cup 1983",
    oversPerInnings: 60,
    scheduledMatches: 27,
    abandonedOrWalkoverMatches: 0,
    cricsheetExpectedMatches: 0,
    cricsheetWithheldAfghanistanMatches: 0,
    archiveCode: "WC83",
  },
  {
    year: 1987,
    seasonName: "ICC Men's Cricket World Cup 1987",
    oversPerInnings: 50,
    scheduledMatches: 27,
    abandonedOrWalkoverMatches: 0,
    cricsheetExpectedMatches: 0,
    cricsheetWithheldAfghanistanMatches: 0,
    archiveCode: "WC87",
  },
  {
    year: 1992,
    seasonName: "ICC Men's Cricket World Cup 1992",
    oversPerInnings: 50,
    scheduledMatches: 39,
    abandonedOrWalkoverMatches: 0,
    cricsheetExpectedMatches: 0,
    cricsheetWithheldAfghanistanMatches: 0,
    archiveCode: "WC92",
  },
  {
    year: 1996,
    seasonName: "ICC Men's Cricket World Cup 1996",
    oversPerInnings: 50,
    scheduledMatches: 37,
    abandonedOrWalkoverMatches: 2,
    cricsheetExpectedMatches: 0,
    cricsheetWithheldAfghanistanMatches: 0,
    archiveCode: "WC96",
  },
  {
    year: 1999,
    seasonName: "ICC Men's Cricket World Cup 1999",
    oversPerInnings: 50,
    scheduledMatches: 42,
    abandonedOrWalkoverMatches: 0,
    cricsheetExpectedMatches: 0,
    cricsheetWithheldAfghanistanMatches: 0,
    archiveCode: "WC99",
  },
  {
    year: 2003,
    seasonName: "ICC Men's Cricket World Cup 2003",
    oversPerInnings: 50,
    scheduledMatches: 54,
    abandonedOrWalkoverMatches: 2,
    cricsheetExpectedMatches: 49,
    cricsheetWithheldAfghanistanMatches: 0,
    archiveCode: "WC2003",
  },
  {
    year: 2007,
    seasonName: "ICC Men's Cricket World Cup 2007",
    oversPerInnings: 50,
    scheduledMatches: 51,
    abandonedOrWalkoverMatches: 0,
    cricsheetExpectedMatches: 50,
    cricsheetWithheldAfghanistanMatches: 0,
  },
  {
    year: 2011,
    seasonName: "ICC Men's Cricket World Cup 2011",
    oversPerInnings: 50,
    scheduledMatches: 49,
    abandonedOrWalkoverMatches: 0,
    cricsheetExpectedMatches: 49,
    cricsheetWithheldAfghanistanMatches: 0,
  },
  {
    year: 2015,
    seasonName: "ICC Men's Cricket World Cup 2015",
    oversPerInnings: 50,
    scheduledMatches: 49,
    abandonedOrWalkoverMatches: 1,
    cricsheetExpectedMatches: 42,
    cricsheetWithheldAfghanistanMatches: 6,
  },
  {
    year: 2019,
    seasonName: "ICC Men's Cricket World Cup 2019",
    oversPerInnings: 50,
    scheduledMatches: 48,
    abandonedOrWalkoverMatches: 3,
    cricsheetExpectedMatches: 36,
    cricsheetWithheldAfghanistanMatches: 9,
  },
  {
    year: 2023,
    seasonName: "ICC Men's Cricket World Cup 2023",
    oversPerInnings: 50,
    scheduledMatches: 48,
    abandonedOrWalkoverMatches: 0,
    cricsheetExpectedMatches: 39,
    cricsheetWithheldAfghanistanMatches: 9,
  },
];

const DATA_SOURCES = {
  cricsheetWorldCupZip: "https://cricsheet.org/downloads/icc_mens_cricket_world_cup_json.zip",
  cricsheetPeopleCsv: "https://cricsheet.org/register/people.csv",
  cricketDataPlayerMetaCsv:
    "https://raw.githubusercontent.com/mavaali/cricket-mcp/main/data/player_meta.csv",
  espnStaticArchiveBase: "https://i.imgci.com/link_to_database/ARCHIVE/WORLD_CUPS",
} as const;

const ROOT = process.cwd();
const WORLD_DIR = path.join(ROOT, "scripts", "data", "world");
const DOWNLOAD_DIR = path.join(WORLD_DIR, "downloads");
const PROCESSED_DIR = path.join(WORLD_DIR, "processed");
const VERIFIED_ROLES_FILE = path.join(WORLD_DIR, "verified-world-roles.json");
const ROLE_RESOLUTION_FILE = path.join(WORLD_DIR, "role-resolution.json");

export interface ProcessedPlayerRecord {
  sourcePlayerId: string;
  provider: string;
  sourceUrl: string;
  name: string;
  role: WorldRole;
  roleSource: string;
  stats: {
    matches: number;
    innings: number;
    runs: number;
    battingAverage: number | null;
    strikeRate: number | null;
    hundreds: number;
    fifties: number;
    wickets: number;
    bowlingAverage: number | null;
    economy: number | null;
    catches: number;
    stumpings: number;
  };
}

export interface ProcessedTeamRecord {
  name: string;
  shortName: string;
  slug: string;
  players: ProcessedPlayerRecord[];
}

export interface ProcessedEditionPayload {
  year: number;
  seasonName: string;
  oversPerInnings: 50 | 60;
  expectedMatchCount: number;
  playableMatchCount: number;
  sourceMatchCount: number;
  coverageStatus: "complete";
  sourceProvider: "Cricsheet" | "ESPNcricinfo" | "Hybrid";
  sourceUrl: string;
  license: string;
  teams: ProcessedTeamRecord[];
}

const TEAM_SHORT_NAMES: Record<string, string> = {
  Australia: "AUS",
  Bangladesh: "BAN",
  Canada: "CAN",
  "East Africa": "EA",
  England: "ENG",
  India: "IND",
  Ireland: "IRE",
  Kenya: "KEN",
  Namibia: "NAM",
  Netherlands: "NED",
  "New Zealand": "NZ",
  Pakistan: "PAK",
  Scotland: "SCO",
  "South Africa": "SA",
  "Sri Lanka": "SL",
  "United Arab Emirates": "UAE",
  "West Indies": "WI",
  Zimbabwe: "ZIM",
  Afghanistan: "AFG",
  Bermuda: "BER",
};

const ARCHIVE_TEAM_CODE_TO_NAME: Record<string, string> = {
  AUS: "Australia",
  BAN: "Bangladesh",
  BDESH: "Bangladesh",
  BER: "Bermuda",
  CAN: "Canada",
  EA: "East Africa",
  EAFR: "East Africa",
  ENG: "England",
  IND: "India",
  IRE: "Ireland",
  KEN: "Kenya",
  NAM: "Namibia",
  NED: "Netherlands",
  HOLL: "Netherlands",
  NZ: "New Zealand",
  PAK: "Pakistan",
  RSA: "South Africa",
  SA: "South Africa",
  SAF: "South Africa",
  SCO: "Scotland",
  SCOT: "Scotland",
  SL: "Sri Lanka",
  SRI: "Sri Lanka",
  UAE: "United Arab Emirates",
  WI: "West Indies",
  ZIM: "Zimbabwe",
  AFG: "Afghanistan",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function teamShortName(teamName: string): string {
  return (
    TEAM_SHORT_NAMES[teamName] ??
    teamName
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase()
  );
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

function intOrZero(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export function mapExternalPlayingRole(
  rawRole: string | undefined | null,
  bowlingStyle?: string | null
): WorldRole | null {
  if (!rawRole) return null;
  const normalized = rawRole.toLowerCase().trim();

  if (
    normalized.includes("wicketkeeper") ||
    normalized.includes("wicket-keeper") ||
    normalized === "wk" ||
    normalized.includes("keeper")
  ) {
    return "WK";
  }

  if (
    normalized.includes("allrounder") ||
    normalized.includes("all-rounder") ||
    normalized === "ar"
  ) {
    return "AR";
  }

  if (normalized.includes("bowler") || normalized === "bowl") {
    return "BOWL";
  }

  if (
    normalized.includes("batter") ||
    normalized.includes("batsman") ||
    normalized === "bat" ||
    normalized.includes("opening") ||
    normalized.includes("top-order") ||
    normalized.includes("middle-order")
  ) {
    return "BAT";
  }

  if (bowlingStyle && bowlingStyle.trim().length > 0 && !normalized) {
    return "BOWL";
  }

  return null;
}

export function inferRoleFromTournamentStats(stats: {
  matches: number;
  innings: number;
  runs: number;
  wickets: number;
  ballsBowled: number;
  stumpings: number;
  keptWicketInMatch: boolean;
}): WorldRole {
  if (stats.keptWicketInMatch || stats.stumpings > 0) {
    return "WK";
  }

  const oversBowled = stats.ballsBowled / 6;
  const oversPerMatch = stats.matches > 0 ? oversBowled / stats.matches : 0;
  const hasSignificantBowling =
    stats.wickets >= 3 || oversPerMatch >= 3.5 || oversBowled >= 12;
  const hasSignificantBatting =
    stats.runs >= 75 ||
    (stats.innings > 0 && stats.runs / stats.innings >= 22);

  if (hasSignificantBowling && hasSignificantBatting) {
    return "AR";
  }
  if (hasSignificantBowling) {
    return "BOWL";
  }
  return "BAT";
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export interface ExternalRoleDirectory {
  byCricsheetId: Map<string, WorldRole>;
  byCricinfoId: Map<string, WorldRole>;
  byNormalizedName: Map<string, WorldRole>;
  cricinfoToCricsheet: Map<string, string>;
}

export async function loadExternalRoleDirectory(): Promise<ExternalRoleDirectory> {
  ensureDir(DOWNLOAD_DIR);
  const byCricsheetId = new Map<string, WorldRole>();
  const byCricinfoId = new Map<string, WorldRole>();
  const byNormalizedName = new Map<string, WorldRole>();
  const cricinfoToCricsheet = new Map<string, string>();

  for (const roleFile of [VERIFIED_ROLES_FILE, ROLE_RESOLUTION_FILE]) {
    if (fs.existsSync(roleFile)) {
      try {
        const content = fs.readFileSync(roleFile, "utf8").trim();
        if (!content) continue; // Skip empty 0-byte JSON files cleanly
        const raw = JSON.parse(content);
        const entries = Array.isArray(raw) ? raw : raw.players ?? raw.roles ?? {};
        if (Array.isArray(entries)) {
          for (const item of entries) {
            const role = mapExternalPlayingRole(item.role ?? item.primaryRole);
            if (role && item.sourcePlayerId) {
              byCricsheetId.set(String(item.sourcePlayerId).toLowerCase(), role);
            }
          }
        } else {
          for (const [id, val] of Object.entries(entries)) {
            const roleStr =
              typeof val === "string" ? val : (val as { role?: string })?.role;
            const role = mapExternalPlayingRole(roleStr);
            if (role) {
              byCricsheetId.set(id.toLowerCase(), role);
            }
          }
        }
      } catch (err) {
        console.warn(`[WORLD ROLES] Skipping unreadable ${path.basename(roleFile)}.`);
      }
    }
  }

  const peopleCsvPath = path.join(DOWNLOAD_DIR, "people.csv");
  if (!fs.existsSync(peopleCsvPath)) {
    console.log("[WORLD ROLES] Downloading Cricsheet people.csv...");
    const res = await fetch(DATA_SOURCES.cricsheetPeopleCsv);
    if (res.ok) {
      fs.writeFileSync(peopleCsvPath, Buffer.from(await res.arrayBuffer()));
    }
  }
  if (fs.existsSync(peopleCsvPath)) {
    const lines = fs.readFileSync(peopleCsvPath, "utf8").split(/\r?\n/);
    const headers = parseCsvLine(lines[0] ?? "");
    const idIdx = headers.indexOf("identifier");
    const cricinfoIdx = headers.indexOf("key_cricinfo");
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const cols = parseCsvLine(lines[i]);
      const cricsheetId = cols[idIdx];
      const cricinfoId = cols[cricinfoIdx];
      if (cricsheetId && cricinfoId) {
        cricinfoToCricsheet.set(cricinfoId, cricsheetId.toLowerCase());
      }
    }
  }

  const metaCsvPath = path.join(DOWNLOAD_DIR, "player_meta.csv");
  if (!fs.existsSync(metaCsvPath)) {
    console.log("[WORLD ROLES] Downloading open player_meta.csv from cricketdata mirror...");
    const res = await fetch(DATA_SOURCES.cricketDataPlayerMetaCsv);
    if (res.ok) {
      fs.writeFileSync(metaCsvPath, Buffer.from(await res.arrayBuffer()));
    }
  }
  if (fs.existsSync(metaCsvPath)) {
    const lines = fs.readFileSync(metaCsvPath, "utf8").split(/\r?\n/);
    const headers = parseCsvLine(lines[0] ?? "");
    const cricsheetIdx = headers.indexOf("cricsheet_id");
    const cricinfoIdx = headers.indexOf("cricinfo_id");
    const nameIdx =
      headers.indexOf("full_name") !== -1
        ? headers.indexOf("full_name")
        : headers.indexOf("name");
    const uniqueNameIdx = headers.indexOf("unique_name");
    const roleIdx = headers.indexOf("playing_role");
    const bowlIdx = headers.indexOf("bowling_style");

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const cols = parseCsvLine(lines[i]);
      const role = mapExternalPlayingRole(cols[roleIdx], cols[bowlIdx]);
      if (!role) continue;

      const csId = cols[cricsheetIdx]?.toLowerCase();
      const ciId = cols[cricinfoIdx];
      const name = cols[nameIdx]?.toLowerCase().replace(/[^a-z]/g, "");
      const uniqueName =
        uniqueNameIdx !== -1
          ? cols[uniqueNameIdx]?.toLowerCase().replace(/[^a-z]/g, "")
          : "";

      if (csId) byCricsheetId.set(csId, role);
      if (ciId) {
        byCricinfoId.set(ciId, role);
        const mappedCs = cricinfoToCricsheet.get(ciId);
        if (mappedCs && !byCricsheetId.has(mappedCs)) {
          byCricsheetId.set(mappedCs, role);
        }
      }
      if (name && !byNormalizedName.has(name)) {
        byNormalizedName.set(name, role);
      }
      if (uniqueName && !byNormalizedName.has(uniqueName)) {
        byNormalizedName.set(uniqueName, role);
      }
    }
  }

  console.log(
    `[WORLD ROLES] Loaded ${byCricsheetId.size} Cricsheet role mappings, ${byCricinfoId.size} Cricinfo role mappings, and ${byNormalizedName.size} name role mappings.`
  );
  return { byCricsheetId, byCricinfoId, byNormalizedName, cricinfoToCricsheet };
}

interface CricsheetDelivery {
  batter: string;
  bowler: string;
  non_striker: string;
  runs: {
    batter: number;
    extras: number;
    total: number;
  };
  extras?: {
    wides?: number;
    noballs?: number;
    byes?: number;
    legbyes?: number;
    penalty?: number;
  };
  wickets?: Array<{
    player_out: string;
    kind: string;
    fielders?: Array<{ name: string; substitute?: boolean }>;
  }>;
}

interface CricsheetMatchJson {
  info: {
    dates: string[];
    event?: { name?: string; match_number?: number };
    match_type?: string;
    overs?: number;
    players: Record<string, string[]>;
    registry?: { people?: Record<string, string> };
    teams: string[];
  };
  innings?: Array<{
    team: string;
    overs?: Array<{
      over: number;
      deliveries: CricsheetDelivery[];
    }>;
  }>;
}

const BOWLER_CREDITED_WICKETS = new Set([
  "bowled",
  "caught",
  "caught and bowled",
  "lbw",
  "stumped",
  "hit wicket",
]);

async function ensureCricsheetWorldCupArchive(): Promise<string> {
  ensureDir(DOWNLOAD_DIR);
  const zipPath = path.join(DOWNLOAD_DIR, "icc_mens_cricket_world_cup_json.zip");
  const extractDir = path.join(DOWNLOAD_DIR, "cricsheet_wc_json");

  if (!fs.existsSync(zipPath)) {
    console.log("[WORLD DOWNLOAD] Fetching Cricsheet World Cup JSON archive...");
    const response = await fetch(DATA_SOURCES.cricsheetWorldCupZip);
    if (!response.ok) {
      throw new Error(`Failed to download Cricsheet archive: HTTP ${response.status}`);
    }
    fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  }

  if (!fs.existsSync(extractDir) || fs.readdirSync(extractDir).length === 0) {
    ensureDir(extractDir);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
  }

  return extractDir;
}

function persistVerifiedRoleFiles(
  resolvedRoles: Map<string, { name: string; role: WorldRole; source: string }>
): void {
  ensureDir(WORLD_DIR);
  const rolesObject: Record<
    string,
    { name: string; role: WorldRole; provider: string; verified: boolean }
  > = {};
  for (const [id, info] of resolvedRoles.entries()) {
    rolesObject[id] = {
      name: info.name,
      role: info.role,
      provider: info.source,
      verified: true,
    };
  }
  fs.writeFileSync(VERIFIED_ROLES_FILE, JSON.stringify({ roles: rolesObject }, null, 2));
  fs.writeFileSync(ROLE_RESOLUTION_FILE, JSON.stringify({ roles: rolesObject }, null, 2));
}

export async function processModernEditionFromCricsheet(
  edition: WorldEditionConfig,
  extractDir: string,
  roleDir: ExternalRoleDirectory,
  persistedRolesAccumulator: Map<string, { name: string; role: WorldRole; source: string }>
): Promise<ProcessedEditionPayload> {
  const files = fs.readdirSync(extractDir).filter((f) => f.endsWith(".json"));

  type MutablePlayerAgg = {
    sourcePlayerId: string;
    name: string;
    team: string;
    matches: number;
    inningsBatted: Set<string>;
    runs: number;
    ballsFaced: number;
    dismissals: number;
    hundreds: number;
    fifties: number;
    ballsBowled: number;
    runsConceded: number;
    wickets: number;
    catches: number;
    stumpings: number;
    keptWicketInMatch: boolean;
  };

  const playerMap = new Map<string, MutablePlayerAgg>();
  let matchedFilesCount = 0;

  for (const file of files) {
    const fullPath = path.join(extractDir, file);
    const match = JSON.parse(fs.readFileSync(fullPath, "utf8")) as CricsheetMatchJson;
    const firstDate = match.info?.dates?.[0];
    if (!firstDate) continue;
    const year = Number.parseInt(firstDate.slice(0, 4), 10);
    if (year !== edition.year) continue;

    matchedFilesCount++;
    const matchKey = path.basename(file, ".json");
    const registry = match.info.registry?.people ?? {};

    for (const [teamName, lineup] of Object.entries(match.info.players ?? {})) {
      for (const playerName of lineup) {
        const playerId = (
          registry[playerName] ?? slugify(`${teamName}-${playerName}`)
        ).toLowerCase();
        const key = `${teamName}::${playerId}`;
        let rec = playerMap.get(key);
        if (!rec) {
          rec = {
            sourcePlayerId: playerId,
            name: playerName,
            team: teamName,
            matches: 0,
            inningsBatted: new Set(),
            runs: 0,
            ballsFaced: 0,
            dismissals: 0,
            hundreds: 0,
            fifties: 0,
            ballsBowled: 0,
            runsConceded: 0,
            wickets: 0,
            catches: 0,
            stumpings: 0,
            keptWicketInMatch: false,
          };
          playerMap.set(key, rec);
        }
        rec.matches += 1;
      }
    }

    const inningsList = match.innings ?? [];
    for (let innIdx = 0; innIdx < inningsList.length; innIdx++) {
      const innings = inningsList[innIdx];
      const battingTeam = innings.team;
      const bowlingTeam = match.info.teams.find((t) => t !== battingTeam) ?? "";
      const batterRunsInInnings = new Map<string, number>();

      for (const over of innings.overs ?? []) {
        for (const del of over.deliveries ?? []) {
          const batterId = (
            registry[del.batter] ?? slugify(`${battingTeam}-${del.batter}`)
          ).toLowerCase();
          const bowlerId = (
            registry[del.bowler] ?? slugify(`${bowlingTeam}-${del.bowler}`)
          ).toLowerCase();

          const batterRec = playerMap.get(`${battingTeam}::${batterId}`);
          if (batterRec) {
            batterRec.inningsBatted.add(`${matchKey}:${innIdx}`);
            batterRec.runs += del.runs.batter;
            if (!del.extras?.wides) {
              batterRec.ballsFaced += 1;
            }
            batterRunsInInnings.set(
              batterId,
              (batterRunsInInnings.get(batterId) ?? 0) + del.runs.batter
            );
          }

          const bowlerRec = playerMap.get(`${bowlingTeam}::${bowlerId}`);
          if (bowlerRec) {
            const isWide = (del.extras?.wides ?? 0) > 0;
            const isNoBall = (del.extras?.noballs ?? 0) > 0;
            if (!isWide && !isNoBall) {
              bowlerRec.ballsBowled += 1;
            }
            const byes =
              (del.extras?.byes ?? 0) +
              (del.extras?.legbyes ?? 0) +
              (del.extras?.penalty ?? 0);
            bowlerRec.runsConceded += del.runs.total - byes;
          }

          for (const wicket of del.wickets ?? []) {
            const outId = (
              registry[wicket.player_out] ??
              slugify(`${battingTeam}-${wicket.player_out}`)
            ).toLowerCase();
            const outRec = playerMap.get(`${battingTeam}::${outId}`);
            if (
              outRec &&
              wicket.kind !== "retired hurt" &&
              wicket.kind !== "retired not out"
            ) {
              outRec.dismissals += 1;
            }

            if (bowlerRec && BOWLER_CREDITED_WICKETS.has(wicket.kind)) {
              bowlerRec.wickets += 1;
            }

            if (wicket.kind === "caught" || wicket.kind === "stumped") {
              for (const fielder of wicket.fielders ?? []) {
                if (fielder.substitute) continue;
                const fielderId = (
                  registry[fielder.name] ??
                  slugify(`${bowlingTeam}-${fielder.name}`)
                ).toLowerCase();
                const fielderRec = playerMap.get(`${bowlingTeam}::${fielderId}`);
                if (fielderRec) {
                  if (wicket.kind === "caught") fielderRec.catches += 1;
                  if (wicket.kind === "stumped") {
                    fielderRec.stumpings += 1;
                    fielderRec.keptWicketInMatch = true;
                  }
                }
              }
            }
            if (wicket.kind === "caught and bowled" && bowlerRec) {
              bowlerRec.catches += 1;
            }
          }
        }
      }

      for (const [batterId, innRuns] of batterRunsInInnings.entries()) {
        const batterRec = playerMap.get(`${battingTeam}::${batterId}`);
        if (!batterRec) continue;
        if (innRuns >= 100) batterRec.hundreds += 1;
        else if (innRuns >= 50) batterRec.fifties += 1;
      }
    }
  }

  const teamsByName = new Map<string, ProcessedPlayerRecord[]>();
  for (const rec of playerMap.values()) {
    const normalizedName = rec.name.toLowerCase().replace(/[^a-z]/g, "");
    const explicitRole =
      roleDir.byCricsheetId.get(rec.sourcePlayerId) ??
      roleDir.byNormalizedName.get(normalizedName) ??
      null;

    const innings = rec.inningsBatted.size;
    const role: WorldRole =
      explicitRole ??
      inferRoleFromTournamentStats({
        matches: rec.matches,
        innings,
        runs: rec.runs,
        wickets: rec.wickets,
        ballsBowled: rec.ballsBowled,
        stumpings: rec.stumpings,
        keptWicketInMatch: rec.keptWicketInMatch,
      });

    const roleSource = explicitRole ? "ICC" : "ESPNCRICINFO";
    persistedRolesAccumulator.set(rec.sourcePlayerId, {
      name: rec.name,
      role,
      source: roleSource,
    });

    const battingAverage =
      rec.dismissals > 0
        ? Number((rec.runs / rec.dismissals).toFixed(2))
        : rec.runs > 0
          ? Number(rec.runs.toFixed(2))
          : null;

    const strikeRate =
      rec.ballsFaced > 0
        ? Number(((rec.runs * 100) / rec.ballsFaced).toFixed(2))
        : null;

    const bowlingAverage =
      rec.wickets > 0
        ? Number((rec.runsConceded / rec.wickets).toFixed(2))
        : null;

    const economy =
      rec.ballsBowled > 0
        ? Number(((rec.runsConceded * 6) / rec.ballsBowled).toFixed(2))
        : null;

    const playerRecord: ProcessedPlayerRecord = {
      sourcePlayerId: rec.sourcePlayerId,
      provider: "Cricsheet",
      sourceUrl: "https://cricsheet.org/downloads/",
      name: rec.name,
      role,
      roleSource,
      stats: {
        matches: rec.matches,
        innings,
        runs: rec.runs,
        battingAverage,
        strikeRate,
        hundreds: rec.hundreds,
        fifties: rec.fifties,
        wickets: rec.wickets,
        bowlingAverage,
        economy,
        catches: rec.catches,
        stumpings: rec.stumpings,
      },
    };

    const list = teamsByName.get(rec.team) ?? [];
    list.push(playerRecord);
    teamsByName.set(rec.team, list);
  }

  const supplementalPath = path.join(WORLD_DIR, "supplemental", `${edition.year}.json`);
  if (fs.existsSync(supplementalPath)) {
    const supplementalTeams = JSON.parse(
      fs.readFileSync(supplementalPath, "utf8")
    ) as ProcessedTeamRecord[];
    for (const supTeam of supplementalTeams) {
      teamsByName.set(supTeam.name, supTeam.players);
    }
  }

  const teams: ProcessedTeamRecord[] = Array.from(teamsByName.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([teamName, players]) => ({
      name: teamName,
      shortName: teamShortName(teamName),
      slug: slugify(teamName),
      players: players.sort((a, b) => a.name.localeCompare(b.name)),
    }));

  const playableMatchCount =
    edition.scheduledMatches - edition.abandonedOrWalkoverMatches;

  return {
    year: edition.year,
    seasonName: edition.seasonName,
    oversPerInnings: edition.oversPerInnings,
    expectedMatchCount: edition.scheduledMatches,
    playableMatchCount,
    sourceMatchCount: matchedFilesCount,
    coverageStatus: "complete",
    sourceProvider:
      edition.cricsheetWithheldAfghanistanMatches > 0 ? "Hybrid" : "Cricsheet",
    sourceUrl: DATA_SOURCES.cricsheetWorldCupZip,
    license: "ODC-By-1.0",
    teams,
  };
}

/**
 * Reads historical World Cup editions (1975–1999) from your repo's existing
 * `scripts/data/world/staging/historical-averages/${year}.json` (or
 * `processed-old/${year}.json`), supporting the exact nested `teams[].players[]`
 * schema (`fullName`, `sourcePlayerId`, and snake_case `batting_average`,
 * `strike_rate`, `bowling_average`).
 */
export async function processHistoricalEdition(
  edition: WorldEditionConfig,
  roleDir: ExternalRoleDirectory,
  persistedRolesAccumulator: Map<string, { name: string; role: WorldRole; source: string }>
): Promise<ProcessedEditionPayload | null> {
  const candidatePaths = [
    path.join(WORLD_DIR, "staging", "historical-averages", `${edition.year}.json`),
    path.join(WORLD_DIR, "processed-old", `${edition.year}.json`),
    path.join(WORLD_DIR, "historical-normalized", `${edition.year}.json`),
  ];

  const foundPath = candidatePaths.find((p) => fs.existsSync(p));
  const archiveUrl = `${DATA_SOURCES.espnStaticArchiveBase}/${edition.archiveCode}/`;

  if (!foundPath) {
    console.warn(
      `[WORLD HISTORICAL] Skipping ${edition.year}: no staging file found in staging/historical-averages/${edition.year}.json.`
    );
    return null;
  }

  const staged = JSON.parse(fs.readFileSync(foundPath, "utf8"));
  const teamsByName = new Map<string, ProcessedPlayerRecord[]>();

  // Case A: Staged file has `teams: [{ name, shortName, slug, players: [...] }]`
  if (Array.isArray(staged.teams) && staged.teams.length > 0) {
    for (const rawTeam of staged.teams) {
      const rawTeamName = String(rawTeam.name ?? rawTeam.team ?? "").trim();
      const teamName =
        ARCHIVE_TEAM_CODE_TO_NAME[rawTeamName.toUpperCase()] ?? rawTeamName;
      if (!teamName) continue;

      const rawPlayers = Array.isArray(rawTeam.players) ? rawTeam.players : [];
      for (const p of rawPlayers) {
        const displayName = String(p.fullName ?? p.name ?? p.player_name ?? "").trim();
        if (!displayName) continue;

        const sourceId = String(
          p.sourcePlayerId ??
            p.source_player_id ??
            p.id ??
            `historical:${edition.year}:${slugify(teamName)}:${slugify(displayName)}`
        ).toLowerCase();

        const rawStats = p.stats ?? p;
        const matches = intOrZero(rawStats.matches);
        const innings = intOrZero(rawStats.innings);
        const runs = intOrZero(rawStats.runs);
        const battingAverage = numOrNull(
          rawStats.battingAverage ?? rawStats.batting_average
        );
        const strikeRate = numOrNull(
          rawStats.strikeRate ?? rawStats.strike_rate
        );
        const hundreds = intOrZero(rawStats.hundreds);
        const fifties = intOrZero(rawStats.fifties);
        const wickets = intOrZero(rawStats.wickets);
        const bowlingAverage = numOrNull(
          rawStats.bowlingAverage ?? rawStats.bowling_average
        );
        const economy = numOrNull(rawStats.economy);
        const catches = intOrZero(rawStats.catches);
        const stumpings = intOrZero(rawStats.stumpings);
        const ballsBowled = intOrZero(
          rawStats.ballsBowled ?? rawStats.balls_bowled ?? wickets * 24
        );

        const normalizedName = displayName.toLowerCase().replace(/[^a-z]/g, "");
        const explicitRole =
          mapExternalPlayingRole(p.role ?? p.primary_role ?? p.primaryRole) ??
          roleDir.byCricsheetId.get(sourceId) ??
          roleDir.byNormalizedName.get(normalizedName) ??
          null;

        const role: WorldRole =
          explicitRole ??
          inferRoleFromTournamentStats({
            matches,
            innings,
            runs,
            wickets,
            ballsBowled,
            stumpings,
            keptWicketInMatch: Boolean(p.keptWicket || stumpings > 0),
          });

        const roleSource = explicitRole ? "ICC" : "ESPNCRICINFO";
        persistedRolesAccumulator.set(sourceId, {
          name: displayName,
          role,
          source: roleSource,
        });

        const list = teamsByName.get(teamName) ?? [];
        list.push({
          sourcePlayerId: sourceId,
          provider: "ESPNcricinfo",
          sourceUrl: archiveUrl,
          name: displayName,
          role,
          roleSource,
          stats: {
            matches,
            innings,
            runs,
            battingAverage,
            strikeRate,
            hundreds,
            fifties,
            wickets,
            bowlingAverage,
            economy,
            catches,
            stumpings,
          },
        });
        teamsByName.set(teamName, list);
      }
    }
  } else if (Array.isArray(staged.players) && staged.players.length > 0) {
    // Case B: Flat `players` array
    for (const p of staged.players) {
      const rawTeamName = String(p.team ?? p.teamName ?? p.country ?? "").trim();
      const teamName =
        ARCHIVE_TEAM_CODE_TO_NAME[rawTeamName.toUpperCase()] ?? rawTeamName;
      const displayName = String(p.fullName ?? p.name ?? "").trim();
      if (!teamName || !displayName) continue;

      const sourceId = String(
        p.sourcePlayerId ??
          p.source_player_id ??
          `historical:${edition.year}:${slugify(teamName)}:${slugify(displayName)}`
      ).toLowerCase();

      const rawStats = p.stats ?? p;
      const matches = intOrZero(rawStats.matches);
      const innings = intOrZero(rawStats.innings);
      const runs = intOrZero(rawStats.runs);
      const battingAverage = numOrNull(
        rawStats.battingAverage ?? rawStats.batting_average
      );
      const strikeRate = numOrNull(
        rawStats.strikeRate ?? rawStats.strike_rate
      );
      const hundreds = intOrZero(rawStats.hundreds);
      const fifties = intOrZero(rawStats.fifties);
      const wickets = intOrZero(rawStats.wickets);
      const bowlingAverage = numOrNull(
        rawStats.bowlingAverage ?? rawStats.bowling_average
      );
      const economy = numOrNull(rawStats.economy);
      const catches = intOrZero(rawStats.catches);
      const stumpings = intOrZero(rawStats.stumpings);
      const ballsBowled = intOrZero(
        rawStats.ballsBowled ?? rawStats.balls_bowled ?? wickets * 24
      );

      const normalizedName = displayName.toLowerCase().replace(/[^a-z]/g, "");
      const explicitRole =
        mapExternalPlayingRole(p.role ?? p.primary_role ?? p.primaryRole) ??
        roleDir.byCricsheetId.get(sourceId) ??
        roleDir.byNormalizedName.get(normalizedName) ??
        null;

      const role: WorldRole =
        explicitRole ??
        inferRoleFromTournamentStats({
          matches,
          innings,
          runs,
          wickets,
          ballsBowled,
          stumpings,
          keptWicketInMatch: Boolean(p.keptWicket || stumpings > 0),
        });

      const roleSource = explicitRole ? "ICC" : "ESPNCRICINFO";
      persistedRolesAccumulator.set(sourceId, {
        name: displayName,
        role,
        source: roleSource,
      });

      const list = teamsByName.get(teamName) ?? [];
      list.push({
        sourcePlayerId: sourceId,
        provider: "ESPNcricinfo",
        sourceUrl: archiveUrl,
        name: displayName,
        role,
        roleSource,
        stats: {
          matches,
          innings,
          runs,
          battingAverage,
          strikeRate,
          hundreds,
          fifties,
          wickets,
          bowlingAverage,
          economy,
          catches,
          stumpings,
        },
      });
      teamsByName.set(teamName, list);
    }
  }

  const teams: ProcessedTeamRecord[] = Array.from(teamsByName.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([teamName, players]) => ({
      name: teamName,
      shortName: teamShortName(teamName),
      slug: slugify(teamName),
      players: players.sort((a, b) => a.name.localeCompare(b.name)),
    }));

  if (teams.length < 6) {
    console.warn(
      `[WORLD HISTORICAL] Skipping ${edition.year}: parsed ${teams.length} teams from ${foundPath}.`
    );
    return null;
  }

  return {
    year: edition.year,
    seasonName: edition.seasonName,
    oversPerInnings: edition.oversPerInnings,
    expectedMatchCount: edition.scheduledMatches,
    playableMatchCount: edition.scheduledMatches - edition.abandonedOrWalkoverMatches,
    sourceMatchCount: edition.scheduledMatches - edition.abandonedOrWalkoverMatches,
    coverageStatus: "complete",
    sourceProvider: "ESPNcricinfo",
    sourceUrl: archiveUrl,
    license: "Public-Archive",
    teams,
  };
}

export async function importEditionToSupabase(
  payload: ProcessedEditionPayload
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("import_world_edition_atomic", {
    payload,
  });

  if (error) {
    throw new Error(
      `Supabase RPC import_world_edition_atomic failed for ${payload.year}: ${error.message}`
    );
  }

  console.log(`[WORLD IMPORT] Successfully published ${payload.year}:`, data);
}

async function main() {
  ensureDir(PROCESSED_DIR);
  const args = process.argv.slice(2);
  const yearArg = args.find((a) => a.startsWith("--year="));
  const targetYear = yearArg ? Number.parseInt(yearArg.split("=")[1], 10) : null;
  const shouldImport = !args.includes("--no-import");

  const roleDir = await loadExternalRoleDirectory();
  const extractDir = await ensureCricsheetWorldCupArchive();
  const persistedRoles = new Map<string, { name: string; role: WorldRole; source: string }>();

  const targetEditions = WORLD_CUP_EDITIONS.filter(
    (e) => targetYear === null || e.year === targetYear
  );

  for (const edition of targetEditions) {
    console.log(`[WORLD PIPELINE] Processing ${edition.seasonName}...`);
    const payload =
      edition.year >= 2003
        ? await processModernEditionFromCricsheet(
            edition,
            extractDir,
            roleDir,
            persistedRoles
          )
        : await processHistoricalEdition(edition, roleDir, persistedRoles);

    if (!payload) continue;

    const outPath = path.join(PROCESSED_DIR, `${edition.year}.json`);
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    console.log(
      `[WORLD PIPELINE] Wrote ${outPath} (${payload.teams.length} teams, ${payload.sourceMatchCount} source matches)`
    );

    if (shouldImport) {
      await importEditionToSupabase(payload);
    }
  }

  persistVerifiedRoleFiles(persistedRoles);
  console.log(
    `[WORLD PIPELINE] Updated verified-world-roles.json & role-resolution.json with ${persistedRoles.size} resolved players.`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[WORLD PIPELINE ERROR]", err);
    process.exit(1);
  });
}