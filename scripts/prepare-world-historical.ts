
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import {
  WORLD_HISTORICAL_SOURCES,
  type HistoricalWorldSource,
  type HistoricalWorldProvider,
} from "./data/world/historical-sources";

import {
  loadWorldRegister,
  resolveRegisterName,
  type RegisterPerson,
} from "./world-historical-utils";

type ManifestEntry = {
  sourceMatchId: string;
  url: string;
  file: string;
  cacheKey: string;
};

type EditionManifest = {
  year: number;
  seasonName: string;
  provider?: "CricketArchive" | "ESPNcricinfo";
  expectedMatchCount: number;
  matches: ManifestEntry[];
};

type HistoricalBattingRecord = {
  sourcePlayerId: string;
  fullName: string;
  runs: number | null;
  balls: number | null;
  didNotBat: boolean;
  notOut: boolean;
  retired: boolean;
  dismissal: string;
  bowlerSourcePlayerId: string | null;
  catcherSourcePlayerId: string | null;
  stumperSourcePlayerId: string | null;
  wicketCreditedToBowler: boolean;
};

type HistoricalBowlingRecord = {
  sourcePlayerId: string;
  fullName: string;
  overs: string;
  runsConceded: number;
  wickets: number;
};

type HistoricalInnings = {
  battingTeam: string;
  batting: HistoricalBattingRecord[];
  bowling: HistoricalBowlingRecord[];
};

type HistoricalPlayerRecord = {
  sourcePlayerId: string;
  fullName: string;
  team: string;
};

type HistoricalMatch = {
  sourceMatchId: string;
  sourceUrl: string;
  date: string;
  teams: string[];
  players: HistoricalPlayerRecord[];
  innings: HistoricalInnings[];
};

type HistoricalNormalizedEdition = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50 | 60;
  source: {
    provider: HistoricalWorldProvider;
    url: string;
  };
  matches: HistoricalMatch[];
};

type TableMode = "batting" | "bowling" | null;

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
  "historical-normalized"
);

function fail(message: string): never {
  throw new Error(`[WORLD HISTORICAL PREPARE] ${message}`);
}

