
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as cheerio from "cheerio";

import {
  WORLD_HISTORICAL_SOURCES,
  type HistoricalWorldSource,
} from "./data/world/historical-sources";

type MatchManifestEntry = {
  sourceMatchId: string;
  url: string;
  file: string;
  cacheKey: string;
};

type EditionManifest = {
  year: number;
  seasonName: string;
  provider: HistoricalWorldSource["provider"];
  archiveRoot: string;
  expectedMatchCount: number;
  retrievedAt: string;
  matches: MatchManifestEntry[];
};

type MatchPhase =
  | "group"
  | "super-six"
  | "quarter-final"
  | "semi-final"
  | "final";

type ParsedHistoricalMatch = {
  ordinal: number;
  phase: MatchPhase;
  team1: string;
  team2: string;
  team1Code: string;
  team2Code: string;
  day: number;
  endDay: number | null;
  month: string;
  year: number;
  dateToken: string;
  label: string;
  matchNumber: number;
};

type Candidate = {
  sourceMatchId: string;
  urlCandidates: string[];
  match: ParsedHistoricalMatch;
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

const ALLOWED_HOSTS = new Set([
  "i.imgci.com",
  "img.cricinfo.com",
  "static.espncricinfo.com",
]);

const MAX_HTML_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_INDEX_PAGES = 300;
const MAX_INDEX_DEPTH = 5;

const TEAM_CODES: Record<string, string> = {
  australia: "AUS",
  england: "ENG",
  india: "IND",
  "new zealand": "NZ",
  pakistan: "PAK",
  "west indies": "WI",
  "sri lanka": "SL",
  "east africa": "EA",
  zimbabwe: "ZIM",
  bangladesh: "BAN",
  "south africa": "SA",
  kenya: "KEN",
  netherlands: "NED",
  holland: "NED",
  canada: "CAN",
  ireland: "IRE",
  scotland: "SCO",
  "united arab emirates": "UAE",
};

const TEAM_ALIASES: Record<string, string[]> = {
  AUS: ["Australia"],
  ENG: ["England"],
  IND: ["India"],
  NZ: ["New Zealand"],
  PAK: ["Pakistan"],
  WI: ["West Indies"],
  SL: ["Sri Lanka", "Ceylon"],
  EA: ["East Africa"],
  ZIM: ["Zimbabwe"],
  BAN: ["Bangladesh"],
  SA: ["South Africa"],
  KEN: ["Kenya"],
  NED: ["Netherlands", "Holland"],
  CAN: ["Canada"],
  IRE: ["Ireland"],
  SCO: ["Scotland"],
  UAE: ["United Arab Emirates", "U.A.E.", "UAE"],
};

const MONTHS: Record<string, string> = {
  jan: "JAN",
  january: "JAN",
  feb: "FEB",
  february: "FEB",
  mar: "MAR",
  march: "MAR",
  apr: "APR",
  april: "APR",
  may: "MAY",
  jun: "JUN",
  june: "JUN",
  jul: "JUL",
  july: "JUL",
  aug: "AUG",
  august: "AUG",
  sep: "SEP",
  sept: "SEP",
  september: "SEP",
  oct: "OCT",
  october: "OCT",
  nov: "NOV",
  november: "NOV",
  dec: "DEC",
  december: "DEC",
};

function fail(message: string): never {
  throw new Error(`[WORLD HISTORICAL DOWNLOAD] ${message}`);
}

function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editionCode(source: HistoricalWorldSource): string {
  return `WC${String(source.year).slice(-2)}`;
}

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname.toLowerCase());
}

function normalizeEditionUrl(
  href: string,
  baseUrl: string,
  source: HistoricalWorldSource
): string | null {
  try {
    const url = new URL(href, baseUrl);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      !isAllowedHost(url.hostname)
    ) {
      return null;
    }

    const expectedPath = new RegExp(
      `/WORLD_CUPS/${editionCode(source)}/`,
      "i"
    );

    if (!expectedPath.test(url.pathname)) {
      return null;
    }

    url.protocol = "https:";
    url.hostname = "i.imgci.com";
    url.hash = "";
    url.search = "";

    return url.toString();
  } catch {
    return null;
  }
}

