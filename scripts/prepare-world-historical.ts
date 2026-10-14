
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

type PendingBowlingResolution = {
  innings: HistoricalInnings;
  playerName: string;
  overs: string;
  runsConceded: number;
  wickets: number;
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

type ParsedDismissalReferences = {
  bowlerName: string | null;
  catcherName: string | null;
  stumperName: string | null;
  wicketCreditedToBowler: boolean;
};

type PendingDismissalResolution = {
  record: HistoricalBattingRecord;
  innings: HistoricalInnings;
  references: ParsedDismissalReferences;
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
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
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
  dismissal: string
): ParsedDismissalReferences {
  const value = cleanText(dismissal);
  const lower = value.toLowerCase();

  const empty: ParsedDismissalReferences = {
    bowlerName: null,
    catcherName: null,
    stumperName: null,
    wicketCreditedToBowler: false,
  };

  if (
    !value ||
    /^(?:not out|did not bat|retired hurt|retired not out)$/i.test(value)
  ) {
    return empty;
  }

  const retired =
    lower.includes("retired hurt") ||
    lower.includes("retired not out");

  const wicketCreditedToBowler =
    !retired &&
    !lower.startsWith("run out") &&
    !lower.startsWith("obstructing the field") &&
    !lower.startsWith("timed out") &&
    !lower.startsWith("retired");

  // Caught and bowled: one player performed both actions.
  const caughtAndBowled = value.match(
    /^c\s*(?:&|and)\s*b\s+(.+)$/i
  );

  if (caughtAndBowled?.[1]) {
    const playerName = cleanText(caughtAndBowled[1]);

    return {
      bowlerName: playerName,
      catcherName: playerName,
      stumperName: null,
      wicketCreditedToBowler,
    };
  }

  const bowlerMatch = value.match(/\bb\s+(.+)$/i);
  let bowlerName: string | null = null;

  if (bowlerMatch?.[1]) {
    const name = cleanText(bowlerMatch[1]);

    if (!/^sub(?:stitute)?$/i.test(name)) {
      bowlerName = name;
    }
  }

  let catcherName: string | null = null;
  const caught = value.match(/^c\s+(.+?)\s+b\s+(.+)$/i);

  if (caught?.[1]) {
    const fielderText = cleanText(caught[1]);

    // ESPN archives sometimes identify a substitute as "sub (Name)".
    const substitute = fielderText.match(
      /^sub(?:stitute)?\s*\((.+)\)$/i
    );

    if (substitute?.[1]) {
      catcherName = cleanText(substitute[1]);
    } else if (!/^sub(?:stitute)?$/i.test(fielderText)) {
      catcherName = fielderText;
    }
  }

  let stumperName: string | null = null;
  const stumped = value.match(/^st\s+(.+?)\s+b\s+(.+)$/i);

  if (stumped?.[1]) {
    const name = cleanText(stumped[1]);

    if (!/^sub(?:stitute)?$/i.test(name)) {
      stumperName = name;
    }
  }

  return {
    bowlerName,
    catcherName,
    stumperName,
    wicketCreditedToBowler,
  };
}
function normalizeHistoricalPlayerName(value: string): string {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,'’]/g, " ")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function playerNameMatchesReference(
  candidateName: string,
  referenceName: string
): boolean {
  const candidate = normalizeHistoricalPlayerName(candidateName);
  const reference = normalizeHistoricalPlayerName(referenceName);

  if (!candidate || !reference) {
    return false;
  }

  if (candidate === reference) {
    return true;
  }

  const candidateTokens = candidate.split(" ");
  const referenceTokens = reference.split(" ");

  // A surname-only reference, such as "Amarnath", must match the surname
  // of a player in the relevant team, not a globally selected person.
  if (referenceTokens.length === 1) {
    return candidateTokens[candidateTokens.length - 1] === referenceTokens[0];
  }

  if (referenceTokens.length > candidateTokens.length) {
    return false;
  }

  const suffix = candidateTokens.slice(-referenceTokens.length);

  // Support shortened forms such as "M Amarnath" matching "Mohinder Amarnath".
  // Any initial must match the corresponding given-name token.
  return referenceTokens.every((token, index) => {
    const candidateToken = suffix[index];

    return token.length === 1
      ? candidateToken.startsWith(token)
      : candidateToken === token;
  });
}

function resolveMatchPlayerReference(
  rawName: string,
  expectedTeam: string,
  players: Map<string, HistoricalPlayerRecord>,
  register: ReturnType<typeof loadWorldRegister>,
  source: HistoricalWorldSource,
  matchId: string,
  participantKind: "bowler" | "catcher" | "wicketkeeper",
  preferredPlayerIds?: Set<string>
): string {
  const reference = cleanText(rawName);

  if (!reference) {
    fail(
      source.year + "/" + matchId +
      ": received an empty " + participantKind + " reference."
    );
  }

  const teamCandidates = [...players.values()].filter(
    (player) => player.team === expectedTeam
  );

  // For a bowler reference, the innings' bowling figures are authoritative.
  // This is the key protection against matching the wrong "Amarnath".
  const candidatePool = preferredPlayerIds
    ? teamCandidates.filter((player) =>
      preferredPlayerIds.has(player.sourcePlayerId)
    )
    : teamCandidates;

  const matchingCandidates = candidatePool.filter((candidate) => {
    const aliases = new Set<string>([candidate.fullName]);

    const registeredPerson = register.peopleById.get(
      candidate.sourcePlayerId
    );

    if (registeredPerson) {
      aliases.add(registeredPerson.name);
      aliases.add(registeredPerson.uniqueName);
    }

    // Cricsheet's names.csv includes abbreviated and alternate names.
    // Only consider aliases attached to this candidate's canonical ID.
    for (const [alias, ids] of register.nameToIds) {
      if (ids.has(candidate.sourcePlayerId)) {
        aliases.add(alias);
      }
    }

    return [...aliases].some((alias) =>
      playerNameMatchesReference(alias, reference)
    );
  });

  if (matchingCandidates.length === 1) {
    return matchingCandidates[0].sourcePlayerId;
  }

  if (matchingCandidates.length === 0) {
    fail(
      source.year + "/" + matchId +
      ': unable to resolve ' + participantKind +
      ' "' + reference + '" for team "' + expectedTeam +
      '". Checked ' + candidatePool.length +
      " relevant match candidates. Verify the lineup, bowling figures, " +
      "and source spelling."
    );
  }

  fail(
    source.year + "/" + matchId +
    ': ambiguous ' + participantKind +
    ' "' + reference + '" for team "' + expectedTeam +
    '". Candidates: ' +
    matchingCandidates
      .map((player) => player.fullName + " [" + player.sourcePlayerId + "]")
      .join(", ") +
    ". Resolve the ambiguity from the source scorecard; do not guess."
  );
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


function extractHistoricalScorecardLines(html: string): string[] {
  const $ = cheerio.load(html);

  const preformatted = $("pre")
    .map((_, element) => $(element).text())
    .get()
    .filter((value) => value.trim().length > 0)
    .join("\n");

  let scorecardText = preformatted;

  // Legacy ESPNcricinfo scorecards are commonly fixed-width text inside
  // <pre>. Do not treat a whole page-layout row as a scorecard row.
  if (!scorecardText.trim()) {
    $("script, style, noscript, iframe").remove();
    $("br").replaceWith("\n");

    $("p, div, section, article, li, h1, h2, h3, h4, tr").each(
      (_, element) => {
        $(element).prepend("\n").append("\n");
      }
    );

    scorecardText = $("body").text();
  }

  return scorecardText
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\uFEFF]/g, "")
    .split("\n")
    // Preserve internal spacing because player/dismissal fields are aligned
    // by whitespace in the legacy scorecard.
    .map((line) => line.replace(/\t/g, "    ").trim())
    .filter(Boolean);
}

