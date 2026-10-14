import fs from "node:fs";
import path from "node:path";

import { WORLD_CRICSHEET_EDITIONS } from "./data/world/editions";
import { WORLD_HISTORICAL_SOURCES } from "./data/world/historical-sources";

type Role = "BAT" | "WK" | "AR" | "BOWL";
type Provider = "ICC" | "BOARD" | "ESPNCRICINFO";

type RoleEntry = {
  role: Role;
  source: {
    provider: Provider;
    url: string;
    retrievedAt: string;
  };
};

type RawMatch = {
  info?: {
    teams?: string[];
    dates?: string[];
    players?: Record<string, string[]>;
    registry?: { people?: Record<string, string> };
  };
  innings?: Array<{
    team: string;
    overs?: Array<{
      deliveries?: Array<{
        wickets?: Array<{
          fielders?: Array<{ name: string }>;
        }>;
      }>;
    }>;
  }>;
};

type RawEdition = { matches?: RawMatch[] };

type HistoricalEdition = {
  year?: number;
  teams?: Array<{
    name?: string;
    players?: Array<{
      sourcePlayerId?: string;
      fullName?: string;
    }>;
  }>;
  matches?: Array<{
    sourceMatchId?: string;
    sourceUrl?: string;
    players?: Array<{
      sourcePlayerId?: string;
      fullName?: string;
      team?: string;
    }>;
  }>;
};

type ReviewPlayer = {
  sourcePlayerId: string;
  fullName: string;
  names: string[];
  teams: string[];
  editions: number[];
  sourceUrls: string[];
  status: "verified" | "needs-verification";
  role: Role | null;
};

type ReviewInventory = {
  version?: number;
  players?: ReviewPlayer[];
};

type VerifiedRolesFile = {
  players?: Record<string, RoleEntry>;
};

type PlayerAccumulator = {
  sourcePlayerId: string;
  names: Set<string>;
  teams: Set<string>;
  editions: Set<number>;
  sourceUrls: Set<string>;
};

const ROOT = process.cwd();
const DATA = path.join(ROOT, "scripts", "data", "world");
const RAW = path.join(DATA, "raw");
const HISTORICAL_NORMALIZED = path.join(DATA, "historical-normalized");
const REVIEW_PATH = path.join(DATA, "role-review.json");
const VERIFIED_PATH = path.join(DATA, "verified-world-roles.json");

const CRICSHEET_URL = "https://cricsheet.org/downloads/";