function isCanonicalScorecardUrl(
  urlString: string,
  source: HistoricalWorldSource
): boolean {
  try {
    const url = new URL(urlString);
    const filename = path.posix.basename(url.pathname);
    const code = editionCode(source);

    return new RegExp(
      `_${code}_ODI[^/]*_\\d{1,2}(?:-\\d{1,2})?[A-Z]{3}${source.year}\\.html$`,
      "i"
    ).test(filename);
  } catch {
    return false;
  }
}

function isIndexPageUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    if (url.pathname.endsWith("/")) {
      return true;
    }

    return /(?:SUMMARY|MATCHES|SCORECARDS|RESULTS|AVERAGES|POINTS|PLAYERS|INDEX|GROUP|SCHEDULE|FIXTURES)/i.test(
      path.posix.basename(url.pathname)
    );
  } catch {
    return false;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const parsed = new URL(url);

  if (!isAllowedHost(parsed.hostname)) {
    fail(`Refusing to fetch an unapproved host: ${parsed.hostname}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText} for ${url}`
      );
    }

    const finalUrl = new URL(response.url);

    if (!isAllowedHost(finalUrl.hostname)) {
      fail(`Redirected to an unapproved host: ${finalUrl.hostname}`);
    }

    const body = await response.text();

    if (!body.trim()) {
      throw new Error(`Empty response from ${url}`);
    }

    if (Buffer.byteLength(body, "utf8") > MAX_HTML_BYTES) {
      throw new Error(`Response exceeded ${MAX_HTML_BYTES} bytes: ${url}`);
    }

    const $ = cheerio.load(body);
    const title = cleanText($("title").text());
    const preview = cleanText($("body").text()).slice(0, 500);

    if (
      /access denied|captcha|verify you are human|request blocked/i.test(
        `${title} ${preview}`
      )
    ) {
      throw new Error(`Access-blocked or challenge page received from ${url}`);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function getScorecardLines(html: string): string[] {
  const $ = cheerio.load(html);
  const preformatted = $("pre").text();
  const text = preformatted.trim() ? preformatted : $("body").text();

  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(cleanText)
    .filter(Boolean);
}

function isValidScorecardStructure(
  html: string,
  source: HistoricalWorldSource
): boolean {
  const $ = cheerio.load(html);
  const body = cleanText($("body").text());
  const lines = getScorecardLines(html);

  const inningsHeaders = lines.filter((line) =>
    /^[A-Za-z][A-Za-z .'-]*\s+innings\b/i.test(line)
  ).length;

  const battingHeaders = lines.filter((line) =>
    /\bR\s+(?:M\s+)?B\b/i.test(line)
  ).length;

  const bowlingHeaders = lines.filter((line) =>
    /\bBowling\s+(?:O|Overs)\s+(?:M|Mdns)\s+(?:R|Runs)\s+(?:W|Wkts)\b/i.test(
      line
    )
  ).length;

  const rosterHeaders = lines.filter((line) =>
    /^.+?\s+team\s*:/i.test(line)
  ).length;

  const hasYear = new RegExp(
    "\\b" + source.year + "\\b"
  ).test(body);

  const hasResult = /\bResult\s*:/i.test(body);

  const hasNoResult = /\bResult\s*:\s*(?:no result|abandoned|match abandoned|no play|washed out|cancelled|canceled)\b/i.test(
    body
  );

// Inside isValidScorecardStructure(html: string, source: HistoricalMatchSource): boolean
  const completeScorecard =
    inningsHeaders >= 2 && battingHeaders >= 2 && bowlingHeaders >= 2;

  const partialNoResultScorecard =
    hasNoResult &&
    inningsHeaders >= 1 &&
    battingHeaders >= 1 &&
    bowlingHeaders >= 1 &&
    rosterHeaders >= 1;

  // FIX: Matches abandoned before the toss (e.g. 1979 Match 5 WI vs SL) or walkovers
  // have `hasNoResult === true` and `inningsHeaders === 0`, with 0 announced team rosters.
  const unplayedNoResultScorecard =
    hasNoResult && (rosterHeaders >= 2 || inningsHeaders === 0);

  return (
    completeScorecard ||
    partialNoResultScorecard ||
    unplayedNoResultScorecard
  );
}
function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function bodyContainsTeam(body: string, teamCode: string): boolean {
  const normalizedBody = normalizeForComparison(body);
  const aliases = TEAM_ALIASES[teamCode] ?? [];

  return aliases.some((alias) => {
    const normalizedAlias = normalizeForComparison(alias);

    return (
      normalizedAlias.length > 0 &&
      normalizedBody.includes(normalizedAlias)
    );
  });
}

function bodyContainsExpectedDate(
  body: string,
  match: ParsedHistoricalMatch
): boolean {
  const monthNames = Object.entries(MONTHS)
    .filter(([, abbreviation]) => abbreviation === match.month)
    .map(([name]) => name);

  const uniqueMonths = [...new Set(monthNames)];
  const monthPattern = uniqueMonths.join("|");

  const datePattern =
    match.endDay === null
      ? new RegExp(
          `\\b0?${match.day}\\s+(?:${monthPattern})\\s+${match.year}\\b`,
          "i"
        )
      : new RegExp(
          `\\b0?${match.day}\\s*(?:,|[-–—]|\\s+to\\s+)\\s*0?${match.endDay}\\s+(?:${monthPattern})\\s+${match.year}\\b`,
          "i"
        );

  return datePattern.test(body);
}

function matchesExpectedFixture(
  html: string,
  match: ParsedHistoricalMatch
): boolean {
  const $ = cheerio.load(html);
  const body = cleanText($("body").text());

  return (
    bodyContainsTeam(body, match.team1Code) &&
    bodyContainsTeam(body, match.team2Code) &&
    bodyContainsExpectedDate(body, match)
  );
}

/**
 * Parses archive labels such as:
 *   6th Match: India v New Zealand at Leeds, 13 Jun 1979
 *   1st Match, Super Six: Australia v South Africa at ..., 12 Jun 1999
 *   1st QF: ...
 *   1st SF: ...
 *   Final: ...
 *
 * Date ranges such as "13-14 Jun 1979" use the first day for URL matching.
 */
function parseHistoricalMatchLink(
  rawText: string,
  expectedYear: number
): Omit<ParsedHistoricalMatch, "matchNumber"> | null {
  let text = cleanText(rawText);

  // Some archive pages prefix labels with a group name.
  text = text.replace(/^Group\s+[A-Z]\s*:\s*/i, "");

  let ordinal = 0;
  let phase: MatchPhase = "group";
  let fixtureText = "";

  const groupMatch = text.match(
    /^(\d+)(?:st|nd|rd|th)\s+match(?:\s*,\s*super[\s-]*six)?\s*:\s*(.+)$/i
  );

  const superSixMatch = text.match(
    /^(\d+)(?:st|nd|rd|th)\s+match\s*,\s*super[\s-]*six\s*:\s*(.+)$/i
  );

  const stageMatch = text.match(
    /^(\d+)(?:st|nd|rd|th)\s+(semi.?final|sf|quarter.?final|qf)\s*:\s*(.+)$/i
  );

  const finalMatch = text.match(/^final\s*:\s*(.+)$/i);

  if (superSixMatch) {
    ordinal = Number(superSixMatch[1]);
    phase = "super-six";
    fixtureText = superSixMatch[2];
  } else if (groupMatch) {
    ordinal = Number(groupMatch[1]);
    phase = "group";
    fixtureText = groupMatch[2];
  } else if (stageMatch) {
    ordinal = Number(stageMatch[1]);
    const stage = stageMatch[2].toLowerCase();

    phase =
      /quarter|qf/i.test(stage) ? "quarter-final" : "semi-final";

    fixtureText = stageMatch[3];
  } else if (finalMatch) {
    ordinal = 1;
    phase = "final";
    fixtureText = finalMatch[1];
  } else {
    return null;
  }

  if (!Number.isInteger(ordinal) || ordinal < 1) {
    return null;
  }

const fixture = fixtureText.match(
  /^(.+?)\s+v(?:s)?\.?\s+(.+?)\s+at\s+.+?,\s*(\d{1,2})(?:\s*(?:-|–|—|to)\s*(\d{1,2}))?\s+([A-Za-z]+)\s+(\d{4})$/i
);

if (!fixture) {
  return null;
}

const team1 = cleanText(fixture[1]);
const team2 = cleanText(fixture[2]);
const team1Code = TEAM_CODES[team1.toLowerCase()];
const team2Code = TEAM_CODES[team2.toLowerCase()];
const day = Number(fixture[3]);
const endDay = fixture[4] ? Number(fixture[4]) : null;
const month = MONTHS[fixture[5].toLowerCase()];
const year = Number(fixture[6]);

if (
  !team1Code ||
  !team2Code ||
  team1Code === team2Code ||
  !month ||
  year !== expectedYear ||
  !Number.isInteger(day) ||
  day < 1 ||
  day > 31 ||
  (endDay !== null &&
    (!Number.isInteger(endDay) || endDay < day || endDay > 31))
) {
  return null;
}

const dateToken =
  `${String(day).padStart(2, "0")}` +
  (endDay !== null
    ? `-${String(endDay).padStart(2, "0")}`
    : "") +
  `${month}${year}`;

return {
  ordinal,
  phase,
  team1,
  team2,
  team1Code,
  team2Code,
  day,
  endDay,
  month,
  year,
  dateToken,
  label: rawText,
};
  }

function assignMatchNumbers(
  fixtures: Omit<ParsedHistoricalMatch, "matchNumber">[],
  source: HistoricalWorldSource
): ParsedHistoricalMatch[] {
  const countPhase = (phase: MatchPhase) =>
    fixtures.filter((fixture) => fixture.phase === phase).length;

  const superSixCount = countPhase("super-six");
  const quarterFinalCount = countPhase("quarter-final");
  const semiFinalCount = countPhase("semi-final");
  const finalCount = countPhase("final");

  if (finalCount > 1 || semiFinalCount > 2) {
    fail(`${source.year}: unexpected number of knockout-stage labels.`);
  }

  const assigned = fixtures.map((fixture) => {
    let matchNumber: number;

    switch (fixture.phase) {
      case "group":
        matchNumber = fixture.ordinal;
        break;

      case "super-six":
        matchNumber =
          source.expectedMatchCount -
          superSixCount -
          quarterFinalCount -
          semiFinalCount -
          finalCount +
          fixture.ordinal;
        break;

      case "quarter-final":
        matchNumber =
          source.expectedMatchCount -
          quarterFinalCount -
          semiFinalCount -
          finalCount +
          fixture.ordinal;
        break;

      case "semi-final":
        matchNumber =
          source.expectedMatchCount -
          semiFinalCount -
          finalCount +
          fixture.ordinal;
        break;

      case "final":
        matchNumber = source.expectedMatchCount;
        break;
    }

    return { ...fixture, matchNumber };
  });

  const numbers = assigned.map((match) => match.matchNumber);

  if (
    new Set(numbers).size !== numbers.length ||
    numbers.some(
      (number) =>
        !Number.isInteger(number) ||
        number < 1 ||
        number > source.expectedMatchCount
    )
  ) {
    fail(`${source.year}: parsed matches have duplicate or invalid match numbers.`);
  }

  return assigned;
}

function buildUrlCandidates(
  source: HistoricalWorldSource,
  match: ParsedHistoricalMatch,
  discoveredUrls: string[]
): string[] {
  const override = source.scorecardUrlOverrides?.[match.matchNumber];

  if (override) {
    const url = new URL(override);

    if (
      url.protocol !== "https:" ||
      !isAllowedHost(url.hostname) ||
      !isCanonicalScorecardUrl(url.toString(), source)
    ) {
      fail(
        `${source.year}: invalid configured scorecard override for match ${match.matchNumber}: ${override}`
      );
    }

    return [url.toString()];
  }

  const code = editionCode(source);
  const teamOrders = [
    [match.team1Code, match.team2Code],
    [match.team2Code, match.team1Code],
  ];

  let suffixes: string[];

  switch (match.phase) {
    case "group":
      suffixes = [`ODI${match.matchNumber}`];
      break;

    case "super-six":
      suffixes = [
        `ODI-SUPSIX${match.ordinal}`,
        `ODI-SUPERSIX${match.ordinal}`,
        `ODI${match.matchNumber}`,
      ];
      break;

    case "quarter-final":
      suffixes = [
        `ODI-QF${match.ordinal}`,
        `ODI-QUARTERFINAL${match.ordinal}`,
        `ODI-QUARTER-FINAL${match.ordinal}`,
        `ODI${match.matchNumber}`,
      ];
      break;

    case "semi-final":
      suffixes = [
        `ODI-SEMI${match.ordinal}`,
        `ODI-SF${match.ordinal}`,
        `ODI-SEMIFINAL${match.ordinal}`,
        `ODI${match.matchNumber}`,
      ];
      break;

    case "final":
      suffixes = ["ODI-FINAL", `ODI${match.matchNumber}`];
      break;
  }

  const candidates: string[] = [];

  // Prefer URLs discovered in the archive itself when their filenames
  // identify both teams and the expected match date.
  for (const url of discoveredUrls) {
    const filename = path.posix.basename(new URL(url).pathname).toUpperCase();
    const hasTeam1 = new RegExp(`(?:^|_)${match.team1Code}(?:_|-)`).test(
      filename
    );
    const hasTeam2 = new RegExp(`(?:^|_)${match.team2Code}(?:_|-)`).test(
      filename
    );

    if (hasTeam1 && hasTeam2 && filename.includes(match.dateToken)) {
      candidates.push(url);
    }
  }

  const bases = [
    `https://img.cricinfo.com/db/ARCHIVE/WORLD_CUPS/${code}/`,
    `https://i.imgci.com/db/ARCHIVE/WORLD_CUPS/${code}/`,
    `https://i.imgci.com/link_to_database/ARCHIVE/WORLD_CUPS/${code}/`,
    `https://img.cricinfo.com/link_to_database/ARCHIVE/WORLD_CUPS/${code}/`,
  ];

  for (const [team1Code, team2Code] of teamOrders) {
    for (const suffix of suffixes) {
      const filename =
        `${team1Code}_${team2Code}_${code}_${suffix}_${match.dateToken}.html`;

      for (const base of bases) {
        candidates.push(new URL(filename, base).toString());
      }
    }
  }

  return [...new Set(candidates)].filter((url) =>
    isCanonicalScorecardUrl(url, source)
  );
}

async function discoverScorecards(
  source: HistoricalWorldSource
): Promise<Candidate[]> {
  type QueueEntry = { url: string; depth: number };

  const queue: QueueEntry[] = [{ url: source.archiveRoot, depth: 0 }];
  const visited = new Set<string>();
  const discoveredUrls = new Set<string>();
  const parsedFixtures = new Map<
    string,
    Omit<ParsedHistoricalMatch, "matchNumber">
  >();

  while (queue.length > 0) {
    if (visited.size >= MAX_INDEX_PAGES) {
      fail(
        `${source.year}: reached index-page safety limit (${MAX_INDEX_PAGES}).`
      );
    }

    const current = queue.shift()!;

    if (visited.has(current.url) || current.depth > MAX_INDEX_DEPTH) {
      continue;
    }

    visited.add(current.url);

    console.log(
      `[WORLD HISTORICAL DOWNLOAD] ${source.year}: scanning ${current.url}`
    );

    const html = await fetchHtml(current.url);
    const $ = cheerio.load(html);

    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) return;

      const linkText = cleanText($(element).text());

      // Parse the root index independently of URL normalization: some
      // archive entries link to modern match routes, not static HTML files.
      if (current.depth === 0) {
        const parsed = parseHistoricalMatchLink(linkText, source.year);

        if (parsed) {
          const key = `${parsed.phase}:${parsed.ordinal}`;

          const previous = parsedFixtures.get(key);

          if (
            previous &&
            (previous.team1Code !== parsed.team1Code ||
              previous.team2Code !== parsed.team2Code ||
              previous.dateToken !== parsed.dateToken)
          ) {
            fail(`${source.year}: conflicting index labels for ${key}.`);
          }

          parsedFixtures.set(key, parsed);
        }
      }

      const normalizedUrl = normalizeEditionUrl(
        href,
        current.url,
        source
      );

      if (!normalizedUrl) return;

      if (isCanonicalScorecardUrl(normalizedUrl, source)) {
        discoveredUrls.add(normalizedUrl);
        return;
      }

      if (
        current.depth < MAX_INDEX_DEPTH &&
        isIndexPageUrl(normalizedUrl) &&
        !visited.has(normalizedUrl)
      ) {
        queue.push({
          url: normalizedUrl,
          depth: current.depth + 1,
        });
      }
    });
  }

  const rawFixtures = [...parsedFixtures.values()];

  if (rawFixtures.length !== source.expectedMatchCount) {
    console.error(
      `[WORLD HISTORICAL DOWNLOAD] ${source.year}: parsed ${rawFixtures.length} index fixtures; expected ${source.expectedMatchCount}.`
    );

    for (const fixture of rawFixtures) {
      console.error(`  ${fixture.label}`);
    }

    fail(
      `${source.year}: index fixture inventory is incomplete or ambiguous. No manifest written.`
    );
  }

  const fixtures = assignMatchNumbers(rawFixtures, source);
  const candidates = fixtures.map((match) => ({
    sourceMatchId:
      `${editionCode(source).toLowerCase()}_match_${String(
        match.matchNumber
      ).padStart(2, "0")}_${match.team1Code.toLowerCase()}_${match.team2Code.toLowerCase()}_${match.dateToken.toLowerCase()}`,
    match,
    urlCandidates: buildUrlCandidates(
      source,
      match,
      [...discoveredUrls]
    ),
  }));

  const matchNumbers = candidates.map((candidate) => candidate.match.matchNumber);

  if (
    candidates.length !== source.expectedMatchCount ||
    new Set(matchNumbers).size !== source.expectedMatchCount
  ) {
    fail(`${source.year}: final candidate count or match-number uniqueness failed.`);
  }

  console.log(
    `[WORLD HISTORICAL DOWNLOAD] ${source.year}: ${candidates.length} fixtures mapped to match numbers.`
  );

  return candidates;
}

