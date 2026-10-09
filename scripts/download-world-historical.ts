
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

type Candidate = {
  sourceMatchId: string;
  url: string;
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

    // Canonicalize host/protocol to keep stable cache keys.
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

    // Keep canonical match scorecards only. Exclude report variants,
    // previews, commentary, and warm-up pages.
    const pattern = new RegExp(
      `_${code}_ODI[^/]*_\\d{1,2}[A-Z]{3}${source.year}\\.html$`,
      "i"
    );

    return pattern.test(filename);
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

    const filename = path.posix.basename(url.pathname);

    return /(?:SUMMARY|MATCHES|SCORECARDS|RESULTS|AVERAGES|POINTS|PLAYERS|INDEX|GROUP|SCHEDULE|FIXTURES)/i.test(
      filename
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
      fail(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }

    const finalUrl = new URL(response.url);

    if (!isAllowedHost(finalUrl.hostname)) {
      fail(`Redirected to an unapproved host: ${finalUrl.hostname}`);
    }

    const body = await response.text();

    if (!body.trim()) {
      fail(`Empty response from ${url}`);
    }

    if (Buffer.byteLength(body, "utf8") > MAX_HTML_BYTES) {
      fail(`Response exceeded ${MAX_HTML_BYTES} bytes: ${url}`);
    }

    const $ = cheerio.load(body);
    const title = cleanText($("title").text());
    const preview = cleanText($("body").text()).slice(0, 250);

    if (
      /access denied|captcha|verify you are human|request blocked/i.test(
        `${title} ${preview}`
      )
    ) {
      fail(`Access-blocked or challenge page received from ${url}`);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function getRowTexts(html: string): string[] {
  const $ = cheerio.load(html);

  return $("tr")
    .map((_, row) =>
      cleanText(
        $(row)
          .find("th,td")
          .map((__, cell) => cleanText($(cell).text()))
          .get()
          .join(" ")
      )
    )
    .get();
}

function isValidScorecard(
  html: string,
  source: HistoricalWorldSource
): boolean {
  const $ = cheerio.load(html);
  const body = cleanText($("body").text());
  const rows = getRowTexts(html);

  const inningsHeaders = rows.filter(
    (row) =>
      /\binnings\b/i.test(row) &&
      /\bR\s+M\s+B\b/i.test(row)
  );

  const hasBowlingHeader = rows.some(
    (row) => /\bBowling\s+O\s+M\s+R\s+W\b/i.test(row)
  );

  const hasYear = new RegExp(`\\b${source.year}\\b`).test(body);

  return (
    hasYear &&
    inningsHeaders.length >= 2 &&
    hasBowlingHeader &&
    /\bResult\b/i.test(body)
  );
}

async function discoverScorecards(
  source: HistoricalWorldSource
): Promise<Candidate[]> {
  type QueueEntry = {
    url: string;
    depth: number;
  };

  const queue: QueueEntry[] = [
    { url: source.archiveRoot, depth: 0 },
  ];

  const visited = new Set<string>();
  const candidates = new Map<string, string>();

  while (queue.length > 0) {
    if (visited.size >= MAX_INDEX_PAGES) {
      fail(
        `${source.year}: reached the index-page safety limit (${MAX_INDEX_PAGES}).`
      );
    }

    const current = queue.shift()!;

    if (
      visited.has(current.url) ||
      current.depth > MAX_INDEX_DEPTH
    ) {
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

      if (!href) {
        return;
      }

      const url = normalizeEditionUrl(
        href,
        current.url,
        source
      );

      if (!url) {
        return;
      }

      if (isCanonicalScorecardUrl(url, source)) {
        const filename = path.posix.basename(
          new URL(url).pathname
        );

        const sourceMatchId = filename
          .replace(/\.html$/i, "")
          .toLowerCase();

        const previous = candidates.get(sourceMatchId);

        if (previous && previous !== url) {
          fail(
            `${source.year}: duplicate canonical match ID ${sourceMatchId}: ${previous} and ${url}`
          );
        }

        candidates.set(sourceMatchId, url);
        return;
      }

      if (
        current.depth < MAX_INDEX_DEPTH &&
        isIndexPageUrl(url) &&
        !visited.has(url)
      ) {
        queue.push({
          url,
          depth: current.depth + 1,
        });
      }
    });
  }

  const result = [...candidates.entries()]
    .map(([sourceMatchId, url]) => ({
      sourceMatchId,
      url,
    }))
    .sort((a, b) => a.url.localeCompare(b.url));

  console.log(
    `[WORLD HISTORICAL DOWNLOAD] ${source.year}: ${result.length} canonical scorecards discovered.`
  );

  if (result.length !== source.expectedMatchCount) {
    console.error(
      `[WORLD HISTORICAL DOWNLOAD] ${source.year} discovered scorecard URLs:`
    );

    for (const candidate of result) {
      console.error(`  ${candidate.sourceMatchId} -> ${candidate.url}`);
    }

    fail(
      `${source.year}: found ${result.length} canonical scorecards; expected ${source.expectedMatchCount}. No manifest written.`
    );
  }

  return result;
}

async function downloadEdition(
  source: HistoricalWorldSource
): Promise<void> {
  const candidates = await discoverScorecards(source);
  const editionDirectory = path.join(
    CACHE_ROOT,
    String(source.year)
  );

  ensureDirectory(editionDirectory);

  const entries: MatchManifestEntry[] = [];

  // Download and validate every page before publishing a new manifest.
  for (const candidate of candidates) {
    const cacheKey = sha256(candidate.url);
    const file = `${cacheKey}.html`;
    const filePath = path.join(editionDirectory, file);

    let html: string | null = null;

    if (fs.existsSync(filePath)) {
      const cached = fs.readFileSync(filePath, "utf8");

      if (isValidScorecard(cached, source)) {
        html = cached;
      } else {
        fs.rmSync(filePath, { force: true });
      }
    }

    if (html === null) {
      console.log(
        `[WORLD HISTORICAL DOWNLOAD] ${source.year}: downloading ${candidate.sourceMatchId}`
      );

      html = await fetchHtml(candidate.url);
    }

    if (!isValidScorecard(html, source)) {
      fail(
        `${source.year}/${candidate.sourceMatchId}: invalid ESPNcricinfo scorecard HTML: ${candidate.url}`
      );
    }

    fs.writeFileSync(filePath, html, "utf8");

    entries.push({
      sourceMatchId: candidate.sourceMatchId,
      url: candidate.url,
      file,
      cacheKey,
    });
  }

  if (
    entries.length !== source.expectedMatchCount ||
    new Set(entries.map((entry) => entry.sourceMatchId)).size !==
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

  const manifestPath = path.join(
    editionDirectory,
    "manifest.json"
  );

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

  for (const source of sources) {
    await downloadEdition(source);
  }

  console.log("[WORLD HISTORICAL DOWNLOAD] Successful.");
}

main().catch((error: unknown) => {
  console.error("[WORLD HISTORICAL DOWNLOAD] Failed:", error);
  process.exitCode = 1;
});