function fail(message: string): never {
  throw new Error(`[WORLD ROLE REVIEW] ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${filePath}. Run the prerequisite source preparation step first.`);
  }

  const text = fs.readFileSync(filePath, "utf8");

  if (!text.trim()) {
    fail(`File is empty: ${filePath}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    fail(
      `Invalid JSON in ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function validRole(value: unknown): value is Role {
  return value === "BAT" || value === "WK" || value === "AR" || value === "BOWL";
}

function validProvider(value: unknown): value is Provider {
  return value === "ICC" || value === "BOARD" || value === "ESPNCRICINFO";
}

function isAllowedSource(entry: unknown): entry is RoleEntry {
  if (!isObject(entry) || !validRole(entry.role) || !isObject(entry.source)) {
    return false;
  }

  const source = entry.source;

  if (
    !validProvider(source.provider) ||
    typeof source.url !== "string" ||
    typeof source.retrievedAt !== "string" ||
    Number.isNaN(Date.parse(source.retrievedAt))
  ) {
    return false;
  }

  let url: URL;

  try {
    url = new URL(source.url);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    return false;
  }

  const host = url.hostname.toLowerCase();

  if (source.provider === "ICC") {
    return host === "icc-cricket.com" || host.endsWith(".icc-cricket.com");
  }

  if (source.provider === "ESPNCRICINFO") {
    return (
      host === "espncricinfo.com" ||
      host.endsWith(".espncricinfo.com") ||
      host === "core.espnuk.org"
    );
  }

  // BOARD sources still require human review of the actual official domain.
  return true;
}

function readVerifiedRoles(): Record<string, RoleEntry> {
  if (!fs.existsSync(VERIFIED_PATH)) {
    return {};
  }

  const file = readJson<VerifiedRolesFile>(VERIFIED_PATH);

  if (!isObject(file.players)) {
    fail(`${VERIFIED_PATH} must contain a players object.`);
  }

  const valid: Record<string, RoleEntry> = {};

  for (const [rawId, entry] of Object.entries(file.players)) {
    const id = rawId.toLowerCase();

    if (!/^[0-9a-f]{8}$/.test(id)) {
      console.warn(`[WORLD ROLE REVIEW] Ignoring invalid role identity: ${rawId}`);
      continue;
    }

    if (!isAllowedSource(entry)) {
      console.warn(
        `[WORLD ROLE REVIEW] Ignoring invalid or prohibited role evidence for ${id}.`,
      );
      continue;
    }

    valid[id] = entry;
  }

  return valid;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function addPlayer(
  players: Map<string, PlayerAccumulator>,
  sourcePlayerId: string,
  fullName: string,
  team: string,
  edition: number,
  sourceUrl: string,
): void {
  const id = sourcePlayerId.trim().toLowerCase();

  if (!/^[0-9a-f]{8}$/.test(id)) {
    fail(
      `${edition}: invalid Cricsheet Register ID "${sourcePlayerId}" for "${fullName}".`,
    );
  }

  if (!fullName.trim()) {
    fail(`${edition}: blank player name for Register ID ${id}.`);
  }

  const player = players.get(id) ?? {
    sourcePlayerId: id,
    names: new Set<string>(),
    teams: new Set<string>(),
    editions: new Set<number>(),
    sourceUrls: new Set<string>(),
  };

  player.names.add(fullName.trim());

  if (team.trim()) {
    player.teams.add(team.trim());
  }

  player.editions.add(edition);

  if (sourceUrl.trim()) {
    player.sourceUrls.add(sourceUrl.trim());
  }

  players.set(id, player);
}

function collectModernPlayers(
  players: Map<string, PlayerAccumulator>,
): void {
  const missingRaw: number[] = [];

  for (const edition of WORLD_CRICSHEET_EDITIONS) {
    const filePath = path.join(RAW, `${edition.year}.json`);

    if (!fs.existsSync(filePath)) {
      missingRaw.push(edition.year);
      continue;
    }

    const raw = readJson<RawEdition>(filePath);

    if (!Array.isArray(raw.matches) || raw.matches.length === 0) {
      fail(`${edition.year}: raw file has no matches array or is empty.`);
    }

    for (const [matchIndex, match] of raw.matches.entries()) {
      const info = match.info;

      if (!info?.teams || !info.players || !info.registry?.people) {
        fail(
          `${edition.year}, match ${matchIndex + 1}: missing teams, line-ups or registry IDs.`,
        );
      }

      const lineupIds = new Set<string>();

      for (const [team, names] of Object.entries(info.players)) {
        if (!info.teams.includes(team) || !Array.isArray(names)) {
          fail(
            `${edition.year}, match ${matchIndex + 1}: invalid lineup for ${team}.`,
          );
        }

        for (const name of names) {
          const id = info.registry.people[name];

          if (!id) {
            fail(
              `${edition.year}, match ${matchIndex + 1}: no Register ID for "${name}".`,
            );
          }

          addPlayer(
            players,
            id,
            name,
            team,
            edition.year,
            CRICSHEET_URL,
          );

          lineupIds.add(id.toLowerCase());
        }
      }

      // Include substitute fielders credited in delivery data.
      for (const innings of match.innings ?? []) {
        const fieldingTeam = info.teams.find((team) => team !== innings.team);

        if (!fieldingTeam) {
          fail(
            `${edition.year}, match ${matchIndex + 1}: cannot determine fielding team.`,
          );
        }

        for (const over of innings.overs ?? []) {
          for (const delivery of over.deliveries ?? []) {
            for (const wicket of delivery.wickets ?? []) {
              for (const fielder of wicket.fielders ?? []) {
                const id = info.registry.people[fielder.name];

                if (!id) {
                  fail(
                    `${edition.year}, match ${matchIndex + 1}: no Register ID for fielder "${fielder.name}".`,
                  );
                }

                if (!lineupIds.has(id.toLowerCase())) {
                  addPlayer(
                    players,
                    id,
                    fielder.name,
                    fieldingTeam,
                    edition.year,
                    CRICSHEET_URL,
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  if (missingRaw.length) {
    fail(
      `Missing modern raw files for ${missingRaw.join(", ")}. Run data:download-world first.`,
    );
  }
}

function collectHistoricalPlayers(
  players: Map<string, PlayerAccumulator>,
): void {
  const missing: number[] = [];

  for (const source of WORLD_HISTORICAL_SOURCES) {
    const filePath = path.join(
      HISTORICAL_NORMALIZED,
      `${source.year}.json`,
    );

    if (!fs.existsSync(filePath)) {
      missing.push(source.year);
      continue;
    }

    const edition = readJson<HistoricalEdition>(filePath);

    if (edition.year !== source.year || !Array.isArray(edition.matches)) {
      fail(
        `${source.year}: historical-normalized file has an invalid year or matches array.`,
      );
    }

    for (const match of edition.matches) {
      if (!Array.isArray(match.players) || !match.sourceUrl) {
        fail(
          `${source.year}/${match.sourceMatchId ?? "unknown"}: missing player inventory or scorecard source URL.`,
        );
      }

      for (const player of match.players) {
        if (!player.sourcePlayerId || !player.fullName || !player.team) {
          fail(
            `${source.year}/${match.sourceMatchId ?? "unknown"}: incomplete player identity.`,
          );
        }

        addPlayer(
          players,
          player.sourcePlayerId,
          player.fullName,
          player.team,
          source.year,
          match.sourceUrl,
        );
      }
    }
  }

  if (missing.length) {
    fail(
      `Missing historical normalized files for ${missing.join(", ")}. Run data:download-world-historical and data:prepare-world-historical first.`,
    );
  }
}

function main(): void {
  const players = new Map<string, PlayerAccumulator>();
  const verifiedRoles = readVerifiedRoles();

  collectModernPlayers(players);
  collectHistoricalPlayers(players);

  const unknownApprovedIds = Object.keys(verifiedRoles).filter(
    (id) => !players.has(id.toLowerCase()),
  );

  if (unknownApprovedIds.length) {
    console.warn(
      `[WORLD ROLE REVIEW] ${unknownApprovedIds.length} approved IDs are not in the current combined inventory; they remain stored but are not included in this review file.`,
    );
  }

  const reviewPlayers: ReviewPlayer[] = [...players.values()]
    .sort((a, b) => {
      const aName = [...a.names].sort()[0] ?? "";
      const bName = [...b.names].sort()[0];

      return (
        normalizeName(aName).localeCompare(normalizeName(bName)) ||
        a.sourcePlayerId.localeCompare(b.sourcePlayerId)
      );
    })
    .map((player) => {
      const approved = verifiedRoles[player.sourcePlayerId];

      return {
        sourcePlayerId: player.sourcePlayerId,
        fullName: [...player.names].sort()[0],
        names: [...player.names].sort((a, b) => a.localeCompare(b)),
        teams: [...player.teams].sort((a, b) => a.localeCompare(b)),
        editions: [...player.editions].sort((a, b) => a - b),
        sourceUrls: [...player.sourceUrls].sort((a, b) => a.localeCompare(b)),
        status: approved ? "verified" : "needs-verification",
        role: approved?.role ?? null,
      };
    });

  const output: ReviewInventory = {
    version: 3,
    players: reviewPlayers,
  };

  const report = {
    version: 3,
    generatedAt: new Date().toISOString(),
    sourcePolicy: {
      primary: [
        "ICC player and tournament pages",
        "Official national cricket board profiles and squad releases",
      ],
      fallback: [
        "ESPNcricinfo player profile with an explicit playing-role field",
      ],
      prohibited: [
        "CricketArchive",
        "role inference from statistics",
        "name-only identity merges",
      ],
    },
    editions: [
      ...WORLD_HISTORICAL_SOURCES.map((source) => source.year),
      ...WORLD_CRICSHEET_EDITIONS.map((source) => source.year),
    ].sort((a, b) => a - b),
    totalPlayers: reviewPlayers.length,
    verifiedPlayers: reviewPlayers.filter(
      (player) => player.status === "verified",
    ).length,
    unresolvedPlayers: reviewPlayers.filter(
      (player) => player.status !== "verified",
    ).length,
    players: reviewPlayers,
  };

  fs.mkdirSync(DATA, { recursive: true });

  const tempPath = `${REVIEW_PATH}.tmp`;

  fs.writeFileSync(
    tempPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  fs.renameSync(tempPath, REVIEW_PATH);

  console.log(
    `[WORLD ROLE REVIEW] Modern editions scanned: ${WORLD_CRICSHEET_EDITIONS.map((item) => item.year).join(", ")}.`,
  );
  console.log(
    `[WORLD ROLE REVIEW] Historical editions scanned: ${WORLD_HISTORICAL_SOURCES.map((item) => item.year).join(", ")}.`,
  );
  console.log(`[WORLD ROLE REVIEW] Combined unique players: ${reviewPlayers.length}.`);
  console.log(`[WORLD ROLE REVIEW] Approved roles retained: ${report.verifiedPlayers}.`);
  console.log(`[WORLD ROLE REVIEW] Roles requiring review: ${report.unresolvedPlayers}.`);
  console.log(`[WORLD ROLE REVIEW] Wrote ${REVIEW_PATH}.`);
}

try {
  main();
} catch (error: unknown) {
  console.error(
    `[WORLD ROLE REVIEW] Failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
}