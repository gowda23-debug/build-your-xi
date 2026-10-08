import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import {
  WORLD_HISTORICAL_SOURCES,
  type HistoricalWorldSource,
} from "./data/world/historical-sources";

type Link = {
  url: string;
  text: string;
};

type MatchManifestEntry = {
  id: string;
  url: string;
  file: string;
};

type EditionManifest = {
  year: number;
  seasonName: string;
  provider: "CricketArchive";
  archiveRoot: string;
  expectedMatchCount: number;
  retrievedAt: string;
  matches: MatchManifestEntry[];
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
  "www.cricketarchive.com",
  "cricketarchive.com",
]);

const MAX_HTML_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

function fail(message: string): never {
  throw new Error(
    `[WORLD HISTORICAL DOWNLOAD] ${message}`
  );
}

function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, {
    recursive: true,
  });
}

function sha256(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(
        /<script\b[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style\b[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function extractLinks(
  html: string,
  baseUrl: string
): Link[] {
  const result: Link[] = [];
  const seen = new Set<string>();

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(regex)) {
    const rawHref = match[1]?.trim();

    if (!rawHref || rawHref.startsWith("#")) {
      continue;
    }

    let url: URL;

    try {
      url = new URL(rawHref, baseUrl);
    } catch {
      continue;
    }

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      continue;
    }

    if (
      !ALLOWED_HOSTS.has(
        url.hostname.toLowerCase()
      )
    ) {
      continue;
    }

    url.hash = "";

    const normalized = url.toString();

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);

    result.push({
      url: normalized,
      text: stripHtml(match[2] ?? ""),
    });
  }

  return result;
}

function isScorecardUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (
      !ALLOWED_HOSTS.has(
        parsed.hostname.toLowerCase()
      )
    ) {
      return false;
    }

    return /\/Archive\/Scorecards\/\d+\/\d+\.html$/i.test(
      parsed.pathname
    );
  } catch {
    return false;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const parsed = new URL(url);

    const alternateHost =
      parsed.hostname.toLowerCase() ===
        "www.cricketarchive.com"
        ? "cricketarchive.com"
        : "www.cricketarchive.com";

    const urlsToTry = [
      parsed.toString(),
      (() => {
        const alternate = new URL(parsed.toString());
        alternate.hostname = alternateHost;
        return alternate.toString();
      })(),
    ];

    let lastError: Error | null = null;

    for (const candidateUrl of urlsToTry) {
      try {
        const response = await fetch(candidateUrl, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language":
              "en-US,en;q=0.9",
            "Cache-Control":
              "no-cache",
            Pragma:
              "no-cache",
            Referer:
              "https://www.cricketarchive.com/",
            "Upgrade-Insecure-Requests":
              "1",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          lastError = new Error(
            `HTTP ${response.status} ${response.statusText}`
          );

          continue;
        }

        const contentType =
          response.headers.get("content-type") ?? "";

        if (
          contentType &&
          !contentType
            .toLowerCase()
            .includes("text/html")
        ) {
          lastError = new Error(
            `Unexpected content-type ${contentType}`
          );

          continue;
        }

        const body = await response.text();

        if (
          Buffer.byteLength(body, "utf8") >
          MAX_HTML_BYTES
        ) {
          lastError = new Error(
            `Response exceeds ${MAX_HTML_BYTES} bytes.`
          );

          continue;
        }

        return body;
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error(String(error));
      }
    }

    throw (
      lastError ??
      new Error("Unable to retrieve CricketArchive page.")
    );
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeHistoricalMatch(
  html: string,
  source: HistoricalWorldSource
): boolean {
  const text = stripHtml(html);

  /*
   * Warm-up scorecards are also present on the
   * CricketArchive event pages. The tournament
   * name is present on actual World Cup scorecards,
   * so use that as the authoritative filter.
   */
  if (
    !text
      .toLowerCase()
      .includes(source.seasonName.toLowerCase())
  ) {
    return false;
  }

  /*
   * A real scorecard must expose both innings.
   */
  const inningsCount = (
    text.match(/\binnings\b/gi) ?? []
  ).length;

  if (inningsCount < 2) {
    return false;
  }

  /*
   * Batting and bowling sections must both exist.
   */
  if (
    !/Runs\s+Balls/i.test(text) ||
    !/Overs\s+Mdns\s+Runs\s+Wkts/i.test(text)
  ) {
    return false;
  }

  return true;
}

async function discoverMatchPages(
  source: HistoricalWorldSource
): Promise<MatchManifestEntry[]> {
  console.log(
    `[WORLD HISTORICAL DOWNLOAD] Reading tournament index ${source.year}...`
  );

  const eventHtml = await fetchHtml(
    source.archiveRoot
  );

  const links = extractLinks(
    eventHtml,
    source.archiveRoot
  );

  const candidateLinks = links.filter(
    (link) => isScorecardUrl(link.url)
  );
console.log(
  "[WORLD HISTORICAL DOWNLOAD] Scorecard candidates:"
);

for (const link of candidateLinks) {
  console.log(
    `  ${link.url} | ${link.text}`
  );
}
  console.log(
    `[WORLD HISTORICAL DOWNLOAD] ${source.year}: ${candidateLinks.length} scorecard candidates found.`
  );

  /*
   * CricketArchive uses:
   *
   *   o<number>
   *
   * for the actual tournament matches.
   *
   * Warm-up matches use IDs such as:
   *
   *   misc<number>
   *
   * Therefore we must inspect the scorecard URL
   * itself rather than the anchor text.
   *
   * Example 1975:
   *
   *   .../Scorecards/.../35182.html -> o19
   *   .../Scorecards/.../35183.html -> o20
   *   ...
   *
   * The event page lists the actual World Cup
   * matches as o19 through o33.
   */

  const tournamentLinks = candidateLinks.filter(
    (link) => {
      /*
       * Extract the CricketArchive scorecard number.
       *
       * Example:
       * /Archive/Scorecards/35/35182.html
       *                         ^^^^^
       */
      const match = link.url.match(
        /\/Archive\/Scorecards\/\d+\/(\d+)\.html$/i
      );

      return Boolean(match);
    }
  );

  /*
   * At this point we cannot distinguish warm-ups
   * from tournament matches from the numeric URL
   * alone.
   *
   * Therefore use the actual tournament index
   * structure to identify the rows containing the
   * tournament match links.
   */

  const tournamentMatchUrls =
    extractTournamentMatchUrls(
      eventHtml,
      source.archiveRoot
    );

  console.log(
    `[WORLD HISTORICAL DOWNLOAD] ${source.year}: ${tournamentMatchUrls.length} tournament match links found.`
  );

  if (
    tournamentMatchUrls.length !==
    source.expectedMatchCount
  ) {
    fail(
      `${source.year}: tournament index produced ${tournamentMatchUrls.length} World Cup scorecards; expected ${source.expectedMatchCount}.`
    );
  }

  const matches = tournamentMatchUrls.map(
    (url) => {
      const id = sha256(url).slice(0, 24);

      return {
        id,
        url,
        file: `${id}.html`,
      };
    }
  );

  return matches;
}

async function downloadEdition(
  source: HistoricalWorldSource
): Promise<void> {
  const entries =
    await discoverMatchPages(source);

  if (
    entries.length !==
    source.expectedMatchCount
  ) {
    fail(
      `${source.year}: discovered ${entries.length} historical World Cup scorecards; expected ${source.expectedMatchCount}. No incomplete edition will be cached.`
    );
  }

  const editionDirectory =
    path.join(
      CACHE_ROOT,
      String(source.year)
    );

  /*
   * Only create the edition directory after
   * discovery has passed the exact-count check.
   */
  ensureDirectory(editionDirectory);

  for (const entry of entries) {
    const filePath = path.join(
      editionDirectory,
      entry.file
    );

    if (fs.existsSync(filePath)) {
      continue;
    }

    console.log(
      `[WORLD HISTORICAL DOWNLOAD] ${source.year}: downloading ${entry.url}`
    );

    const html = await fetchHtml(
      entry.url
    );

    if (
      !looksLikeHistoricalMatch(
        html,
        source
      )
    ) {
      fail(
        `${source.year}: downloaded page failed historical scorecard validation: ${entry.url}`
      );
    }

    fs.writeFileSync(
      filePath,
      html,
      "utf8"
    );
  }

  const manifest: EditionManifest = {
    year: source.year,
    seasonName: source.seasonName,
    provider: source.provider,
    archiveRoot: source.archiveRoot,
    expectedMatchCount:
      source.expectedMatchCount,
    retrievedAt:
      new Date().toISOString(),
    matches: entries,
  };

  fs.writeFileSync(
    path.join(
      editionDirectory,
      "manifest.json"
    ),
    `${JSON.stringify(
      manifest,
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `[WORLD HISTORICAL DOWNLOAD] ${source.year}: ${entries.length} match pages cached.`
  );
}

async function main(): Promise<void> {
  console.log(
    "[WORLD HISTORICAL DOWNLOAD] Starting CricketArchive historical World Cup download."
  );

  for (
    const source of WORLD_HISTORICAL_SOURCES
  ) {
    await downloadEdition(source);
  }

  console.log(
    "[WORLD HISTORICAL DOWNLOAD] Successful."
  );
}
function extractTournamentMatchUrls(
  html: string,
  baseUrl: string
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  /*
   * CricketArchive's World Cup event pages identify
   * actual tournament matches with:
   *
   *   o19, o20, ..., o33
   *
   * Warm-up matches use misc... identifiers.
   *
   * We extract scorecard links and associate them
   * with the surrounding event-page entry.
   */

  const $ = cheerio.load(html);

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    let url: URL;

    try {
      url = new URL(href, baseUrl);
    } catch {
      return;
    }

    if (
      !ALLOWED_HOSTS.has(
        url.hostname.toLowerCase()
      )
    ) {
      return;
    }

    if (!isScorecardUrl(url.toString())) {
      return;
    }

    /*
     * Search the closest useful event-page container.
     *
     * We deliberately inspect several ancestors
     * because CricketArchive has changed its HTML
     * structure over time.
     */
    let container = $(element).closest("tr");

    if (!container.length) {
      container = $(element).parent();
    }

    let context = "";

    for (
      let level = 0;
      level < 5 && container.length;
      level++
    ) {
      context = container.text()
        .replace(/\s+/g, " ")
        .trim();

      if (/\bo\d+\b/i.test(context)) {
        break;
      }

      container = container.parent();
    }

    if (!/\bo\d+\b/i.test(context)) {
      return;
    }

    url.hash = "";

    const normalized = url.toString();

    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

main().catch((error) => {
  console.error(
    "[WORLD HISTORICAL DOWNLOAD] Failed:",
    error
  );

  process.exit(1);
});