function splitHistoricalBattingPlayerLine(
  prefix: string
): { playerName: string; dismissal: string } {
  const value = prefix.trim();
  const separator = value.search(/\s{2,}/);

  if (separator < 0) {
    return {
      playerName: value,
      dismissal: "",
    };
  }

  return {
    playerName: value.slice(0, separator).trim(),
    dismissal: cleanText(value.slice(separator).trim()),
  };
}

function parseHistoricalBattingColumns(
  line: string
): { prefix: string; runs: number; balls: number } | null {
  // Five numeric columns: runs, minutes, balls, fours, sixes.
  const withMinutes = line.match(
    /^(.*?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/
  );

  if (withMinutes) {
    return {
      prefix: withMinutes[1].trimEnd(),
      runs: Number(withMinutes[2]),
      balls: Number(withMinutes[4]),
    };
  }

  // Four numeric columns: runs, balls, fours, sixes.
  // This also supports rows where the minutes field was left blank.
  const withoutMinutes = line.match(
    /^(.*?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/
  );

  if (withoutMinutes) {
    return {
      prefix: withoutMinutes[1].trimEnd(),
      runs: Number(withoutMinutes[2]),
      balls: Number(withoutMinutes[3]),
    };
  }

  return null;
}

function parseHistoricalBowlingColumns(
  line: string
): {
  playerName: string;
  overs: string;
  runsConceded: number;
  wickets: number;
} | null {
  // Some editions append bowling extras such as "(2w)" after the figures.
  const match = line.match(
    /^(.*?)\s+(\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+\([^)]*\))*\s*$/
  );

  if (!match) {
    return null;
  }

  const overs = match[2];

  // Cricket overs use .1 through .5 to represent balls, not decimal fractions.
  if (!/^\d+(?:\.[0-5])?$/.test(overs)) {
    return null;
  }

  return {
    playerName: match[1].trim(),
    overs,
    runsConceded: Number(match[4]),
    wickets: Number(match[5]),
  };
}

function extractHistoricalTeamRosterBlocks(
  lines: string[]
): Array<{ team: string; names: string[] }> {
  const rosters = new Map<string, string[]>();
  let currentTeam: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const heading = line.match(/^(.+?)\s+team\s*:\s*(.*)$/i);

    if (heading) {
      currentTeam = cleanText(heading[1]);

      if (!rosters.has(currentTeam)) {
        rosters.set(currentTeam, []);
      }

      const inlineNames = heading[2].trim();

      if (inlineNames) {
        rosters.get(currentTeam)!.push(
          ...parseDnbNames(inlineNames)
        );

        currentTeam = /,\s*$/.test(inlineNames)
          ? currentTeam
          : null;
      }

      continue;
    }

    if (!currentTeam) {
      continue;
    }

    // Do not mistake match commentary/footer text for roster continuations.
    // A single leading "*" is deliberately not excluded: it can mark a player.
    if (
      /^(?:\*\s+\*|Team Pages:|Ground Page:|Match Officials|Thanks:|Source:|Contributed by|©)/i.test(
        line
      )
    ) {
      currentTeam = null;
      continue;
    }

    rosters.get(currentTeam)!.push(
      ...parseDnbNames(line)
    );

    // Wrapped team rosters conventionally end continued lines with a comma.
    currentTeam = /,\s*$/.test(line)
      ? currentTeam
      : null;
  }

  return [...rosters.entries()]
    .map(([team, names]) => ({
      team,
      names: [...new Set(names)].filter(Boolean),
    }))
    .filter((roster) => roster.names.length > 0);
}

