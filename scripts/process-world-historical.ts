import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import {
  WORLD_HISTORICAL_SOURCES,
  type HistoricalWorldSource,
} from "./data/world/historical-sources";

type WorldRole = "BAT" | "WK" | "AR" | "BOWL";

type MatchManifestEntry = {
  id: string;
  url: string;
  file: string;
};

type EditionManifest = {
  year: number;
  seasonName: string;
  provider: "ESPNcricinfo";
  archiveRoot: string;
  expectedMatchCount: number;
  retrievedAt: string;
  matches: MatchManifestEntry[];
};

type HistoricalPlayer = {
  fullName: string;
  sourcePlayerId: string;
  profileUrl: string | null;
  teams: Set<string>;
  matches: Set<string>;
  innings: number;
  runs: number;
  dismissals: number;
  ballsFaced: number;
  wickets: number;
  runsConceded: number;
  legalBallsBowled: number;
  catches: number;
  stumpings: number;
  fifties: number;
  hundreds: number;
};

type HistoricalTeam = {
  name: string;
  players: Map<string, HistoricalPlayer>;
};

type ParsedBattingRow = {
  name: string;
  sourcePlayerId: string;
  profileUrl: string | null;
  runs: number;
  balls: number;
  dismissal: string;
};

type ParsedBowlingRow = {
  name: string;
  sourcePlayerId: string;
  profileUrl: string | null;
  overs: string;
  runs: number;
  wickets: number;
};

type ProcessedSeason = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50 | 60;
  teams: Array<{
    name: string;
    shortName: string;
    slug: string;
    players: Array<{
      fullName: string;
      sourcePlayerId: string;
      role: WorldRole;
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
      sources: Array<{
        provider: string;
        url: string;
      }>;
      roleSource: {
        provider: string;
        url: string;
        retrievedAt: string;
      };
    }>;
    sources: string[];
  }>;
  sources: string[];
};

const ROOT = process.cwd();

const CACHE_ROOT = path.join(
  ROOT,
  "scripts",
  "data",
  "world",
  ".cache",
  "historical"
);

const OUTPUT_ROOT = path.join(
  ROOT,
  "scripts",
  "data",
  "world",
  "processed"
);

const ROLE_CACHE_ROOT = path.join(CACHE_ROOT, "roles");

const PROFILE_REQUEST_TIMEOUT_MS = 20_000;
const PROFILE_CONCURRENCY = 4;

function fail(message: string): never {
  throw new Error(`[WORLD HISTORICAL PROCESSING] ${message}`);
}

