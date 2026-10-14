import fs from "node:fs";
import path from "node:path";
import { WORLD_CRICSHEET_EDITIONS } from "./data/world/editions";

type RawMatch = {
  info?: {
    dates?: string[];
    teams?: string[];
    event?: { match_number?: number; name?: string };
    players?: Record<string, string[]>;
    registry?: { people?: Record<string, string> };
  };
  innings?: Array<{
    team: string;
    overs: Array<{ deliveries: Array<{
      batter: string;
      bowler: string;
      non_striker: string;
      runs: { batter: number; extras: number; total: number };
      wickets?: Array<{ player_out: string; fielders?: Array<{ name: string }> }>;
    }> }>;
  }>;
};

type RawEdition = {
  year?: number;
  matches?: RawMatch[];
};

type CoverageEntry = {
  year: number;
  expectedMatchCount: number;
  actualMatchCount: number;
  uniqueMatchCount: number;
  duplicateMatchKeys: string[];
  invalidMatchIndexes: number[];
  status: "complete" | "incomplete" | "missing" | "invalid";
  blockers: string[];
};

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "scripts", "data", "world", "raw");
const REPORT_DIR = path.join(ROOT, "scripts", "data", "world", "reports");
const REPORT_PATH = path.join(REPORT_DIR, "source-coverage.json");

