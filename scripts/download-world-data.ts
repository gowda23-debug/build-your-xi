import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

import {
  WORLD_AVAILABLE_EDITIONS,
} from "./data/world/editions";

const ROOT = process.cwd();

const RAW_DIRECTORY = path.join(
  ROOT,
  "scripts",
  "data",
  "world",
  "raw"
);

const DOWNLOAD_DIRECTORY = path.join(
  ROOT,
  "scripts",
  "data",
  "world",
  "downloads"
);

const CRICSHEET_URL =
  "https://cricsheet.org/downloads/icc_mens_cricket_world_cup_json.zip";

const SOURCE_URL =
  "https://cricsheet.org/downloads/";

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(
    `[WORLD DOWNLOAD] ${message}`
  );
}

function ensureDirectory(directory: string) {
  if (fs.existsSync(directory)) {
    if (!fs.statSync(directory).isDirectory()) {
      fail(
        `"${directory}" exists but is not a directory.`
      );
    }

    return;
  }

  fs.mkdirSync(directory, {
    recursive: true,
  });
}

async function downloadArchive(): Promise<string> {
  ensureDirectory(DOWNLOAD_DIRECTORY);

  const archivePath = path.join(
    DOWNLOAD_DIRECTORY,
    "icc_mens_cricket_world_cup_json.zip"
  );

  console.log(
    "[WORLD DOWNLOAD] Downloading Cricsheet World Cup archive..."
  );

  const response = await fetch(
    CRICSHEET_URL
  );

  if (!response.ok) {
    fail(
      `Cricsheet download failed with HTTP ${response.status}.`
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if (buffer.length < 1000) {
    fail(
      "Downloaded archive is unexpectedly small."
    );
  }

  fs.writeFileSync(
    archivePath,
    buffer
  );

  console.log(
    `[WORLD DOWNLOAD] Archive downloaded: ${(
      buffer.length /
      1024 /
      1024
    ).toFixed(2)} MB`
  );

  return archivePath;
}

function extractArchive(
  archivePath: string
): string {
  const extractionDirectory =
    path.join(
      DOWNLOAD_DIRECTORY,
      "extracted"
    );

  if (
    fs.existsSync(
      extractionDirectory
    )
  ) {
    fs.rmSync(
      extractionDirectory,
      {
        recursive: true,
        force: true,
      }
    );
  }

  fs.mkdirSync(
    extractionDirectory,
    {
      recursive: true,
    }
  );

  console.log(
    "[WORLD DOWNLOAD] Extracting archive..."
  );

  const zip =
    new AdmZip(
      archivePath
    );

  zip.extractAllTo(
    extractionDirectory,
    true
  );

  return extractionDirectory;
}

function loadMatchFiles(
  directory: string
): Array<{
  filePath: string;
  data: JsonObject;
}> {
  const result: Array<{
    filePath: string;
    data: JsonObject;
  }> = [];

  const files =
    fs.readdirSync(
      directory
    );

  for (
    const file of files
  ) {
    if (
      !file.endsWith(
        ".json"
      )
    ) {
      continue;
    }

    const filePath =
      path.join(
        directory,
        file
      );

    const raw =
      fs.readFileSync(
        filePath,
        "utf8"
      );

    if (!raw.trim()) {
      continue;
    }

    let parsed: unknown;

    try {
      parsed =
        JSON.parse(raw);
    } catch {
      continue;
    }

    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(parsed)
    ) {
      continue;
    }

    result.push({
      filePath,
      data:
        parsed as JsonObject,
    });
  }

  return result;
}

function getYear(
  data: JsonObject
): number | null {
  const info =
    data.info;

  if (
    !info ||
    typeof info !==
      "object" ||
    Array.isArray(info)
  ) {
    return null;
  }

  const infoObject =
    info as JsonObject;

  const dates =
    infoObject.dates;

  if (
    Array.isArray(dates) &&
    dates.length > 0 &&
    typeof dates[0] ===
      "string"
  ) {
    const year = Number(
      dates[0].slice(0, 4)
    );

    if (
      Number.isInteger(
        year
      )
    ) {
      return year;
    }
  }

  const season =
    infoObject.season;

  if (
    typeof season ===
    "string"
  ) {
    const match =
      season.match(
        /\d{4}/
      );

    if (match) {
      return Number(
        match[0]
      );
    }
  }

  return null;
}

function getEventName(
  data: JsonObject
): string | null {
  const info =
    data.info;

  if (
    !info ||
    typeof info !==
      "object" ||
    Array.isArray(info)
  ) {
    return null;
  }

  const event =
    (info as JsonObject)
      .event;

  if (
    !event ||
    typeof event !==
      "object" ||
    Array.isArray(event)
  ) {
    return null;
  }

  const name =
    (event as JsonObject)
      .name;

  return typeof name ===
    "string"
    ? name
    : null;
}

function isWorldCupMatch(
  data: JsonObject
): boolean {
  const event =
    getEventName(
      data
    );

  if (!event) {
    return false;
  }

  return (
    event
      .toLowerCase()
      .includes(
        "world cup"
      )
  );
}

function writeRawFiles(
  matches: Array<{
    filePath: string;
    data: JsonObject;
  }>
) {
  ensureDirectory(
    RAW_DIRECTORY
  );

  const supportedYears =
    new Set(
      WORLD_AVAILABLE_EDITIONS.map(
        (edition) =>
          edition.year
      )
    );

  const byYear =
    new Map<
      number,
      JsonObject[]
    >();

  for (
    const match of matches
  ) {
    if (
      !isWorldCupMatch(
        match.data
      )
    ) {
      continue;
    }

    const year =
      getYear(
        match.data
      );

    if (
      year === null ||
      !supportedYears.has(
        year
      )
    ) {
      continue;
    }

    const current =
      byYear.get(
        year
      ) ?? [];

    current.push(
      match.data
    );

    byYear.set(
      year,
      current
    );
  }

  for (
    const edition of
      WORLD_AVAILABLE_EDITIONS
  ) {
    const matchesForYear =
      byYear.get(
        edition.year
      ) ?? [];

    if (
      matchesForYear.length ===
      0
    ) {
      fail(
        `No World Cup matches were found for ${edition.year}.`
      );
    }

    const output = {
      source: {
        provider:
          "Cricsheet",
        url:
          SOURCE_URL,
        archive:
          CRICSHEET_URL,
        format:
          "Cricsheet JSON",
      },

      year:
        edition.year,

      seasonName:
        edition.seasonName,

      format:
        edition.format,

      competition:
        edition.competition,

      oversPerInnings:
        edition.oversPerInnings,

      matches:
        matchesForYear,
    };

    const outputPath =
      path.join(
        RAW_DIRECTORY,
        `${edition.year}.json`
      );

    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(
        output,
        null,
        2
      )}\n`,
      "utf8"
    );

    console.log(
      `[WORLD DOWNLOAD] ${edition.year}: ${matchesForYear.length} matches`
    );
  }
}

async function main() {
  console.log(
    "[WORLD DOWNLOAD] Starting."
  );

  console.log(
    `[WORLD DOWNLOAD] Supported editions: ${WORLD_AVAILABLE_EDITIONS.map(
      (edition) =>
        edition.year
    ).join(", ")}`
  );

  console.log(
    "[WORLD DOWNLOAD] Historical editions before 2003 remain disabled until complete verified source data is available."
  );

  const archivePath =
    await downloadArchive();

  const extractionDirectory =
    extractArchive(
      archivePath
    );

  const matches =
    loadMatchFiles(
      extractionDirectory
    );

  console.log(
    `[WORLD DOWNLOAD] JSON match files discovered: ${matches.length}`
  );

  writeRawFiles(
    matches
  );

  console.log(
    "[WORLD DOWNLOAD] Successful."
  );
}

main().catch(
  (error) => {
    console.error(
      "[WORLD DOWNLOAD] Failed:",
      error
    );

    process.exit(1);
  }
);