function parseScorecard(
  html: string,
  manifestEntry: ManifestEntry,
  source: HistoricalWorldSource,
  register: ReturnType<typeof loadWorldRegister>
): HistoricalMatch {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());

  let scorecardUrl: URL;

  try {
    scorecardUrl = new URL(manifestEntry.url);
  } catch {
    fail(
      source.year + "/" + manifestEntry.sourceMatchId +
      ": invalid scorecard URL."
    );
  }

  const archiveRootUrl = new URL(source.archiveRoot);
  const archiveCode = path.posix
    .basename(archiveRootUrl.pathname.replace(/\/+$/, ""))
    .toLowerCase();

  const filename = path.posix.basename(
    scorecardUrl.pathname
  ).toLowerCase();

  const allowedScorecardHosts = new Set([
    "i.imgci.com",
    "img.cricinfo.com",
    "static.espncricinfo.com",
  ]);

  // The internal match ID intentionally differs from the archive filename.
  // Date ranges such as 13-14 Jun 1979 must also be accepted.
  const expectedInternalMatchId = new RegExp(
    "^wc" + String(source.year).slice(-2) +
    "_match_\\d{2}_[a-z]+_[a-z]+_\\d{2}(?:-\\d{2})?[a-z]{3}\\d{4}$",
    "i"
  );

  if (
    scorecardUrl.protocol !== "https:" ||
    !allowedScorecardHosts.has(
      scorecardUrl.hostname.toLowerCase()
    ) ||
    scorecardUrl.username ||
    scorecardUrl.password ||
    !filename.endsWith(".html") ||
    !scorecardUrl.pathname.toLowerCase().includes(
      "/" + archiveCode + "/"
    ) ||
    !expectedInternalMatchId.test(manifestEntry.sourceMatchId)
  ) {
    fail(
      source.year + "/" + manifestEntry.sourceMatchId +
      ": invalid scorecard URL, archive path, or internal match ID."
    );
  }

  const date = parseMatchDate(bodyText, source.year);
  const lines = extractHistoricalScorecardLines(html);
  const rosterBlocks = extractHistoricalTeamRosterBlocks(lines);
  const rosterTeamNames = rosterBlocks.map((roster) => roster.team);

  const hasNoResult =
    /\bResult\s*:\s*(?:no result|abandoned|match abandoned|no play|washed out|cancelled|canceled)\b/i.test(
      bodyText
    );

  const inningsHeaderCount = lines.filter((line) =>
    Boolean(getInningsTeam(cleanText(line)))
  ).length;

  const battingHeaderCount = lines.filter((line) =>
    isBattingHeader(cleanText(line), source)
  ).length;

  const bowlingHeaderCount = lines.filter((line) =>
    isBowlingHeader(cleanText(line), source)
  ).length;

  const completeScorecard =
    inningsHeaderCount >= 2 &&
    battingHeaderCount >= 2 &&
    bowlingHeaderCount >= 2;

  const partialNoResultScorecard =
    hasNoResult &&
    inningsHeaderCount >= 1 &&
    battingHeaderCount >= 1 &&
    bowlingHeaderCount >= 1 &&
    rosterBlocks.length >= 1;

  const unplayedNoResultScorecard =
    hasNoResult &&
    inningsHeaderCount === 0 &&
    battingHeaderCount === 0 &&
    bowlingHeaderCount === 0 &&
    new Set(rosterTeamNames).size >= 2;

  // A short, specific error is much more useful than a fabricated team name
  // created by interpreting the HTML navigation as a scorecard row.
  if (
    !completeScorecard &&
    !partialNoResultScorecard &&
    !unplayedNoResultScorecard
  ) {
    fail(
      source.year + "/" + manifestEntry.sourceMatchId +
      ": unrecognized scorecard layout (innings headings=" +
      inningsHeaderCount +
      ", batting headers=" + battingHeaderCount +
      ", bowling headers=" + bowlingHeaderCount +
      ", roster teams=" + new Set(rosterTeamNames).size +
      ", no-result=" + hasNoResult + ")."
    );
  }

  const innings: HistoricalInnings[] = [];
  const pendingDismissals: PendingDismissalResolution[] = [];
  const pendingBowling: PendingBowlingResolution[] = [];

  let currentInnings: HistoricalInnings | null = null;
  let mode: TableMode = null;
  let continueDnb = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const normalizedLine = cleanText(line);

    if (!normalizedLine) {
      continue;
    }

    // Critical fix: detect innings from an individual formatted scorecard line,
    // never from a whole <tr> or the entire page body.
    const inningsTeam = getInningsTeam(normalizedLine);

    if (inningsTeam) {
      currentInnings = {
        battingTeam: inningsTeam,
        batting: [],
        bowling: [],
      };

      innings.push(currentInnings);
      mode = isBattingHeader(normalizedLine, source)
        ? "batting"
        : null;
      continueDnb = false;
      continue;
    }

    if (isBattingHeader(normalizedLine, source)) {
      if (!currentInnings) {
        fail(
          source.year + "/" + manifestEntry.sourceMatchId +
          ": batting header appeared before an innings heading."
        );
      }

      mode = "batting";
      continue;
    }

    if (isBowlingHeader(normalizedLine, source)) {
      if (!currentInnings) {
        fail(
          source.year + "/" + manifestEntry.sourceMatchId +
          ": bowling header appeared before an innings heading."
        );
      }

      mode = "bowling";
      continueDnb = false;
      continue;
    }

    if (!currentInnings) {
      continue;
    }

    // DNB lists sometimes wrap onto the following line. Continue only when
    // the preceding list line explicitly ends in a comma.
    if (
      source.provider === "ESPNcricinfo" &&
      /^DNB\s*:/i.test(normalizedLine)
    ) {
      addDnbPlayers(
        currentInnings,
        parseDnbNames(normalizedLine),
        register
      );

      continueDnb = /,\s*$/.test(line);
      continue;
    }

    if (
      source.provider === "ESPNcricinfo" &&
      continueDnb
    ) {
      if (
        /^(?:FoW\s*:|Fall of wickets\b|Bowling\b|Extras\b|Total\b)/i.test(
          normalizedLine
        )
      ) {
        continueDnb = false;
      } else {
        addDnbPlayers(
          currentInnings,
          parseDnbNames(normalizedLine),
          register
        );

        continueDnb = /,\s*$/.test(line);
        continue;
      }
    }

    if (
      /^(?:Extras\b|Total\b|Fall of wickets\b|FoW\b|Did not bat\b|DNB\b)/i.test(
        normalizedLine
      )
    ) {
      continue;
    }

    if (!mode) {
      continue;
    }

    if (mode === "batting") {
      const columns = parseHistoricalBattingColumns(line);

      if (!columns) {
        continue;
      }

      const separated = splitHistoricalBattingPlayerLine(
        columns.prefix
      );

      if (!separated.playerName) {
        continue;
      }

      const dismissal = cleanText(separated.dismissal);
      const person = resolvePerson(register, separated.playerName);
      const events = parseDismissal(dismissal);

      const existing = currentInnings.batting.find(
        (player) => player.sourcePlayerId === person.identifier
      );

      const record: HistoricalBattingRecord = {
        sourcePlayerId: person.identifier,
        fullName: person.name,
        runs: columns.runs,
        balls: columns.balls,
        didNotBat: false,
        notOut: /\bnot out\b/i.test(dismissal),
        retired: /\bretired hurt\b|\bretired not out\b/i.test(dismissal),
        dismissal,
        bowlerSourcePlayerId: null,
        catcherSourcePlayerId: null,
        stumperSourcePlayerId: null,
        wicketCreditedToBowler: events.wicketCreditedToBowler,
      };

      if (!existing) {
        currentInnings.batting.push(record);

        pendingDismissals.push({
          record,
          innings: currentInnings,
          references: events,
        });
      }

      continue;
    }

    if (mode === "bowling") {
      const bowling = parseHistoricalBowlingColumns(line);

      if (!bowling || !bowling.playerName) {
        continue;
      }

      // Do not resolve abbreviated names here. The opposing team's complete
      // batting and DNB inventory may not have been parsed yet.
      pendingBowling.push({
        innings: currentInnings,
        playerName: bowling.playerName,
        overs: bowling.overs,
        runsConceded: bowling.runsConceded,
        wickets: bowling.wickets,
      });
    }
  }

  if (innings.length > 2) {
    fail(
      source.year + "/" + manifestEntry.sourceMatchId +
      ": expected no more than two innings, found " + innings.length + "."
    );
  }

  if (!hasNoResult && innings.length !== 2) {
    fail(
      source.year + "/" + manifestEntry.sourceMatchId +
      ": expected two innings, found " + innings.length +
      ", and the source does not identify this as a no-result match."
    );
  }

  if (hasNoResult && innings.length === 1) {
    const playedTeam = innings[0].battingTeam;
    const hasOpposingRoster = rosterBlocks.some(
      (roster) =>
        roster.team !== playedTeam &&
        roster.names.length > 0
    );

    if (!hasOpposingRoster) {
      fail(
        source.year + "/" + manifestEntry.sourceMatchId +
        ": no-result scorecard has one played innings but no opposing-team roster."
      );
    }
  }

  if (
    hasNoResult &&
    innings.length === 0 &&
    new Set(rosterTeamNames).size < 2
  ) {
    fail(
      source.year + "/" + manifestEntry.sourceMatchId +
      ": no-result scorecard has no innings and does not identify both teams."
    );
  }

  for (const inningsEntry of innings) {
    if (inningsEntry.batting.length === 0) {
      fail(
        source.year + "/" + manifestEntry.sourceMatchId +
        ": no batting players parsed for \"" +
        inningsEntry.battingTeam +
        "\". Verify the scorecard text and batting-column format."
      );
    }

    if (inningsEntry.bowling.length === 0) {
      fail(
        source.year + "/" + manifestEntry.sourceMatchId +
        ": no bowling figures parsed for \"" +
        inningsEntry.battingTeam +
        "\". Verify the scorecard text and bowling-column format."
      );
    }
  }

  const teamNames = [
    ...new Set([
      ...innings.map((entry) => entry.battingTeam),
      ...rosterTeamNames,
    ]),
  ];

  if (teamNames.length !== 2) {
    fail(
      source.year + "/" + manifestEntry.sourceMatchId +
      ": expected exactly two teams, found " + teamNames.length +
      ": " + teamNames.join(", ") + "."
    );
  }

  const players = new Map<string, HistoricalPlayerRecord>();

  // First, collect players with actual batting records, including DNB names.
  for (const inningsEntry of innings) {
    for (const batting of inningsEntry.batting) {
      const existing = players.get(batting.sourcePlayerId);
      const team = inningsEntry.battingTeam;

      if (existing && existing.team !== team) {
        fail(
          source.year + "/" + manifestEntry.sourceMatchId +
          ": player " + batting.fullName +
          " appears for both \"" + existing.team +
          "\" and \"" + team + "\"."
        );
      }

      players.set(batting.sourcePlayerId, {
        sourcePlayerId: batting.sourcePlayerId,
        fullName: batting.fullName,
        team,
      });
    }
  }

  // A roster can supply the fielding side for a one-innings no-result match.
  // Do not count rosters as player appearances when no innings were played.
  if (innings.length > 0) {
    for (const roster of rosterBlocks) {
      for (const name of roster.names) {
        const person = resolvePerson(register, name);
        const existing = players.get(person.identifier);

        if (existing && existing.team !== roster.team) {
          fail(
            source.year + "/" + manifestEntry.sourceMatchId +
            ": roster player " + person.name +
            " conflicts across teams \"" + existing.team +
            "\" and \"" + roster.team + "\"."
          );
        }

        players.set(person.identifier, {
          sourcePlayerId: person.identifier,
          fullName: person.name,
          team: roster.team,
        });
      }
    }
  }

  // Resolve bowling figures only after all batting and DNB inventories
  // have been collected. This supports surnames and abbreviated references.
  for (const pending of pendingBowling) {
    const fieldingTeam = teamNames.find(
      (team) => team !== pending.innings.battingTeam
    );

    if (!fieldingTeam) {
      fail(
        source.year + "/" + manifestEntry.sourceMatchId +
        ": cannot identify the fielding team for bowler \"" +
        pending.playerName + "\"."
      );
    }

    const playerId = resolveMatchPlayerReference(
      pending.playerName,
      fieldingTeam,
      players,
      register,
      source,
      manifestEntry.sourceMatchId,
      "bowler"
    );

    const player = players.get(playerId);

    if (!player) {
      fail(
        source.year + "/" + manifestEntry.sourceMatchId +
        ": resolved bowler ID " + playerId +
        " is missing from the player inventory."
      );
    }

    const duplicate = pending.innings.bowling.some(
      (bowler) => bowler.sourcePlayerId === playerId
    );

    if (duplicate) {
      fail(
        source.year + "/" + manifestEntry.sourceMatchId +
        ": duplicate bowling entry for " + player.fullName +
        " in the innings."
      );
    }

    pending.innings.bowling.push({
      sourcePlayerId: playerId,
      fullName: player.fullName,
      overs: pending.overs,
      runsConceded: pending.runsConceded,
      wickets: pending.wickets,
    });
  }

  // Validate bowling data after deferred name resolution.
  for (const inningsEntry of innings) {
    if (inningsEntry.bowling.length === 0) {
      fail(
        source.year + "/" + manifestEntry.sourceMatchId +
        ": no bowling figures resolved for \"" +
        inningsEntry.battingTeam + "\"."
      );
    }
  }
  // Resolve dismissal participants after both teams' player inventories
  // and the innings' bowling figures are available.
  for (const pending of pendingDismissals) {
    const fieldingTeam = teamNames.find(
      (team) => team !== pending.innings.battingTeam
    );

    if (!fieldingTeam) {
      fail(
        source.year + "/" + manifestEntry.sourceMatchId +
        ": cannot identify the fielding team for dismissal resolution."
      );
    }

    const { references, record, innings: battingInnings } = pending;

    const inningsBowlerIds = new Set(
      battingInnings.bowling.map((bowler) => bowler.sourcePlayerId)
    );

    if (references.bowlerName) {
      record.bowlerSourcePlayerId = resolveMatchPlayerReference(
        references.bowlerName,
        fieldingTeam,
        players,
        register,
        source,
        manifestEntry.sourceMatchId,
        "bowler",
        inningsBowlerIds
      );
    }

    const caughtAndBowled =
      /\bc\s*(?:&|and)\s*b\b/i.test(record.dismissal);

    if (references.catcherName) {
      // In a caught-and-bowled dismissal, reuse the already-resolved bowler ID.
      // This avoids treating a surname shared by two players as ambiguous.
      if (
        caughtAndBowled &&
        record.bowlerSourcePlayerId
      ) {
        record.catcherSourcePlayerId = record.bowlerSourcePlayerId;
      } else {
        record.catcherSourcePlayerId = resolveMatchPlayerReference(
          references.catcherName,
          fieldingTeam,
          players,
          register,
          source,
          manifestEntry.sourceMatchId,
          "catcher"
        );
      }
    }

    if (references.stumperName) {
      record.stumperSourcePlayerId = resolveMatchPlayerReference(
        references.stumperName,
        fieldingTeam,
        players,
        register,
        source,
        manifestEntry.sourceMatchId,
        "wicketkeeper"
      );
    }
  }
  // Every listed bowler must resolve to the opposing team's inventory.
  for (const inningsEntry of innings) {
    const fieldingTeam = teamNames.find(
      (team) => team !== inningsEntry.battingTeam
    );

    for (const bowling of inningsEntry.bowling) {
      const player = players.get(bowling.sourcePlayerId);

      if (!player) {
        fail(
          source.year + "/" + manifestEntry.sourceMatchId +
          ": bowler " + bowling.fullName +
          " is missing from the match inventory."
        );
      }

      if (player.team !== fieldingTeam) {
        fail(
          source.year + "/" + manifestEntry.sourceMatchId +
          ": bowler " + bowling.fullName +
          " is listed for " + player.team +
          ", but should field for " + fieldingTeam + "."
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