async function downloadAndValidateCandidate(
  source: HistoricalWorldSource,
  candidate: Candidate,
  editionDirectory: string
): Promise<MatchManifestEntry> {
  const failures: string[] = [];

  for (const url of candidate.urlCandidates) {
    const cacheKey = sha256(url);
    const file = `${cacheKey}.html`;
    const filePath = path.join(editionDirectory, file);

    let html: string | null = null;

    if (fs.existsSync(filePath)) {
      const cached = fs.readFileSync(filePath, "utf8");

      if (
        isValidScorecardStructure(cached, source) &&
        matchesExpectedFixture(cached, candidate.match)
      ) {
        html = cached;
      } else {
        fs.rmSync(filePath, { force: true });
      }
    }

    if (html === null) {
      try {
        console.log(
          `[WORLD HISTORICAL DOWNLOAD] ${source.year}: trying match ${candidate.match.matchNumber}: ${url}`
        );

        html = await fetchHtml(url);
      } catch (error) {
        failures.push(
          `${url}: ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
    }

    if (!isValidScorecardStructure(html, source)) {
      failures.push(`${url}: downloaded HTML failed scorecard-structure checks.`);
      continue;
    }

    if (!matchesExpectedFixture(html, candidate.match)) {
      failures.push(
        `${url}: scorecard did not match expected teams/date ` +
        `(${candidate.match.team1} v ${candidate.match.team2}, ${candidate.match.dateToken}).`
      );
      continue;
    }

    fs.writeFileSync(filePath, html, "utf8");

    return {
      sourceMatchId: candidate.sourceMatchId,
      url,
      file,
      cacheKey,
    };
  }

  fail(
    `${source.year}/${candidate.sourceMatchId}: no candidate URL passed validation.\n` +
    failures.slice(-8).map((failure) => `  - ${failure}`).join("\n")
  );
}

async function downloadEdition(
  source: HistoricalWorldSource
): Promise<void> {
  const candidates = await discoverScorecards(source);
  const editionDirectory = path.join(CACHE_ROOT, String(source.year));

  ensureDirectory(editionDirectory);

  const entries: MatchManifestEntry[] = [];

  // Do not publish a manifest until every expected match passes validation.
  for (const candidate of candidates) {
    entries.push(
      await downloadAndValidateCandidate(
        source,
        candidate,
        editionDirectory
      )
    );
  }

  if (
    entries.length !== source.expectedMatchCount ||
    new Set(entries.map((entry) => entry.sourceMatchId)).size !==
    source.expectedMatchCount ||
    new Set(entries.map((entry) => entry.url)).size !==
    source.expectedMatchCount
  ) {
    fail(`${source.year}: final scorecard count or uniqueness check failed.`);
  }

  const manifest: EditionManifest = {
    year: source.year,
    seasonName: source.seasonName,
    provider: source.provider,
    archiveRoot: source.archiveRoot,
    expectedMatchCount: source.expectedMatchCount,
    retrievedAt: new Date().toISOString(),
    matches: entries,
  };

  const manifestPath = path.join(editionDirectory, "manifest.json");
  const temporaryPath = `${manifestPath}.tmp`;

  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  fs.renameSync(temporaryPath, manifestPath);

  console.log(
    `[WORLD HISTORICAL DOWNLOAD] ${source.year}: ${entries.length} validated scorecards cached.`
  );
}

async function main(): Promise<void> {
  console.log("[WORLD HISTORICAL DOWNLOAD] Starting.");

  const yearArgument = process.argv[2];
  const requestedYear = yearArgument ? Number(yearArgument) : null;

  if (
    requestedYear !== null &&
    (!Number.isInteger(requestedYear) || requestedYear < 1900)
  ) {
    fail(`Invalid year argument: ${yearArgument}`);
  }

  const sources = requestedYear
    ? WORLD_HISTORICAL_SOURCES.filter(
      (source) => source.year === requestedYear
    )
    : WORLD_HISTORICAL_SOURCES;

  if (sources.length === 0) {
    fail(`Unknown year argument: ${yearArgument}`);
  }

  for (const source of sources) {
    await downloadEdition(source);
  }

  console.log("[WORLD HISTORICAL DOWNLOAD] Successful.");
}

main().catch((error: unknown) => {
  console.error("[WORLD HISTORICAL DOWNLOAD] Failed:", error);
  process.exitCode = 1;
});