function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shortName(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase();
  }

  return words
    .map((word) => word[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value: string): string {
  return cleanPlayerName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function numeric(value: string): number | null {
  const normalized = normalizeText(value).replace(/,/g, "").trim();

  if (
    !normalized ||
    normalized === "-" ||
    normalized === "—" ||
    normalized === "DNB"
  ) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function cleanPlayerName(value: string): string {
  return normalizeText(value)
    .replace(/^[*†‡]+\s*/g, "")
    .replace(/\s*\(c\)\s*/gi, " ")
    .replace(/\s*\(wk\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the provider identity when ESPNcricinfo exposes a numeric ID.
 *
 * When no provider ID can be extracted, the value is explicitly marked
 * unresolved so it cannot be mistaken for a real ESPNcricinfo ID.
 */
function playerIdFromProfile(
  profileUrl: string | null,
  name: string,
  team: string
): string {
  if (profileUrl) {
    const numericId = profileUrl.match(
      /(?:player|cricketers)[^0-9]{0,30}(\d{3,8})(?:\.html)?(?:[/?#]|$)/i
    )?.[1];

    if (numericId) {
      return `espncricinfo:${numericId}`;
    }
  }

  return `espncricinfo:unresolved:${sha256(
    `${slugify(team)}|${slugify(name)}`
  ).slice(0, 24)}`;
}

function oversToLegalBalls(overs: string): number {
  const normalized = normalizeText(overs);
  const parts = normalized.split(".");

  if (parts.length !== 2) {
    const whole = numeric(normalized);
    return whole === null ? 0 : Math.round(whole * 6);
  }

  const whole = Number(parts[0]);
  const balls = Number(parts[1]);

  if (
    !Number.isInteger(whole) ||
    !Number.isInteger(balls) ||
    whole < 0 ||
    balls < 0 ||
    balls > 5
  ) {
    throw new Error(`Invalid over notation: ${overs}`);
  }

  return whole * 6 + balls;
}

function extractPlayerFromRow(
  $: cheerio.CheerioAPI,
  row: Element,
  team: string
) {
  const firstCell = $(row).children("td,th").first();

  /*
   * Cheerio's text() does not accept a separator argument in the
   * installed version. Normalize whitespace after extracting text.
   */
  const name = cleanPlayerName(firstCell.text());

  const href = firstCell.find("a[href]").first().attr("href") ?? null;

  let profileUrl: string | null = null;

  if (href) {
    try {
      profileUrl = new URL(
        href,
        "https://www.espncricinfo.com/"
      ).toString();
    } catch {
      profileUrl = null;
    }
  }

  return {
    name,
    sourcePlayerId: playerIdFromProfile(profileUrl, name, team),
    profileUrl,
  };
}

function rowCells(
  $: cheerio.CheerioAPI,
  row: Element
): string[] {
  return $(row)
    .children("td,th")
    .map((_index, cell) => normalizeText($(cell).text()))
    .get();
}

function findHeaderRow(
  $: cheerio.CheerioAPI,
  table: Element,
  predicate: (row: string[]) => boolean
): { row: Element; values: string[] } | null {
  const rowElements = $(table).children("tbody").length
    ? $(table).children("tbody").children("tr")
    : $(table).children("tr");

  let found: { row: Element; values: string[] } | null = null;

  rowElements.each((_index, row) => {
    if (found) {
      return;
    }

    const values = rowCells($, row);

    if (predicate(values)) {
      found = { row, values };
    }
  });

  return found;
}

function parseBattingTable(
  $: cheerio.CheerioAPI,
  table: Element,
  team: string
): ParsedBattingRow[] {
  const header = findHeaderRow($, table, (row) => {
    const upper = row.map((value) => value.toUpperCase());

    return (
      upper.includes("R") &&
      (upper.includes("B") || upper.includes("BALLS")) &&
      (upper.includes("4") || upper.includes("4S")) &&
      (upper.includes("6") || upper.includes("6S"))
    );
  });

  if (!header) {
    return [];
  }

  const upperHeader = header.values.map((value) => value.toUpperCase());

  const runsIndex = upperHeader.indexOf("R");

  const ballsIndex =
    upperHeader.indexOf("B") !== -1
      ? upperHeader.indexOf("B")
      : upperHeader.indexOf("BALLS");

  const rowElements = $(table).children("tbody").length
    ? $(table).children("tbody").children("tr")
    : $(table).children("tr");

  const result: ParsedBattingRow[] = [];
  let started = false;

  rowElements.each((_index, row) => {
    const values = rowCells($, row);

    if (row === header.row) {
      started = true;
      return;
    }

    if (!started || values.length === 0) {
      return;
    }

    const name = cleanPlayerName(values[0] ?? "");

    if (
      !name ||
      /^(extras?|total|fall of wickets|did not bat|yet to bat)$/i.test(name)
    ) {
      return;
    }

    const runs = numeric(values[runsIndex] ?? "");
    const balls = numeric(values[ballsIndex] ?? "");

    if (runs === null || balls === null) {
      return;
    }

    const player = extractPlayerFromRow($, row, team);

    result.push({
      name: player.name || name,
      sourcePlayerId: player.sourcePlayerId,
      profileUrl: player.profileUrl,
      runs,
      balls,
      dismissal: values[1] ?? "",
    });
  });

  return result;
}

function parseBowlingTable(
  $: cheerio.CheerioAPI,
  table: Element,
  team: string
): ParsedBowlingRow[] {
  const header = findHeaderRow($, table, (row) => {
    const upper = row.map((value) => value.toUpperCase());

    return (
      (upper.includes("O") || upper.includes("OVERS")) &&
      (upper.includes("M") || upper.includes("MDNS")) &&
      upper.includes("R") &&
      (upper.includes("W") || upper.includes("WKTS"))
    );
  });

  if (!header) {
    return [];
  }

  const upperHeader = header.values.map((value) => value.toUpperCase());

  const oversIndex =
    upperHeader.indexOf("O") !== -1
      ? upperHeader.indexOf("O")
      : upperHeader.indexOf("OVERS");

  const runsIndex = upperHeader.indexOf("R");

  const wicketsIndex =
    upperHeader.indexOf("W") !== -1
      ? upperHeader.indexOf("W")
      : upperHeader.indexOf("WKTS");

  const rowElements = $(table).children("tbody").length
    ? $(table).children("tbody").children("tr")
    : $(table).children("tr");

  const result: ParsedBowlingRow[] = [];
  let started = false;

  rowElements.each((_index, row) => {
    const values = rowCells($, row);

    if (row === header.row) {
      started = true;
      return;
    }

    if (!started || values.length === 0) {
      return;
    }

    const name = cleanPlayerName(values[0] ?? "");

    if (
      !name ||
      /^(extras?|total|fall of wickets|did not bat|yet to bat)$/i.test(name)
    ) {
      return;
    }

    const runs = numeric(values[runsIndex] ?? "");
    const wickets = numeric(values[wicketsIndex] ?? "");
    const overs = values[oversIndex] ?? "";

    if (runs === null || wickets === null || !overs) {
      return;
    }

    const player = extractPlayerFromRow($, row, team);

    result.push({
      name: player.name || name,
      sourcePlayerId: player.sourcePlayerId,
      profileUrl: player.profileUrl,
      overs,
      runs,
      wickets,
    });
  });

  return result;
}

function extractTeams(
  $: cheerio.CheerioAPI,
  plainText: string
): [string, string] | null {
  const candidates = [
    $("title").first().text(),
    $("h1").first().text(),
    $("h2").first().text(),
  ]
    .map(normalizeText)
    .filter(Boolean);

  for (const candidate of candidates) {
    const match = candidate.match(
      /^(.+?)\s+v(?:\.|ersus)?\s+(.+?)(?:\s+at\s+|,|\s+-\s+|$)/i
    );

    if (match) {
      return [
        normalizeText(match[1]),
        normalizeText(match[2]),
      ];
    }
  }

  const inningsTeams = [
    ...plainText.matchAll(/\b([^:]{2,60})\s+innings\b/gi),
  ]
    .map((match) => normalizeText(match[1]))
    .filter(Boolean);

  const unique = [...new Set(inningsTeams)];

  return unique.length >= 2
    ? [unique[0], unique[1]]
    : null;
}

function findPlayerForTeam(
  playersById: Map<string, HistoricalPlayer>,
  name: string,
  team: string
): HistoricalPlayer | undefined {
  const target = normalizeName(name);

  for (const player of playersById.values()) {
    if (
      player.teams.has(team) &&
      normalizeName(player.fullName) === target
    ) {
      return player;
    }
  }

  return undefined;
}

function ensurePlayer(
  playersById: Map<string, HistoricalPlayer>,
  fullName: string,
  team: string,
  profileUrl: string | null
): HistoricalPlayer {
  const existingByTeam = findPlayerForTeam(
    playersById,
    fullName,
    team
  );

  if (existingByTeam) {
    if (!existingByTeam.profileUrl && profileUrl) {
      existingByTeam.profileUrl = profileUrl;
    }

    return existingByTeam;
  }

  const sourcePlayerId = playerIdFromProfile(
    profileUrl,
    fullName,
    team
  );

  const existingById = playersById.get(sourcePlayerId);

  if (existingById) {
    existingById.teams.add(team);

    if (!existingById.profileUrl && profileUrl) {
      existingById.profileUrl = profileUrl;
    }

    return existingById;
  }

  const player: HistoricalPlayer = {
    fullName: cleanPlayerName(fullName),
    sourcePlayerId,
    profileUrl,
    teams: new Set([team]),
    matches: new Set(),
    innings: 0,
    runs: 0,
    dismissals: 0,
    ballsFaced: 0,
    wickets: 0,
    runsConceded: 0,
    legalBallsBowled: 0,
    catches: 0,
    stumpings: 0,
    fifties: 0,
    hundreds: 0,
  };

  playersById.set(sourcePlayerId, player);

  return player;
}

function parseDismissalFielding(
  dismissal: string,
  bowlingTeam: string,
  matchId: string,
  playersById: Map<string, HistoricalPlayer>
): void {
  const normalized = normalizeText(dismissal);

  if (
    !normalized ||
    /\b(?:not out|retired hurt|retired not out)\b/i.test(normalized)
  ) {
    return;
  }

  const wicketKeeper = normalized.match(
    /^st\.?\s+(.+?)\s+b\s+/i
  )?.[1];

  if (wicketKeeper) {
    const keeper = ensurePlayer(
      playersById,
      cleanPlayerName(wicketKeeper),
      bowlingTeam,
      null
    );

    keeper.matches.add(matchId);
    keeper.stumpings += 1;

    return;
  }

  const caughtAndBowled = normalized.match(
    /^c\s*&\s*b\s+(.+)$/i
  )?.[1];

  if (caughtAndBowled) {
    const bowler = ensurePlayer(
      playersById,
      cleanPlayerName(caughtAndBowled),
      bowlingTeam,
      null
    );

    bowler.matches.add(matchId);
    bowler.catches += 1;

    return;
  }

  const caughtFielder = normalized.match(
    /^c(?:aught)?\s+(.+?)\s+b\s+/i
  )?.[1];

  if (caughtFielder) {
    const fielder = ensurePlayer(
      playersById,
      cleanPlayerName(caughtFielder),
      bowlingTeam,
      null
    );

    fielder.matches.add(matchId);
    fielder.catches += 1;
  }
}

function parseMatch(
  html: string,
  source: HistoricalWorldSource,
  matchId: string,
  matchUrl: string
): {
  teams: [string, string] | null;
  players: Map<string, HistoricalPlayer>;
} {
  const $ = cheerio.load(html);

  /*
   * Cheerio's root().text() also takes no separator argument.
   */
  const plainText = normalizeText($.root().text());

  const teams = extractTeams($, plainText);
  const players = new Map<string, HistoricalPlayer>();

  if (!teams) {
    return { teams: null, players };
  }

  const battingTables: Element[] = [];
  const bowlingTables: Element[] = [];

  $("table").each((_index, table) => {
    const header = findHeaderRow($, table, (row) => {
      const upper = row.map((value) => value.toUpperCase());

      return (
        upper.includes("R") &&
        (upper.includes("B") || upper.includes("BALLS")) &&
        (upper.includes("4") || upper.includes("4S")) &&
        (upper.includes("6") || upper.includes("6S"))
      );
    });

    if (header) {
      battingTables.push(table);
      return;
    }

    const bowlingHeader = findHeaderRow($, table, (row) => {
      const upper = row.map((value) => value.toUpperCase());

      return (
        (upper.includes("O") || upper.includes("OVERS")) &&
        (upper.includes("M") || upper.includes("MDNS")) &&
        upper.includes("R") &&
        (upper.includes("W") || upper.includes("WKTS"))
      );
    });

    if (bowlingHeader) {
      bowlingTables.push(table);
    }
  });

  /*
   * A World Cup ODI scorecard must contain exactly two innings.
   * Do not silently accept malformed scorecards.
   */
  if (battingTables.length !== 2) {
    throw new Error(
      `${source.year}/${matchId}: expected exactly 2 batting tables, found ${battingTables.length}.`
    );
  }

  if (bowlingTables.length !== 2) {
    throw new Error(
      `${source.year}/${matchId}: expected exactly 2 bowling tables, found ${bowlingTables.length}.`
    );
  }

  const inningsCount = 2;

  for (
    let inningsIndex = 0;
    inningsIndex < inningsCount;
    inningsIndex += 1
  ) {
    const battingTeam = teams[inningsIndex % 2];
    const bowlingTeam = teams[(inningsIndex + 1) % 2];

    const battingTable = battingTables[inningsIndex];

    if (battingTable) {
      for (const batter of parseBattingTable(
        $,
        battingTable,
        battingTeam
      )) {
        const player = ensurePlayer(
          players,
          batter.name,
          battingTeam,
          batter.profileUrl
        );

        player.matches.add(matchId);
        player.innings += 1;
        player.runs += batter.runs;
        player.ballsFaced += batter.balls;

        if (batter.runs >= 100) {
          player.hundreds += 1;
        } else if (batter.runs >= 50) {
          player.fifties += 1;
        }

        if (
          batter.dismissal &&
          !/\b(?:not out|retired hurt|retired not out)\b/i.test(
            batter.dismissal
          )
        ) {
          player.dismissals += 1;
        }

        parseDismissalFielding(
          batter.dismissal,
          bowlingTeam,
          matchId,
          players
        );
      }
    }

    const bowlingTable = bowlingTables[inningsIndex];

    if (bowlingTable) {
      for (const bowler of parseBowlingTable(
        $,
        bowlingTable,
        bowlingTeam
      )) {
        const player = ensurePlayer(
          players,
          bowler.name,
          bowlingTeam,
          bowler.profileUrl
        );

        player.matches.add(matchId);
        player.wickets += bowler.wickets;
        player.runsConceded += bowler.runs;
        player.legalBallsBowled += oversToLegalBalls(
          bowler.overs
        );
      }
    }
  }

  return { teams, players };
}

function extractRoleFromProfileText(
  text: string
): WorldRole | null {
  const match = text.match(
    /\bRole\s*[:\-]\s*(Wicketkeeper(?:[- ]batter)?|Batter|Batsman|Batswoman|Batting Allrounder|Bowling Allrounder|Allrounder|Bowler)\b/i
  );

  if (!match) {
    return null;
  }

  const rawRole = normalizeText(match[1]).toLowerCase();

  if (rawRole.includes("wicketkeeper")) {
    return "WK";
  }

  if (rawRole.includes("allrounder")) {
    return "AR";
  }

  if (rawRole.includes("bowler")) {
    return "BOWL";
  }

  return "BAT";
}

async function fetchProfileRole(
  profileUrl: string
): Promise<{ role: WorldRole; url: string }> {
  const cacheKey = sha256(profileUrl).slice(0, 32);

  ensureDirectory(ROLE_CACHE_ROOT);

  const cachePath = path.join(
    ROLE_CACHE_ROOT,
    `${cacheKey}.json`
  );

  if (fs.existsSync(cachePath)) {
    return JSON.parse(
      fs.readFileSync(cachePath, "utf8")
    ) as { role: WorldRole; url: string };
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    PROFILE_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(profileUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Build-Your-XI historical data importer/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const role = extractRoleFromProfileText(
      normalizeText($.root().text())
    );

    if (!role) {
      throw new Error(
        `No explicit role found on ${profileUrl}.`
      );
    }

    const result = {
      role,
      url: profileUrl,
    };

    fs.writeFileSync(
      cachePath,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8"
    );

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveRoles(
  players: HistoricalPlayer[]
): Promise<
  Map<string, { role: WorldRole; url: string }>
> {
  const resolved = new Map<
    string,
    { role: WorldRole; url: string }
  >();

  const unresolved = new Map<string, HistoricalPlayer>();

  for (const player of players) {
    if (!player.profileUrl) {
      unresolved.set(player.sourcePlayerId, player);
    }
  }

  let cursor = 0;

  const workers = Array.from({
    length: Math.min(PROFILE_CONCURRENCY, players.length),
  }).map(async () => {
    while (cursor < players.length) {
      const index = cursor;
      cursor += 1;

      const player = players[index];

      if (!player.profileUrl) {
        continue;
      }

      try {
        const role = await fetchProfileRole(
          player.profileUrl
        );

        resolved.set(player.sourcePlayerId, role);
      } catch (error) {
        unresolved.set(player.sourcePlayerId, player);

        console.warn(
          `[WORLD HISTORICAL ROLES] ${player.fullName}: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`
        );
      }
    }
  });

  await Promise.all(workers);

  if (unresolved.size > 0) {
    const reportPath = path.join(
      CACHE_ROOT,
      "historical-unresolved-roles.json"
    );

    fs.writeFileSync(
      reportPath,
      `${JSON.stringify(
        [...unresolved.values()].map((player) => ({
          sourcePlayerId: player.sourcePlayerId,
          fullName: player.fullName,
          profileUrl: player.profileUrl,
          teams: [...player.teams],
        })),
        null,
        2
      )}\n`,
      "utf8"
    );

    fail(
      `${unresolved.size} historical players have no explicit role source. Review ${reportPath}. No historical processed edition was written.`
    );
  }

  return resolved;
}

function toProcessedPlayer(
  player: HistoricalPlayer,
  role: { role: WorldRole; url: string },
  matchUrls: string[]
) {
  const battingAverage =
    player.dismissals > 0
      ? Number(
          (player.runs / player.dismissals).toFixed(2)
        )
      : null;

  const strikeRate =
    player.ballsFaced > 0
      ? Number(
          (
            (player.runs / player.ballsFaced) *
            100
          ).toFixed(2)
        )
      : null;

  const bowlingAverage =
    player.wickets > 0
      ? Number(
          (
            player.runsConceded / player.wickets
          ).toFixed(2)
        )
      : null;

  const economy =
    player.legalBallsBowled > 0
      ? Number(
          (
            player.runsConceded /
            (player.legalBallsBowled / 6)
          ).toFixed(2)
        )
      : null;

  return {
    fullName: player.fullName,
    sourcePlayerId: player.sourcePlayerId,
    role: role.role,
    stats: {
      matches: player.matches.size,
      innings: player.innings,
      runs: player.runs,
      batting_average: battingAverage,
      strike_rate: strikeRate,
      hundreds: player.hundreds,
      fifties: player.fifties,
      wickets: player.wickets,
      bowling_average: bowlingAverage,
      economy,
      catches: player.catches,
      stumpings: player.stumpings,
    },
    sources: matchUrls.map((url) => ({
      provider: "ESPNcricinfo",
      url,
    })),
    roleSource: {
      provider: "ESPNcricinfo",
      url: role.url,
      retrievedAt: new Date().toISOString(),
    },
  };
}

function readManifest(year: number): EditionManifest {
  const filePath = path.join(
    CACHE_ROOT,
    String(year),
    "manifest.json"
  );

  if (!fs.existsSync(filePath)) {
    fail(`Missing manifest: ${filePath}`);
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  ) as EditionManifest;
}

async function processEdition(
  source: HistoricalWorldSource
): Promise<void> {
  const manifest = readManifest(source.year);

  if (manifest.year !== source.year) {
    fail(
      `${source.year}: manifest year mismatch. Found ${manifest.year}.`
    );
  }

  if (manifest.provider !== source.provider) {
    fail(
      `${source.year}: manifest provider mismatch. Found ${manifest.provider}.`
    );
  }

  if (
    manifest.matches.length !==
    source.expectedMatchCount
  ) {
    fail(
      `${source.year}: expected ${source.expectedMatchCount} matches, found ${manifest.matches.length}.`
    );
  }

  const matchIds = new Set<string>();
  const matchUrls = new Set<string>();

  for (const entry of manifest.matches) {
    if (matchIds.has(entry.id)) {
      fail(
        `${source.year}: duplicate match ID ${entry.id}.`
      );
    }

    if (matchUrls.has(entry.url)) {
      fail(
        `${source.year}: duplicate match URL ${entry.url}.`
      );
    }

    matchIds.add(entry.id);
    matchUrls.add(entry.url);
  }

  const teams = new Map<string, HistoricalTeam>();
  const players = new Map<string, HistoricalPlayer>();
  const matchUrlsByPlayer = new Map<
    string,
    Set<string>
  >();

  if (manifest.matches.length === 0) {
    fail(`${source.year}: manifest contains no matches.`);
  }

  for (const entry of manifest.matches) {
    const htmlPath = path.join(
      CACHE_ROOT,
      String(source.year),
      entry.file
    );

    if (!fs.existsSync(htmlPath)) {
      fail(`Missing scorecard HTML: ${htmlPath}`);
    }

    const html = fs.readFileSync(htmlPath, "utf8");

    const parsed = parseMatch(
      html,
      source,
      entry.id,
      entry.url
    );

    if (
      !parsed.teams ||
      parsed.teams.length !== 2 ||
      parsed.teams[0] === parsed.teams[1]
    ) {
      fail(
        `${source.year}: invalid team pair in ${entry.url}.`
      );
    }

    if (parsed.players.size === 0) {
      fail(
        `${source.year}: no player statistics extracted from ${entry.url}.`
      );
    }

    for (const teamName of parsed.teams) {
      if (!teams.has(teamName)) {
        teams.set(teamName, {
          name: teamName,
          players: new Map(),
        });
      }
    }

    for (const [playerId, player] of parsed.players) {
      const existing = players.get(playerId);

      if (!existing) {
        players.set(playerId, player);
      } else {
        existing.matches = new Set([
          ...existing.matches,
          ...player.matches,
        ]);

        existing.teams = new Set([
          ...existing.teams,
          ...player.teams,
        ]);

        existing.innings += player.innings;
        existing.runs += player.runs;
        existing.dismissals += player.dismissals;
        existing.ballsFaced += player.ballsFaced;
        existing.wickets += player.wickets;
        existing.runsConceded += player.runsConceded;
        existing.legalBallsBowled +=
          player.legalBallsBowled;
        existing.catches += player.catches;
        existing.stumpings += player.stumpings;
        existing.fifties += player.fifties;
        existing.hundreds += player.hundreds;

        if (
          !existing.profileUrl &&
          player.profileUrl
        ) {
          existing.profileUrl = player.profileUrl;
        }
      }

      const urls =
        matchUrlsByPlayer.get(playerId) ??
        new Set<string>();

      urls.add(entry.url);
      matchUrlsByPlayer.set(playerId, urls);
    }
  }

  const allPlayers = [...players.values()];

  console.log(
    `[WORLD HISTORICAL PROCESSING] ${source.year}: ${allPlayers.length} player records discovered.`
  );

  const roles = await resolveRoles(allPlayers);

  for (const player of allPlayers) {
    for (const teamName of player.teams) {
      const team = teams.get(teamName);

      if (team) {
        team.players.set(
          player.sourcePlayerId,
          player
        );
      }
    }
  }

  const processed: ProcessedSeason = {
    year: source.year,
    seasonName: source.seasonName,
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: source.oversPerInnings,

    teams: [...teams.values()]
      .map((team) => ({
        name: team.name,
        shortName: shortName(team.name),
        slug: slugify(team.name),

        players: [...team.players.values()]
          .map((player) => {
            const role = roles.get(
              player.sourcePlayerId
            );

            if (!role) {
              fail(
                `Missing resolved role for ${source.year}/${team.name}/${player.fullName}.`
              );
            }

            return toProcessedPlayer(
              player,
              role,
              [
                ...(matchUrlsByPlayer.get(
                  player.sourcePlayerId
                ) ?? []),
              ]
            );
          })
          .sort((a, b) =>
            a.fullName.localeCompare(b.fullName)
          ),

        sources: [source.archiveRoot],
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      ),

    sources: [source.archiveRoot],
  };

  ensureDirectory(OUTPUT_ROOT);

  const outputPath = path.join(
    OUTPUT_ROOT,
    `${source.year}.json`
  );

  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(processed, null, 2)}\n`,
    "utf8"
  );

  console.log(
    `[WORLD HISTORICAL PROCESSING] ${source.year}: wrote ${outputPath}`
  );
}

async function main(): Promise<void> {
  for (const source of WORLD_HISTORICAL_SOURCES) {
    await processEdition(source);
  }

  console.log(
    "[WORLD HISTORICAL PROCESSING] Successful."
  );
}

main().catch((error) => {
  console.error(
    "[WORLD HISTORICAL PROCESSING] Failed:",
    error
  );

  process.exit(1);
});