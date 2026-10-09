import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { loadVerifiedWorldRoles } from "./world-role-resolver";
import { WORLD_HISTORICAL_SOURCES } from "./data/world/historical-sources";

type TableRow = {
  id: string;
  name: string;
  teamCode: string;
  sourceUrl: string;
  values: Record<string, string>;
};

type PlayerStats = {
  fullName: string;
  sourcePlayerId: string;
  sourceUrl: string;
  teamCode: string;
  matches: number;
  innings: number;
  notOuts: number;
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

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "scripts/data/world/processed");
const STAGING = path.join(ROOT, "scripts/data/world/staging/historical-averages");
const REVIEW = path.join(ROOT, "scripts/data/world/historical-role-review.json");
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_BYTES = 10 * 1024 * 1024;

const TEAM_NAMES: Record<string, { name: string; shortName: string }> = {
  AUS: { name: "Australia", shortName: "AUS" },
  AUSL: { name: "Australia", shortName: "AUS" },
  ENG: { name: "England", shortName: "ENG" },
  IND: { name: "India", shortName: "IND" },
  NZ: { name: "New Zealand", shortName: "NZ" },
  PAK: { name: "Pakistan", shortName: "PAK" },
  WI: { name: "West Indies", shortName: "WI" },
  SL: { name: "Sri Lanka", shortName: "SL" },
  SA: { name: "South Africa", shortName: "SA" },
  SAF: { name: "South Africa", shortName: "SA" },
  ZIM: { name: "Zimbabwe", shortName: "ZIM" },
  ZIMB: { name: "Zimbabwe", shortName: "ZIM" },
  KEN: { name: "Kenya", shortName: "KEN" },
  BAN: { name: "Bangladesh", shortName: "BAN" },
  BANG: { name: "Bangladesh", shortName: "BAN" },
  UAE: { name: "United Arab Emirates", shortName: "UAE" },
  NED: { name: "Netherlands", shortName: "NED" },
  NETH: { name: "Netherlands", shortName: "NED" },
  SCOT: { name: "Scotland", shortName: "SCO" },
  SCO: { name: "Scotland", shortName: "SCO" },
  IRE: { name: "Ireland", shortName: "IRE" },
  CAN: { name: "Canada", shortName: "CAN" },
  EA: { name: "East Africa", shortName: "EA" },
  EAF: { name: "East Africa", shortName: "EA" },
  EASTAFRICA: { name: "East Africa", shortName: "EA" },
  ZIMBABWE: { name: "Zimbabwe", shortName: "ZIM" },
};

function fail(message: string): never {
  throw new Error(`[WORLD HISTORICAL AVERAGES] ${message}`);
}

