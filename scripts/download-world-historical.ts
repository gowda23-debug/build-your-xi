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

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return (
      (parsed.protocol === "http:" ||
        parsed.protocol === "https:") &&
      ALLOWED_HOSTS.has(
        parsed.hostname.toLowerCase()
      )
    );
  } catch {
    return false;
  }
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

    const candidates = [
      parsed.toString(),
      (() => {
        const alternate = new URL(
          parsed.toString()
        );

        alternate.hostname =
          alternateHost;

        return alternate.toString();
      })(),
    ];

    let lastError: Error | null = null;

    for (const candidate of candidates) {
      try {
        const response = await fetch(
          candidate,
          {
            method: "GET",
            redirect: "follow",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language":
                "en-US,en;q=0.9",
              Referer:
                "https://www.cricketarchive.com/",
              "Cache-Control":
                "no-cache",
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          lastError = new Error(
            `HTTP ${response.status} ${response.statusText}`
          );

          continue;
        }

        const body =
          await response.text();

        if (
          Buffer.byteLength(
            body,
            "utf8"
          ) > MAX_HTML_BYTES
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
      new Error(
        "Unable to retrieve CricketArchive page."
      )
    );
  } finally {
    clearTimeout(timeout);
  }
}

function extractTournamentMatchEntries(
  html: string,
  baseUrl: string
): Array<{
  sourceMatchId: string;
  url: string;
}> {
  const $ = cheerio.load(html);

  const result: Array<{
    sourceMatchId: string;
    url: string;
  }> = [];

  const seen = new Set<string>();

  $("a[href]").each(
    (_, element) => {
      const href =
        $(element).attr("href");

      if (!href) {
        return;
      }

      let url: URL;

      try {
        url = new URL(
          href,
          baseUrl
        );
      } catch {
        return;
      }

      const normalizedUrl =
        url.toString();

      if (
        !isAllowedUrl(
          normalizedUrl
        ) ||
        !isScorecardUrl(
          normalizedUrl
        )
      ) {
        return;
      }

      let container =
        $(element).closest("tr");

      if (!container.length) {
        container =
          $(element).parent();
      }

      let context = "";

      for (
        let level = 0;
        level < 6 &&
        container.length;
        level++
      ) {
        context = container
          .text()
          .replace(/\s+/g, " ")
          .trim();

        if (
          /\bo\d+\b/i.test(
            context
          )
        ) {
          break;
        }

        container =
          container.parent();
      }

      const sourceMatchId =
        context.match(
          /\b(o\d+)\b/i
        )?.[1];

      /*
       * Warm-ups use misc... identifiers.
       * Only o<number> entries are accepted.
       */
      if (!sourceMatchId) {
        return;
      }

      url.hash = "";

      const finalUrl =
        url.toString();

      const key =
        `${sourceMatchId}|${finalUrl}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);

      result.push({
        sourceMatchId:
          sourceMatchId.toLowerCase(),
        url: finalUrl,
      });
    }
  );

  return result;
}

function looksLikeHistoricalMatch(
  html: string,
  source: HistoricalWorldSource
): boolean {
  const text =
    stripHtml(html).toLowerCase();

  if (
    !text.includes(
      source.seasonName.toLowerCase()
    )
  ) {
    return false;
  }

  if (
    !/\binnings\b/i.test(text)
  ) {
    return false;
  }

  if (
    !/runs\s+balls/i.test(text)
  ) {
    return false;
  }

  if (
    !/overs\s+mdns\s+runs\s+wkts/i.test(
      text
    )
  ) {
    return false;
  }

  return true;
}

async function discoverMatchPages(
  source: HistoricalWorldSource
): Promise<MatchManifestEntry[]> {
  console.log(
    `[WORLD HISTORICAL DOWNLOAD] Reading ${source.year} event page...`
  );

  const eventHtml =
    await fetchHtml(
      source.archiveRoot
    );

  const candidates =
    extractTournamentMatchEntries(
      eventHtml,
      source.archiveRoot
    );

  console.log(
    `[WORLD HISTORICAL DOWNLOAD] ${source.year}: ${candidates.length} tournament scorecards discovered.`
  );

  if (
    candidates.length !==
    source.expectedMatchCount
  ) {
    console.log(
      "[WORLD HISTORICAL DOWNLOAD] Discovered IDs:"
    );

    for (const candidate of candidates) {
      console.log(
        `  ${candidate.sourceMatchId} -> ${candidate.url}`
      );
    }

    fail(
      `${source.year}: discovered ${candidates.length} tournament scorecards; expected ${source.expectedMatchCount}.`
    );
  }

  const seenIds =
    new Set<string>();

  const entries =
    candidates.map(
      (candidate) => {
        if (
          seenIds.has(
            candidate.sourceMatchId
          )
        ) {
          fail(
            `${source.year}: duplicate source match ID ${candidate.sourceMatchId}.`
          );
        }

        seenIds.add(
          candidate.sourceMatchId
        );

        const cacheKey =
          sha256(
            candidate.url
          );

        return {
          sourceMatchId:
            candidate.sourceMatchId,
          url:
            candidate.url,
          file:
            `${cacheKey}.html`,
          cacheKey,
        };
      }
    );

  return entries;
}

async function downloadEdition(
  source: HistoricalWorldSource
): Promise<void> {
  const entries =
    await discoverMatchPages(
      source
    );

  const editionDirectory =
    path.join(
      CACHE_ROOT,
      String(source.year)
    );

  ensureDirectory(
    editionDirectory
  );

  for (const entry of entries) {
    const filePath =
      path.join(
        editionDirectory,
        entry.file
      );

    let html: string;

    if (
      fs.existsSync(filePath)
    ) {
      html =
        fs.readFileSync(
          filePath,
          "utf8"
        );

      if (
        !looksLikeHistoricalMatch(
          html,
          source
        )
      ) {
        fs.rmSync(
          filePath,
          {
            force: true,
          }
        );

        html =
          await fetchHtml(
            entry.url
          );
      }
    } else {
      console.log(
        `[WORLD HISTORICAL DOWNLOAD] ${source.year}: downloading ${entry.sourceMatchId}`
      );

      html =
        await fetchHtml(
          entry.url
        );
    }

    if (
      !looksLikeHistoricalMatch(
        html,
        source
      )
    ) {
      fail(
        `${source.year}/${entry.sourceMatchId}: downloaded page failed scorecard validation.`
      );
    }

    fs.writeFileSync(
      filePath,
      html,
      "utf8"
    );
  }

  const manifest: EditionManifest = {
    year:
      source.year,
    seasonName:
      source.seasonName,
    provider:
      source.provider,
    archiveRoot:
      source.archiveRoot,
    expectedMatchCount:
      source.expectedMatchCount,
    retrievedAt:
      new Date().toISOString(),
    matches:
      entries,
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
    `[WORLD HISTORICAL DOWNLOAD] ${source.year}: ${entries.length} scorecards cached.`
  );
}

async function main(): Promise<void> {
  console.log(
    "[WORLD HISTORICAL DOWNLOAD] Starting."
  );

  for (
    const source of
    WORLD_HISTORICAL_SOURCES
  ) {
    await downloadEdition(
      source
    );
  }

  console.log(
    "[WORLD HISTORICAL DOWNLOAD] Successful."
  );
}

main().catch(
  (error) => {
    console.error(
      "[WORLD HISTORICAL DOWNLOAD] Failed:",
      error
    );

    process.exit(1);
  }
);