function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    fail(`Missing file: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");

  if (!raw.trim()) {
    fail(`File is empty: ${filePath}`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    fail(
      `Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value: string): number | null {
  const cleaned = cleanText(value);

  if (!cleaned || cleaned === "-") {
    return null;
  }

  const match = cleaned.match(/^-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const result = Number(match[0]);

  return Number.isFinite(result) ? result : null;
}

function parseMatchDate(
  text: string,
  expectedYear: number
): string {
  const match = text.match(
    /\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\b/i
  );

  if (!match) {
    fail(
      `Unable to extract match date for ${expectedYear}.`
    );
  }

  const day = Number(match[1]);
  const monthName = match[2].toLowerCase();
  const year = Number(match[3]);

  const months: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };

  const month = months[monthName];

  if (!month) {
    fail(`Unknown month "${match[2]}" in scorecard date.`);
  }

  if (year !== expectedYear) {
    fail(
      `Scorecard date ${match[0]} belongs to ${year}; expected ${expectedYear}.`
    );
  }

  if (day < 1 || day > 31) {
    fail(`Invalid day "${day}" in scorecard date.`);
  }

  const date = `${year}-${month}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    fail(`Invalid calendar date "${date}".`);
  }

  return date;
}

function resolvePerson(
  register: ReturnType<typeof loadWorldRegister>,
  value: string
): RegisterPerson {
  const cleaned = cleanText(value)
    .replace(/^[*+#\s]+/, "")
    .replace(/^(?:†|‡)+/, "")
    .trim();

  if (
    !cleaned ||
    /^(sub|substitute|extras|total|dnb|did not bat)$/i.test(cleaned)
  ) {
    fail(
      `Cannot resolve "${value}" as a canonical player identity.`
    );
  }

  return resolveRegisterName(register, cleaned);
}

function parseDismissal(
  dismissal: string,
  register: ReturnType<typeof loadWorldRegister>
): {
  bowlerSourcePlayerId: string | null;
  catcherSourcePlayerId: string | null;
  stumperSourcePlayerId: string | null;
  wicketCreditedToBowler: boolean;
} {
  const value = cleanText(dismissal);

  const empty = {
    bowlerSourcePlayerId: null,
    catcherSourcePlayerId: null,
    stumperSourcePlayerId: null,
    wicketCreditedToBowler: false,
  };

  if (
    !value ||
    /^(?:not out|did not bat|retired hurt|retired not out)$/i.test(value)
  ) {
    return empty;
  }

  const lower = value.toLowerCase();

  const retired =
    lower.includes("retired hurt") ||
    lower.includes("retired not out");

  const wicketCreditedToBowler =
    !retired &&
    !lower.startsWith("run out") &&
    !lower.startsWith("obstructing the field") &&
    !lower.startsWith("timed out") &&
    !lower.startsWith("retired");

  let bowlerSourcePlayerId: string | null = null;
  let catcherSourcePlayerId: string | null = null;
  let stumperSourcePlayerId: string | null = null;

  const caughtAndBowled = value.match(
    /^c\s*(?:&|and)\s*b\s+(.+)$/i
  );

  if (caughtAndBowled?.[1]) {
    const person = resolvePerson(register, caughtAndBowled[1]);

    return {
      bowlerSourcePlayerId: person.identifier,
      catcherSourcePlayerId: person.identifier,
      stumperSourcePlayerId: null,
      wicketCreditedToBowler,
    };
  }

  const bowlerMatch = value.match(/\bb\s+(.+)$/i);

  if (bowlerMatch?.[1]) {
    const bowlerName = cleanText(bowlerMatch[1]);

    if (!/^sub$/i.test(bowlerName)) {
      bowlerSourcePlayerId = resolvePerson(
        register,
        bowlerName
      ).identifier;
    }
  }

  const caught = value.match(
    /^c\s+(.+?)\s+b\s+(.+)$/i
  );

  if (caught?.[1] && !/^sub$/i.test(caught[1])) {
    catcherSourcePlayerId = resolvePerson(
      register,
      caught[1]
    ).identifier;
  }

  const stumped = value.match(
    /^st\s+(.+?)\s+b\s+(.+)$/i
  );

  if (stumped?.[1]) {
    stumperSourcePlayerId = resolvePerson(
      register,
      stumped[1]
    ).identifier;
  }

  return {
    bowlerSourcePlayerId,
    catcherSourcePlayerId,
    stumperSourcePlayerId,
    wicketCreditedToBowler,
  };
}

function extractCells(
  $: cheerio.CheerioAPI,
  row: AnyNode
): string[] {
  return $(row)
    .find("th,td")
    .map((_, cell) => cleanText($(cell).text()))
    .get();
}

function parseDnbNames(rowText: string): string[] {
  const value = rowText
    .replace(/^DNB\s*:\s*/i, "")
    .replace(/\.$/, "")
    .trim();

  if (!value) {
    return [];
  }

  return value
    .split(/,\s*/)
    .map(cleanText)
    .filter(Boolean);
}

function addDnbPlayers(
  currentInnings: HistoricalInnings,
  names: string[],
  register: ReturnType<typeof loadWorldRegister>
): void {
  for (const name of names) {
    const person = resolvePerson(register, name);

    const alreadyExists = currentInnings.batting.some(
      (player) => player.sourcePlayerId === person.identifier
    );

    if (alreadyExists) {
      continue;
    }

    currentInnings.batting.push({
      sourcePlayerId: person.identifier,
      fullName: person.name,
      runs: null,
      balls: null,
      didNotBat: true,
      notOut: false,
      retired: false,
      dismissal: "did not bat",
      bowlerSourcePlayerId: null,
      catcherSourcePlayerId: null,
      stumperSourcePlayerId: null,
      wicketCreditedToBowler: false,
    });
  }
}

function getInningsTeam(rowText: string): string | null {
  const match = rowText.match(
    /^(.+?)\s+innings\b/i
  );

  if (!match) {
    return null;
  }

  return cleanText(
    match[1]
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s*[-–]\s*$/, "")
  );
}

function isBattingHeader(
  rowText: string,
  source: HistoricalWorldSource
): boolean {
  if (source.provider === "ESPNcricinfo") {
    return /\bR\s+(?:M\s+)?B\b/i.test(rowText);
  }

  return /\bRuns\s+Balls\b/i.test(rowText);
}

function isBowlingHeader(
  rowText: string,
  source: HistoricalWorldSource
): boolean {
  if (source.provider === "ESPNcricinfo") {
    return /\bBowling\s+O\s+M\s+R\s+W\b/i.test(rowText);
  }

  return /\bbowling\s+Overs\s+Mdns\s+Runs\s+Wkts\b/i.test(
    rowText
  );
}

function parseScorecard(
  html: string,
  manifestEntry: ManifestEntry,
  source: HistoricalWorldSource,
  register: ReturnType<typeof loadWorldRegister>
): HistoricalMatch {
  const $ = cheerio.load(html);
  const text = cleanText($("body").text());

  // Verify the source ID using the rules for the configured provider.
  if (source.provider === "CricketArchive") {
    const scorecardId = text
      .match(/\b(o\d+)\b/i)?.[1]
      ?.toLowerCase();

    if (!scorecardId) {
      fail(
        `${source.year}/${manifestEntry.sourceMatchId}: missing CricketArchive match ID.`
      );
    }

    if (
      scorecardId !==
      manifestEntry.sourceMatchId.toLowerCase()
    ) {
      fail(
        `${source.year}: manifest ID ${manifestEntry.sourceMatchId} does not match scorecard ID ${scorecardId}.`
      );
    }
  } else {
    const filename = path.posix
      .basename(new URL(manifestEntry.url).pathname)
      .replace(/\.html$/i, "")
      .toLowerCase();

    if (
      filename !==
      manifestEntry.sourceMatchId.toLowerCase()
    ) {
      fail(
        `${source.year}: manifest ID does not match the ESPNcricinfo scorecard filename.`
      );
    }
  }

  const date = parseMatchDate(text, source.year);
  const innings: HistoricalInnings[] = [];

  let currentInnings: HistoricalInnings | null = null;
  let mode: TableMode = null;
  let battingHasMinutesColumn = false;

  $("tr").each((_, row) => {
    const cells = extractCells($, row);

    if (cells.length === 0) {
      return;
    }

    const rowText = cleanText(cells.join(" "));

    if (!rowText) {
      return;
    }

    // Start a new innings when the team heading is encountered.
    const inningsTeam = getInningsTeam(rowText);

    if (inningsTeam) {
      currentInnings = {
        battingTeam: inningsTeam,
        batting: [],
        bowling: [],
      };

      innings.push(currentInnings);
      mode = null;
      battingHasMinutesColumn = false;
      return;
    }

    // Switch to batting mode when the batting column headers appear.
    if (isBattingHeader(rowText, source)) {
      if (!currentInnings) {
        return;
      }

      mode = "batting";
      battingHasMinutesColumn = /\bR\s+M\s+B\b/i.test(rowText);
      return;
    }

    // Switch to bowling mode when the bowling column headers appear.
    if (isBowlingHeader(rowText, source)) {
      if (!currentInnings) {
        fail(
          `${source.year}/${manifestEntry.sourceMatchId}: bowling section appeared before an innings heading.`
        );
      }

      mode = "bowling";
      return;
    }

    if (!currentInnings) {
      return;
    }

    const first = cells[0] ?? "";

    // DNB can appear as one row containing a comma-separated list.
    if (
      source.provider === "ESPNcricinfo" &&
      /^DNB\s*:/i.test(rowText)
    ) {
      addDnbPlayers(
        currentInnings,
        parseDnbNames(rowText),
        register
      );
      return;
    }

    // Ignore non-player summary rows; keep batting mode active so DNB
    // rows following the total can still be collected.
    if (
      /^(Extras|Total|Fall of wickets|FoW|Did not bat|DNB)\b/i.test(
        first
      )
    ) {
      return;
    }

    if (!mode) {
      return;
    }

    if (mode === "batting") {
      if (cells.length < 3) {
        return;
      }

      // Skip repeated headings and non-player table rows.
      if (
        /^(Batter|Batsman|Player|R|M|B|Bowling)$/i.test(first)
      ) {
        return;
      }

      const dismissal = cleanText(cells[1] ?? "");
      const didNotBat = /did not bat/i.test(dismissal);
      const retired = /retired hurt|retired not out/i.test(dismissal);

      // ESPN legacy layouts are usually:
      // player, dismissal, runs, [minutes], balls, fours, sixes.
      // CricketArchive layouts are:
      // player, dismissal, runs, balls, ...
      const runsIndex = 2;
      const ballsIndex =
        source.provider === "ESPNcricinfo" &&
          battingHasMinutesColumn
          ? 4
          : 3;

      const runs = parseNumber(cells[runsIndex] ?? "");
      const balls = parseNumber(cells[ballsIndex] ?? "");

      // A valid batting row must have a numeric score or be explicitly
      // marked as DNB/retired. This prevents headings becoming players.
      if (
        runs === null &&
        !didNotBat &&
        !retired &&
        !/^(not out|retired hurt|retired not out)$/i.test(dismissal)
      ) {
        return;
      }

      const person = resolvePerson(register, first);
      const events = parseDismissal(dismissal, register);

      const existing = currentInnings.batting.find(
        (player) => player.sourcePlayerId === person.identifier
      );

      const record: HistoricalBattingRecord = {
        sourcePlayerId: person.identifier,
        fullName: person.name,
        runs,
        balls,
        didNotBat,
        notOut: /not out/i.test(dismissal),
        retired,
        dismissal,
        bowlerSourcePlayerId: events.bowlerSourcePlayerId,
        catcherSourcePlayerId: events.catcherSourcePlayerId,
        stumperSourcePlayerId: events.stumperSourcePlayerId,
        wicketCreditedToBowler: events.wicketCreditedToBowler,
      };

      if (!existing) {
        currentInnings.batting.push(record);
      }

      return;
    }

    if (mode === "bowling") {
      if (cells.length < 5) {
        return;
      }

      if (
        /^(Bowling|Player|Bowler|O)$/i.test(first)
      ) {
        return;
      }

      const overs = cleanText(cells[1] ?? "");
      const runs = parseNumber(cells[3] ?? "");
      const wickets = parseNumber(cells[4] ?? "");

      if (
        !overs ||
        !/^\d+(?:\.\d+)?$/.test(overs) ||
        runs === null ||
        wickets === null
      ) {
        return;
      }

      const person = resolvePerson(register, first);

      const existing = currentInnings.bowling.find(
        (player) => player.sourcePlayerId === person.identifier
      );

      if (!existing) {
        currentInnings.bowling.push({
          sourcePlayerId: person.identifier,
          fullName: person.name,
          overs,
          runsConceded: runs,
          wickets,
        });
      }
    }
  });

  if (innings.length < 2) {
    fail(
      `${source.year}/${manifestEntry.sourceMatchId}: expected at least two innings, found ${innings.length}.`
    );
  }

  for (const inningsEntry of innings) {
    if (!inningsEntry.battingTeam) {
      fail(
        `${source.year}/${manifestEntry.sourceMatchId}: innings has no batting team.`
      );
    }

    if (inningsEntry.batting.length === 0) {
      fail(
        `${source.year}/${manifestEntry.sourceMatchId}: no batting players parsed for ${inningsEntry.battingTeam}.`
      );
    }

    if (inningsEntry.bowling.length === 0) {
      fail(
        `${source.year}/${manifestEntry.sourceMatchId}: no bowling figures parsed for ${inningsEntry.battingTeam}.`
      );
    }
  }

  const teamNames = [
    ...new Set(innings.map((entry) => entry.battingTeam)),
  ];

  if (teamNames.length !== 2) {
    fail(
      `${source.year}/${manifestEntry.sourceMatchId}: expected exactly two teams, found ${teamNames.length}: ${teamNames.join(", ")}.`
    );
  }

  // First pass: build the full player inventory from every batting innings.
  const players = new Map<string, HistoricalPlayerRecord>();

  for (const inningsEntry of innings) {
    for (const batting of inningsEntry.batting) {
      const existing = players.get(batting.sourcePlayerId);
      const team = inningsEntry.battingTeam;

      if (existing && existing.team !== team) {
        fail(
          `${source.year}/${manifestEntry.sourceMatchId}: player ${batting.fullName} appears for both "${existing.team}" and "${team}".`
        );
      }

      players.set(batting.sourcePlayerId, {
        sourcePlayerId: batting.sourcePlayerId,
        fullName: batting.fullName,
        team,
      });
    }
  }

  // Second pass: every bowler must belong to the opposing team inventory.
  for (const inningsEntry of innings) {
    const fieldingTeam = teamNames.find(
      (team) => team !== inningsEntry.battingTeam
    );

    for (const bowling of inningsEntry.bowling) {
      const player = players.get(bowling.sourcePlayerId);

      if (!player) {
        fail(
          `${source.year}/${manifestEntry.sourceMatchId}: bowler ${bowling.fullName} is missing from the match inventory.`
        );
      }

      if (player.team !== fieldingTeam) {
        fail(
          `${source.year}/${manifestEntry.sourceMatchId}: bowler ${bowling.fullName} is listed for ${player.team}, but should field for ${fieldingTeam}.`
        );
      }
    }
  }

  return {
    sourceMatchId: manifestEntry.sourceMatchId,
    sourceUrl: manifestEntry.url,
    date,
    teams: teamNames,
    players: [...players.values()],
    innings,
  };
}

function readManifest(year: number): EditionManifest {
  return readJson<EditionManifest>(
    path.join(CACHE_ROOT, String(year), "manifest.json")
  );
}

function validateManifest(
  manifest: EditionManifest,
  source: HistoricalWorldSource
): void {
  if (manifest.year !== source.year) {
    fail(`${source.year}: manifest year mismatch.`);
  }

  if (manifest.seasonName !== source.seasonName) {
    fail(`${source.year}: manifest season name mismatch.`);
  }

  if (
    manifest.expectedMatchCount !== source.expectedMatchCount
  ) {
    fail(`${source.year}: manifest expected match count mismatch.`);
  }

  if (manifest.matches.length !== source.expectedMatchCount) {
    fail(
      `${source.year}: manifest contains ${manifest.matches.length} matches; expected ${source.expectedMatchCount}.`
    );
  }

  const ids = new Set<string>();
  const urls = new Set<string>();

  for (const entry of manifest.matches) {
    if (
      !entry.sourceMatchId ||
      !entry.url ||
      !entry.file ||
      !entry.cacheKey
    ) {
      fail(`${source.year}: manifest contains an incomplete match entry.`);
    }

    if (
      path.basename(entry.file) !== entry.file ||
      entry.file.includes("..")
    ) {
      fail(
        `${source.year}/${entry.sourceMatchId}: unsafe cache filename.`
      );
    }

    if (ids.has(entry.sourceMatchId)) {
      fail(
        `${source.year}: duplicate match ID ${entry.sourceMatchId}.`
      );
    }

    if (urls.has(entry.url)) {
      fail(`${source.year}: duplicate scorecard URL ${entry.url}.`);
    }

    ids.add(entry.sourceMatchId);
    urls.add(entry.url);
  }
}

function processEdition(
  source: HistoricalWorldSource,
  register: ReturnType<typeof loadWorldRegister>
): void {
  const manifest = readManifest(source.year);

  validateManifest(manifest, source);

  const matches: HistoricalMatch[] = [];
  const sourceMatchIds = new Set<string>();

  for (const entry of manifest.matches) {
    if (sourceMatchIds.has(entry.sourceMatchId)) {
      fail(
        `${source.year}: duplicate source match ID ${entry.sourceMatchId}.`
      );
    }

    sourceMatchIds.add(entry.sourceMatchId);

    const filePath = path.join(
      CACHE_ROOT,
      String(source.year),
      entry.file
    );

    if (!fs.existsSync(filePath)) {
      fail(
        `${source.year}/${entry.sourceMatchId}: missing cached HTML ${filePath}.`
      );
    }

    const html = fs.readFileSync(filePath, "utf8");

    if (!html.trim()) {
      fail(
        `${source.year}/${entry.sourceMatchId}: cached HTML is empty.`
      );
    }

    matches.push(
      parseScorecard(html, entry, source, register)
    );
  }

  if (matches.length !== source.expectedMatchCount) {
    fail(
      `${source.year}: parsed ${matches.length} matches; expected ${source.expectedMatchCount}.`
    );
  }

  for (const match of matches) {
    if (match.teams.length !== 2) {
      fail(
        `${source.year}/${match.sourceMatchId}: expected two teams.`
      );
    }

    if (match.players.length === 0) {
      fail(
        `${source.year}/${match.sourceMatchId}: no players discovered.`
      );
    }
  }

  const output: HistoricalNormalizedEdition = {
    year: source.year,
    seasonName: source.seasonName,
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: source.oversPerInnings,
    source: {
      provider: source.provider,
      url: source.archiveRoot,
    },
    matches,
  };

  ensureDirectory(OUTPUT_ROOT);

  const outputPath = path.join(
    OUTPUT_ROOT,
    `${source.year}.json`
  );

  const temporaryPath = `${outputPath}.tmp`;

  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8"
  );

  fs.renameSync(temporaryPath, outputPath);

  const uniquePlayers = new Set(
    matches.flatMap((match) =>
      match.players.map((player) => player.sourcePlayerId)
    )
  );

  console.log(
    `[WORLD HISTORICAL PREPARE] ${source.year}: ${matches.length} matches, ${uniquePlayers.size} canonical players.`
  );
}

function main(): void {
  console.log("[WORLD HISTORICAL PREPARE] Starting.");

  const requestedYear = process.argv[2]
    ? Number(process.argv[2])
    : null;

  const sources = requestedYear
    ? WORLD_HISTORICAL_SOURCES.filter(
      (source) => source.year === requestedYear
    )
    : WORLD_HISTORICAL_SOURCES;

  if (sources.length === 0) {
    fail(`Unknown year argument: ${process.argv[2]}`);
  }

  const register = loadWorldRegister();

  ensureDirectory(OUTPUT_ROOT);

  for (const source of sources) {
    processEdition(source, register);
  }

  console.log(
    "[WORLD HISTORICAL PREPARE] Historical normalization successful."
  );
}

main();
