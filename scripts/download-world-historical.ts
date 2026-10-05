import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
  provider: "ESPNcricinfo";
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
  "i.imgci.com",
  "img.cricinfo.com",
]);

const MAX_PAGES_PER_EDITION = 250;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

function fail(message: string): never {
  throw new Error(`[WORLD HISTORICAL DOWNLOAD] ${message}`);
}

function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
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
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function extractLinks(html: string, baseUrl: string): Link[] {
  const result: Link[] = [];
  const seen = new Set<string>();
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(regex)) {
    const rawHref = match[1]?.trim();
    const rawText = match[2] ?? "";

    if (!rawHref || rawHref.startsWith("#")) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(rawHref, baseUrl);
    } catch {
      continue;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
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
      text: stripHtml(rawText),
    });
  }

  return result;
}

function isWithinEdition(candidate: string, root: URL): boolean {
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  if (!ALLOWED_HOSTS.has(url.hostname)) {
    return false;
  }

  if (url.hostname !== root.hostname) {
    return false;
  }

  const rootPath = root.pathname.endsWith("/")
    ? root.pathname
    : `${root.pathname}/`;

  return url.pathname.startsWith(rootPath);
}

function looksLikeMatchPage(html: string): boolean {
  const text = stripHtml(html);

  return (
    /CricInfo Version/i.test(text) &&
    /Result\s*:/i.test(text) &&
    /\bv(?:s\.?|ersus)?\b/i.test(text)
  );
}

async function fetchHtml(url: string): Promise<string> {
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

    const contentType =
      response.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error(
        `Unexpected content-type for ${url}: ${contentType}`
      );
    }

    const body = await response.text();

    if (Buffer.byteLength(body, "utf8") > MAX_HTML_BYTES) {
      throw new Error(
        `Response exceeds ${MAX_HTML_BYTES} bytes.`
      );
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function crawlEdition(
  source: HistoricalWorldSource
): Promise<MatchManifestEntry[]> {
  const root = new URL(source.archiveRoot);
  const queue = [source.archiveRoot];
  const visited = new Set<string>();
  const matches = new Map<string, MatchManifestEntry>();
  let pagesFetched = 0;

  while (queue.length > 0 && pagesFetched < MAX_PAGES_PER_EDITION) {
    const current = queue.shift();

    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    let html: string;

    try {
      html = await fetchHtml(current);
    } catch (error) {
      console.warn(
        `[WORLD HISTORICAL DOWNLOAD] Skipping ${current}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      continue;
    }

    pagesFetched += 1;

    if (looksLikeMatchPage(html)) {
      const id = sha256(current).slice(0, 24);
      matches.set(current, {
        id,
        url: current,
        file: `${id}.html`,
      });
    }

    for (const link of extractLinks(html, current)) {
      if (!isWithinEdition(link.url, root)) {
        continue;
      }

      const matchText =
        /\b(?:match|semi[- ]final|final|group|round|scorecard|results?)\b/i.test(
          link.text
        );
      const matchUrl = /(?:MATCH|SCORE|ODI|WC\d+_)/i.test(link.url);

      if (matchText || matchUrl) {
        queue.push(link.url);
      }
    }
  }

  if (pagesFetched >= MAX_PAGES_PER_EDITION) {
    console.warn(
      `[WORLD HISTORICAL DOWNLOAD] ${source.year}: page limit ${MAX_PAGES_PER_EDITION} reached.`
    );
  }

  return [...matches.values()].sort((a, b) =>
    a.url.localeCompare(b.url)
  );
}

async function main(): Promise<void> {
  for (const source of WORLD_HISTORICAL_SOURCES) {
    console.log(
      `[WORLD HISTORICAL DOWNLOAD] Crawling ${source.year}...`
    );

    const entries = await crawlEdition(source);

    if (entries.length !== source.expectedMatchCount) {
      fail(
        `${source.year}: discovered ${entries.length} match pages; expected ${source.expectedMatchCount}. No incomplete edition will be cached.`
      );
    }

    const editionDirectory = path.join(
      CACHE_ROOT,
      String(source.year)
    );

    ensureDirectory(editionDirectory);

    for (const entry of entries) {
      const filePath = path.join(
        editionDirectory,
        entry.file
      );

      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(
          filePath,
          await fetchHtml(entry.url),
          "utf8"
        );
      }
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

    fs.writeFileSync(
      path.join(editionDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    console.log(
      `[WORLD HISTORICAL DOWNLOAD] ${source.year}: ${entries.length} match pages cached.`
    );
  }

  console.log(
    "[WORLD HISTORICAL DOWNLOAD] Successful."
  );
}

main().catch((error) => {
  console.error(
    "[WORLD HISTORICAL DOWNLOAD] Failed:",
    error
  );
  process.exit(1);
});