function fail(message: string): never {
  throw new Error(`[WORLD SOURCE AUDIT] ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRawEdition(year: number): RawEdition {
  const filePath = path.join(RAW_DIR, `${year}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing raw file: ${filePath}. Run npm.cmd run data:download-world first.`);
  }

  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) throw new Error(`Raw file is empty: ${filePath}`);

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isObject(value) || !Array.isArray(value.matches)) {
    throw new Error(`${filePath} must be an object containing a matches array.`);
  }
  return value as RawEdition;
}

function auditEdition(year: number, expectedMatchCount: number): CoverageEntry {
  const filePath = path.join(RAW_DIR, `${year}.json`);
  if (!fs.existsSync(filePath)) {
    return {
      year,
      expectedMatchCount,
      actualMatchCount: 0,
      uniqueMatchCount: 0,
      duplicateMatchKeys: [],
      invalidMatchIndexes: [],
      status: "missing",
      blockers: [`Missing ${filePath}`],
    };
  }

  let raw: RawEdition;
  try {
    raw = readRawEdition(year);
  } catch (error) {
    return {
      year,
      expectedMatchCount,
      actualMatchCount: 0,
      uniqueMatchCount: 0,
      duplicateMatchKeys: [],
      invalidMatchIndexes: [],
      status: "invalid",
      blockers: [error instanceof Error ? error.message : String(error)],
    };
  }

  const matches = raw.matches ?? [];
  const seen = new Set<string>();
  const duplicateMatchKeys: string[] = [];
  const invalidMatchIndexes: number[] = [];

  matches.forEach((match, index) => {
    const info = match?.info;
    const date = info?.dates?.[0];
    const teams = info?.teams;
    const people = info?.players;
    const registry = info?.registry?.people;
    const matchYear = typeof date === "string" ? Number(date.slice(0, 4)) : NaN;

    if (
      !info ||
      !Number.isInteger(matchYear) ||
      matchYear !== year ||
      !Array.isArray(teams) ||
      teams.length !== 2 ||
      !teams.every((team) => typeof team === "string" && team.trim()) ||
      !people ||
      typeof people !== "object" ||
      !registry ||
      typeof registry !== "object"
    ) {
      invalidMatchIndexes.push(index);
      return;
    }

    if (!Array.isArray(match.innings) || match.innings.length === 0) {
      invalidMatchIndexes.push(index);
      return;
    }
    const matchNumber = info.event?.match_number ?? "";
    const key = `${date}|${String(matchNumber)}|${[...teams].sort().join("|")}`;
    if (seen.has(key)) duplicateMatchKeys.push(key);
    seen.add(key);

    if (Object.keys(people).length !== 2) {
      invalidMatchIndexes.push(index);
      return;
    }
    for (const [team, names] of Object.entries(people)) {
      if (!Array.isArray(names) || names.length === 0 || !teams.includes(team)) {
        invalidMatchIndexes.push(index);
        return;
      }
      for (const name of names) {
        const id = registry[name];
        if (typeof name !== "string" || !name.trim() || typeof id !== "string" || !/^[0-9a-f]{8}$/i.test(id)) {
          invalidMatchIndexes.push(index);
          return;
        }
      }
    }
    for (const innings of match.innings) {
      if (!innings || !teams.includes(innings.team) || !Array.isArray(innings.overs)) {
        invalidMatchIndexes.push(index);
        return;
      }
      for (const over of innings.overs) {
        if (!over || !Array.isArray(over.deliveries)) {
          invalidMatchIndexes.push(index);
          return;
        }
        for (const delivery of over.deliveries) {
          if (!delivery || typeof delivery.batter !== "string" || typeof delivery.bowler !== "string" || typeof delivery.non_striker !== "string" || !delivery.runs || ![delivery.runs.batter, delivery.runs.extras, delivery.runs.total].every((number) => typeof number === "number" && Number.isFinite(number) && number >= 0)) {
            invalidMatchIndexes.push(index);
            return;
          }
          for (const name of [delivery.batter, delivery.bowler, delivery.non_striker]) {
            const id = registry[name];
            if (typeof id !== "string" || !/^[0-9a-f]{8}$/i.test(id)) {
              invalidMatchIndexes.push(index);
              return;
            }
          }
          for (const wicket of delivery.wickets ?? []) {
            if (!wicket || typeof wicket.player_out !== "string") {
              invalidMatchIndexes.push(index);
              return;
            }
            const dismissedId = registry[wicket.player_out];
            if (typeof dismissedId !== "string" || !/^[0-9a-f]{8}$/i.test(dismissedId)) {
              invalidMatchIndexes.push(index);
              return;
            }
            for (const fielder of wicket.fielders ?? []) {
              if (!fielder || typeof fielder.name !== "string") {
                invalidMatchIndexes.push(index);
                return;
              }
              const fielderId = registry[fielder.name];
              if (typeof fielderId !== "string" || !/^[0-9a-f]{8}$/i.test(fielderId)) {
                invalidMatchIndexes.push(index);
                return;
              }
            }
          }
        }
      }
    }
  });

  const blockers: string[] = [];
  if (raw.year !== year) {
    blockers.push(`Wrapper year is ${String(raw.year)}; expected ${year}.`);
  }
  if (matches.length !== expectedMatchCount) {
    blockers.push(`Found ${matches.length} matches; expected ${expectedMatchCount}.`);
  }
  if (duplicateMatchKeys.length) {
    blockers.push(`${duplicateMatchKeys.length} duplicate match key(s) were found.`);
  }
  if (invalidMatchIndexes.length) {
    blockers.push(`${new Set(invalidMatchIndexes).size} match record(s) failed schema, year, teams, player registry, or identity checks.`);
  }

  return {
    year,
    expectedMatchCount,
    actualMatchCount: matches.length,
    uniqueMatchCount: seen.size,
    duplicateMatchKeys: [...new Set(duplicateMatchKeys)],
    invalidMatchIndexes: [...new Set(invalidMatchIndexes)],
    status: blockers.length === 0 ? "complete" : "incomplete",
    blockers,
  };
}

function main(): void {
  const editions = WORLD_CRICSHEET_EDITIONS.map((edition) =>
    auditEdition(edition.year, edition.expectedMatchCount),
  );
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    provider: "Cricsheet",
    sourceUrl: "https://cricsheet.org/downloads/",
    license: "ODC-By-1.0",
    policy: "An edition is complete only when the expected match count is met, match keys are unique, and every match has valid player registry IDs.",
    editions,
    completeEditions: editions.filter((entry) => entry.status === "complete").map((entry) => entry.year),
    blockedEditions: editions.filter((entry) => entry.status !== "complete").map((entry) => entry.year),
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const tempPath = `${REPORT_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, REPORT_PATH);

  console.log(`[WORLD SOURCE AUDIT] Report written: ${REPORT_PATH}`);
  for (const entry of editions) {
    const icon = entry.status === "complete" ? "READY" : "BLOCKED";
    console.log(`[WORLD SOURCE AUDIT] ${entry.year}: ${icon} ${entry.actualMatchCount}/${entry.expectedMatchCount} matches`);
    for (const blocker of entry.blockers) console.log(`  - ${blocker}`);
  }

  const incompleteCount = editions.filter((entry) => entry.status !== "complete").length;
  if (process.argv.includes("--strict") && incompleteCount > 0) {
    console.error(`[WORLD SOURCE AUDIT] Strict mode failed: ${incompleteCount} edition(s) are incomplete.`);
    process.exitCode = 2;
    return;
  }
  console.log(`[WORLD SOURCE AUDIT] Done. Complete: ${editions.length - incompleteCount}; blocked: ${incompleteCount}.`);
}

try {
  main();
} catch (error: unknown) {
  console.error(`[WORLD SOURCE AUDIT] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