function clean(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function numberOrNull(value: string): number | null {
  const v = clean(value).replace(/,/g, "");
  if (!v || v === "-" || v === "—" || v === "–") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function integer(value: string): number {
  const n = numberOrNull(value);
  return n === null ? 0 : Math.trunc(n);
}

function key(value: string): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseTeamCode(name: string): { displayName: string; teamCode: string } {
  const match = name.match(/\s*\(([^()]+)\)\s*$/);
  if (!match || match.index === undefined) {
    fail(`Player row has no country/team code: "${name}"`);
  }
  const displayName = clean(name.slice(0, match.index));
  const teamCode = clean(match[1]).toUpperCase().replace(/[^A-Z]/g, "");
  if (!displayName || !teamCode) fail(`Invalid player/team name "${name}"`);
  return { displayName, teamCode };
}

function canonicalPlayerId(href: string, pageUrl: string): string {
  const url = new URL(href, pageUrl);
  const allowedHosts = new Set(["cricketarchive.com", "www.cricketarchive.com", "cricketarchive.co.uk", "archive.nzc.nz"]);
  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    fail(`Unexpected player-link host: ${url.hostname}`);
  }

  let profilePath = decodeURIComponent(url.pathname).replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
  // CricketArchive sometimes serves the same archive through a regional mirror.
  // Normalize that mirror prefix so a player keeps the same source identity across editions.
  profilePath = profilePath.replace(/^\/archive(?=\/players?\/)/, "");
  if (!/\/players?\//i.test(profilePath)) {
    fail(`Could not identify a player profile URL: ${url.toString()}`);
  }
  return `cricketarchive:${profilePath}`;
}

function fallbackUrls(url: string): string[] {
  const parsed = new URL(url);
  const pathname = parsed.pathname;
  const is1999WorldCup = /ICC_World_Cup_1999/i.test(pathname);
  if (!is1999WorldCup) return [];

  // CricketArchive may block scripted requests on one host/path. Try its
  // regional mirror, the NZ archive mirror, and the legacy /Archive/Events/0
  // path. These are fetch fallbacks only; parsed statistics still pass through
  // the same table validation and tournament integrity checks.
  const candidates = new Set<string>();
  candidates.add(`https://www.cricketarchive.com${pathname.replace(/^\/Events\//i, "/CricketIreland/Events/")}`);
  candidates.add(`https://archive.nzc.nz${pathname}`);

  const legacyPath = pathname.replace(/^\/Events\//i, "/Archive/Events/0/");
  candidates.add(`https://cricketarchive.com${legacyPath}`);
  candidates.add(`https://www.cricketarchive.com${legacyPath}`);
  return [...candidates];
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const candidates = [...new Set([url, ...fallbackUrls(url)])];
  const errors: string[] = [];

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(candidate, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Build-Your-XI-Historical-Importer/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!response.ok) {
        errors.push(`${candidate} returned HTTP ${response.status}`);
        continue;
      }

      const finalUrl = response.url || candidate;
      const host = new URL(finalUrl).hostname.toLowerCase();
      if (!["cricketarchive.com", "www.cricketarchive.com", "cricketarchive.co.uk", "archive.nzc.nz"].includes(host)) {
        fail(`Unexpected redirect host ${host} from ${candidate}`);
      }

      const html = await response.text();
      if (!html.trim()) {
        errors.push(`Empty HTML response from ${finalUrl}`);
        continue;
      }
      if (Buffer.byteLength(html, "utf8") > MAX_BYTES) fail(`HTML response is too large: ${finalUrl}`);
      if (candidate !== url) console.warn(`[WORLD HISTORICAL AVERAGES] Source mirror succeeded: ${candidate}`);
      return { html, finalUrl };
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  fail(errors.join("; "));
}

function discoverAverageLinks(html: string, pageUrl: string): {
  batting: string;
  bowling: string;
  fielding: string | null;
} {
  const $ = cheerio.load(html);
  const found: Record<string, string> = {};

  $("a[href]").each((_, element) => {
    const text = clean($(element).text()).toLowerCase();
    const href = $(element).attr("href");
    if (!href) return;

    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      return;
    }

    const pathText = url.pathname.toLowerCase();
    if (text === "batting" || /batting_by_average\.html$/i.test(pathText)) found.batting ??= url.toString();
    if (text === "bowling" || /bowling_by_average\.html$/i.test(pathText)) found.bowling ??= url.toString();
    if (text === "fielding" || /fielding_by_average\.html$/i.test(pathText)) found.fielding ??= url.toString();
  });

  if (!found.batting || !found.bowling) {
    fail(`Could not discover both batting and bowling averages from ${pageUrl}`);
  }
  return { batting: found.batting, bowling: found.bowling, fielding: found.fielding ?? null };
}

/**
 * Find the header as a DOM node, using a loop rather than assigning to a
 * variable inside Cheerio's .each() callback. TypeScript cannot reliably
 * narrow a variable mutated from that callback, which caused the reported
 * `headerRow` type to become `never`.
 */
function findHeaderRow($: cheerio.CheerioAPI, table: cheerio.Cheerio<AnyNode>): AnyNode | undefined {
  const rows: AnyNode[] = table.find("tr").toArray();
  for (const row of rows) {
    const labels: string[] = $(row)
      .find("th,td")
      .toArray()
      .map((cell: AnyNode) => key($(cell).text()));

    if (
      labels.includes("name") &&
      (labels.includes("matches") || labels.includes("balls") || labels.includes("ct"))
    ) {
      return row;
    }
  }
  return undefined;
}

function parseAveragesTable(html: string, pageUrl: string): TableRow[] {
  const $ = cheerio.load(html);
  const output: TableRow[] = [];

  $("table").each((_, tableElement) => {
    const table = $(tableElement);
    const headerElement = findHeaderRow($, table);
    if (!headerElement) return;

    const headers: string[] = $(headerElement)
      .find("th,td")
      .toArray()
      .map((cell: AnyNode) => key($(cell).text()));

    const rows: AnyNode[] = table.find("tr").toArray();
    const headerIndex = rows.indexOf(headerElement);
    if (headerIndex < 0) return;

    const nameIndex = headers.indexOf("name");
    if (nameIndex < 0) return;

    for (const row of rows.slice(headerIndex + 1)) {
      const cells: AnyNode[] = $(row).find("th,td").toArray();
      if (cells.length < headers.length) continue;

      const values: Record<string, string> = {};
      headers.forEach((header: string, index: number) => {
        values[header] = clean($(cells[index]).text());
      });

      const nameCell = $(cells[nameIndex]);
      const link = nameCell.find("a[href]").first();
      const href = link.attr("href");
      const rawName = clean(nameCell.text());
      if (!href || !rawName) continue;

      const { displayName, teamCode } = parseTeamCode(rawName);
      const id = canonicalPlayerId(href, pageUrl);
      output.push({
        id,
        name: displayName,
        teamCode,
        sourceUrl: new URL(href, pageUrl).toString(),
        values,
      });
    }
  });

  if (output.length === 0) fail(`No player rows parsed from averages table: ${pageUrl}`);

  const unique = new Map<string, TableRow>();
  for (const row of output) {
    const existing = unique.get(row.id);
    if (existing && existing.teamCode !== row.teamCode) {
      fail(`Player identity appears for two teams: ${row.id}`);
    }
    unique.set(row.id, row);
  }
  return [...unique.values()];
}

function createPlayer(row: TableRow): PlayerStats {
  return {
    fullName: row.name,
    sourcePlayerId: row.id,
    sourceUrl: row.sourceUrl,
    teamCode: row.teamCode,
    matches: 0,
    innings: 0,
    notOuts: 0,
    runs: 0,
    batting_average: null,
    strike_rate: null,
    hundreds: 0,
    fifties: 0,
    wickets: 0,
    bowling_average: null,
    economy: null,
    catches: 0,
    stumpings: 0,
  };
}

function mergeBatting(players: Map<string, PlayerStats>, rows: TableRow[]): void {
  for (const row of rows) {
    const player = players.get(row.id) ?? createPlayer(row);
    const v = row.values;
    player.matches = integer(v.matches ?? "");
    player.innings = integer(v.inns ?? "");
    player.notOuts = integer(v.notout ?? "");
    player.runs = integer(v.runs ?? "");
    player.batting_average = numberOrNull(v.ave ?? "");
    player.strike_rate = numberOrNull(v.srate ?? "");
    player.hundreds = integer(v["100"] ?? "");
    player.fifties = integer(v["50"] ?? "");
    player.catches = integer(v.ct ?? "");
    player.stumpings = integer(v.st ?? "");
    players.set(row.id, player);
  }
}

function mergeBowling(players: Map<string, PlayerStats>, rows: TableRow[]): void {
  for (const row of rows) {
    const player = players.get(row.id) ?? createPlayer(row);
    const v = row.values;
    player.wickets = integer(v.wkts ?? "");
    player.bowling_average = numberOrNull(v.ave ?? "");
    player.economy = numberOrNull(v.econ ?? "");
    players.set(row.id, player);
  }
}

function mergeFielding(players: Map<string, PlayerStats>, rows: TableRow[]): void {
  for (const row of rows) {
    const player = players.get(row.id) ?? createPlayer(row);
    const v = row.values;
    if (v.ct !== undefined) player.catches = integer(v.ct);
    if (v.st !== undefined) player.stumpings = integer(v.st);
    players.set(row.id, player);
  }
}

function validatePlayer(player: PlayerStats, year: number): void {
  if (!player.sourcePlayerId.startsWith("cricketarchive:")) {
    fail(`${year}/${player.fullName}: invalid source identity`);
  }
  for (const field of ["matches", "innings", "runs", "hundreds", "fifties", "wickets", "catches", "stumpings"] as const) {
    if (!Number.isInteger(player[field]) || player[field] < 0) {
      fail(`${year}/${player.fullName}: invalid ${field}`);
    }
  }
  if (player.innings > player.matches) fail(`${year}/${player.fullName}: innings exceed matches`);
  if (player.hundreds > player.innings || player.fifties > player.innings) {
    fail(`${year}/${player.fullName}: invalid century/fifty totals`);
  }
}

async function processEdition(source: (typeof WORLD_HISTORICAL_SOURCES)[number]): Promise<void> {
  console.log(`[WORLD HISTORICAL AVERAGES] ${source.year}: fetching tournament page`);
  const tournament = await fetchHtml(source.archiveRoot);
  const links = discoverAverageLinks(tournament.html, tournament.finalUrl);

  const battingPage = await fetchHtml(links.batting);
  const bowlingPage = await fetchHtml(links.bowling);
  const battingRows = parseAveragesTable(battingPage.html, battingPage.finalUrl);
  const bowlingRows = parseAveragesTable(bowlingPage.html, bowlingPage.finalUrl);

  const players = new Map<string, PlayerStats>();
  mergeBatting(players, battingRows);
  mergeBowling(players, bowlingRows);

  let fieldingSource: string | null = null;
  if (links.fielding) {
    const fieldingPage = await fetchHtml(links.fielding);
    fieldingSource = fieldingPage.finalUrl;
    try {
      mergeFielding(players, parseAveragesTable(fieldingPage.html, fieldingPage.finalUrl));
    } catch (error) {
      console.warn(`[WORLD HISTORICAL AVERAGES] ${source.year}: fielding table skipped: ${String(error)}`);
    }
  }

  if (players.size === 0) fail(`${source.year}: no players found`);

  const roleMap = loadVerifiedWorldRoles();
  const unresolved: Array<{
    year: number;
    sourcePlayerId: string;
    fullName: string;
    teamCode: string;
    sourceUrl: string;
  }> = [];
  const teams = new Map<string, PlayerStats[]>();

  for (const player of players.values()) {
    validatePlayer(player, source.year);
    if (!TEAM_NAMES[player.teamCode]) {
      fail(`${source.year}/${player.fullName}: unknown team code "${player.teamCode}". Add its verified mapping to TEAM_NAMES.`);
    }
    if (!roleMap.has(player.sourcePlayerId)) {
      unresolved.push({
        year: source.year,
        sourcePlayerId: player.sourcePlayerId,
        fullName: player.fullName,
        teamCode: player.teamCode,
        sourceUrl: player.sourceUrl,
      });
    }
    const list = teams.get(player.teamCode) ?? [];
    list.push(player);
    teams.set(player.teamCode, list);
  }

  if (unresolved.length) {
    const old: unknown[] = fs.existsSync(REVIEW)
      ? JSON.parse(fs.readFileSync(REVIEW, "utf8")) as unknown[]
      : [];
    const combined = new Map<string, unknown>();
    for (const item of old) {
      const record = item as { sourcePlayerId?: string; year?: number };

      if (record.year === source.year) continue;
      combined.set(`${record.year}:${record.sourcePlayerId}`, item);
    }
    for (const item of unresolved) combined.set(`${item.year}:${item.sourcePlayerId}`, item);
    fs.mkdirSync(path.dirname(REVIEW), { recursive: true });
    fs.writeFileSync(REVIEW, `${JSON.stringify([...combined.values()], null, 2)}\n`, "utf8");
    console.warn(`[WORLD HISTORICAL AVERAGES] ${source.year}: ${unresolved.length} player roles are not verified. Statistics will be written to staging only; this edition will NOT be playable.`);
  }

  const outputTeams = [...teams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([teamCode, records]) => {
      const teamInfo = TEAM_NAMES[teamCode];
      const outputPlayers = records
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map(player => {
          const role = roleMap.get(player.sourcePlayerId);
          const sources = [...new Set([player.sourceUrl, links.batting, links.bowling, ...(fieldingSource ? [fieldingSource] : [])])];
          return {
            fullName: player.fullName,
            sourcePlayerId: player.sourcePlayerId,
            role: role?.role ?? null,
            roleSource: role?.source ?? null,
            stats: {
              matches: player.matches,
              innings: player.innings,
              runs: player.runs,
              batting_average: player.batting_average,
              strike_rate: player.strike_rate,
              hundreds: player.hundreds,
              fifties: player.fifties,
              wickets: player.wickets,
              bowling_average: player.bowling_average,
              economy: player.economy,
              catches: player.catches,
              stumpings: player.stumpings,
            },
            sources,
          };
        });
      return {
        name: teamInfo.name,
        shortName: teamInfo.shortName,
        slug: slugify(teamInfo.name),
        players: outputPlayers,
        sources: [...new Set([tournament.finalUrl, links.batting, links.bowling, ...(fieldingSource ? [fieldingSource] : [])])],
      };
    });

  const allPlayers = outputTeams.flatMap(team => team.players);
  const topRuns = Math.max(...allPlayers.map(player => player.stats.runs));
  const topWickets = Math.max(...allPlayers.map(player => player.stats.wickets));

  if (source.integrityChecks?.expectedTopRuns !== undefined && topRuns !== source.integrityChecks.expectedTopRuns) {
    fail(`${source.year}: top runs ${topRuns}; expected ${source.integrityChecks.expectedTopRuns}.`);
  }
  if (source.integrityChecks?.expectedTopWickets !== undefined && topWickets !== source.integrityChecks.expectedTopWickets) {
    fail(`${source.year}: top wickets ${topWickets}; expected ${source.integrityChecks.expectedTopWickets}.`);
  }

  const output = {
    year: source.year,
    seasonName: source.seasonName,
    format: "ODI" as const,
    competition: "ICC Men's Cricket World Cup" as const,
    oversPerInnings: source.oversPerInnings,
    teams: outputTeams,
    sources: [...new Set([tournament.finalUrl, links.batting, links.bowling, ...(fieldingSource ? [fieldingSource] : [])])],
  };

  if (unresolved.length > 0) {
    const stagingOutput = {
      ...output,
      status: "staging-unverified-roles" as const,
      playable: false as const,
      unresolvedRoleCount: unresolved.length,
      unresolvedPlayers: unresolved,
    };
    fs.mkdirSync(STAGING, { recursive: true });
    const stagingPath = path.join(STAGING, `${source.year}.json`);
    fs.writeFileSync(stagingPath, `${JSON.stringify(stagingOutput, null, 2)}\n`, "utf8");
    console.log(`[WORLD HISTORICAL AVERAGES] ${source.year}: staged ${outputTeams.length} teams, ${allPlayers.length} players at ${stagingPath}; top runs ${topRuns}, top wickets ${topWickets}. NOT PLAYABLE until all roles are verified.`);
    return;
  }

  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, `${source.year}.json`), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`[WORLD HISTORICAL AVERAGES] ${source.year}: ${outputTeams.length} teams, ${allPlayers.length} players; top runs ${topRuns}, top wickets ${topWickets}`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const requestedYear = arg ? Number(arg) : null;
  if (arg && (!Number.isInteger(requestedYear) || requestedYear === null)) {
    fail(`Invalid year argument "${arg}".`);
  }

  // No year argument means one complete batch for every configured historical
  // edition through 1999. A single broken source must not prevent later editions
  // from being staged and included in the role-review report.
  const sources = WORLD_HISTORICAL_SOURCES.filter(source =>
    requestedYear === null ? source.year <= 1999 : source.year === requestedYear,
  );
  if (requestedYear !== null && sources.length === 0) {
    fail(`No historical source configured for year ${requestedYear}`);
  }

  console.log("[WORLD HISTORICAL AVERAGES] Starting.");
  console.log(`[WORLD HISTORICAL AVERAGES] Batch editions: ${sources.map(source => source.year).join(", ")}`);

  const succeeded: number[] = [];
  const failed: Array<{ year: number; error: string }> = [];

  for (const source of sources) {
    try {
      await processEdition(source);
      succeeded.push(source.year);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ year: source.year, error: message });
      console.error(`[WORLD HISTORICAL AVERAGES] ${source.year}: FAILED: ${message}`);
      // Continue to the next edition so the batch collects as much data as
      // possible in one run. Failed editions are never reported as successful.
    }
  }

  console.log("");
  console.log("========================================");
  console.log("WORLD HISTORICAL AVERAGES — BATCH SUMMARY");
  console.log("========================================");
  console.log(`Configured editions : ${sources.length}`);
  console.log(`Completed editions  : ${succeeded.length}${succeeded.length ? ` (${succeeded.join(", ")})` : ""}`);
  console.log(`Failed editions     : ${failed.length}`);
  for (const item of failed) console.log(`- ${item.year}: ${item.error}`);
  console.log("========================================");

  if (failed.length > 0) {
    throw new Error(`${failed.length} historical edition(s) failed. Review the per-edition errors above; successful editions were still processed.`);
  }

  console.log("[WORLD HISTORICAL AVERAGES] Completed.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
