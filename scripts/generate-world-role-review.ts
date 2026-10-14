import fs from "node:fs";
import path from "node:path";
import { WORLD_CRICSHEET_EDITIONS } from "./data/world/editions";

type RawMatch = {
  info?: {
    teams?: string[];
    dates?: string[];
    players?: Record<string, string[]>;
    registry?: { people?: Record<string, string> };
  };
  innings?: Array<{
    team: string;
    overs?: Array<{ deliveries?: Array<{ wickets?: Array<{ fielders?: Array<{ name: string }> }> }> }>;
  }>;
};

type RawEdition = {
  matches?: RawMatch[];
};

type ReviewPlayer = {
  sourcePlayerId: string;
  fullName: string;
  names: string[];
  teams: string[];
  editions: number[];
  sourceUrls: string[];
  status: "verified" | "needs-verification";
  role: "BAT" | "WK" | "AR" | "BOWL" | null;
};

type RoleEntry = {
  role: "BAT" | "WK" | "AR" | "BOWL";
  source: {
    provider: "ICC" | "BOARD" | "ESPNCRICINFO";
    url: string;
    retrievedAt: string;
  };
};

const ROOT = process.cwd();
const DATA = path.join(ROOT, "scripts", "data", "world");
const RAW = path.join(DATA, "raw");
const REVIEW_PATH = path.join(DATA, "role-review.json");
const VERIFIED_PATH = path.join(DATA, "verified-world-roles.json");

function fail(message: string): never {
  throw new Error(`[WORLD ROLE REVIEW] ${message}`);
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${filePath}. Run npm.cmd run data:download-world first.`);
  }
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) fail(`File is empty: ${filePath}`);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    fail(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readVerifiedRoles(): Record<string, RoleEntry> {
  if (!fs.existsSync(VERIFIED_PATH)) return {};
  const value = readJson<{ players?: Record<string, RoleEntry> }>(VERIFIED_PATH);
  if (!value.players || typeof value.players !== "object" || Array.isArray(value.players)) {
    fail(`${VERIFIED_PATH} must contain a players object.`);
  }
  return value.players;
}

function main(): void {
  const players = new Map<string, {
    sourcePlayerId: string;
    names: Set<string>;
    teams: Set<string>;
    editions: Set<number>;
    sourceUrls: Set<string>;
  }>();
  const missingRaw: number[] = [];
  const verifiedRoles: Record<string, RoleEntry> = {};
  for (const [rawId, entry] of Object.entries(readVerifiedRoles())) {
    const id = rawId.toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(id) || !entry || !["BAT", "WK", "AR", "BOWL"].includes(entry.role)) continue;
    if (!entry.source || !["ICC", "BOARD", "ESPNCRICINFO"].includes(entry.source.provider)) continue;
    let url: URL;
    try { url = new URL(entry.source.url); } catch { continue; }
    const host = url.hostname.toLowerCase();
    const sourceHostAllowed = url.protocol === "https:" && !url.username && !url.password && (
      (entry.source.provider === "ICC" && (host === "icc-cricket.com" || host.endsWith(".icc-cricket.com"))) ||
      (entry.source.provider === "ESPNCRICINFO" && (host === "espncricinfo.com" || host.endsWith(".espncricinfo.com") || host === "core.espnuk.org")) ||
      entry.source.provider === "BOARD"
    );
    if (!sourceHostAllowed || typeof entry.source.retrievedAt !== "string" || Number.isNaN(Date.parse(entry.source.retrievedAt))) continue;
    verifiedRoles[id] = entry;
  }

  for (const edition of WORLD_CRICSHEET_EDITIONS) {
    const filePath = path.join(RAW, `${edition.year}.json`);
    if (!fs.existsSync(filePath)) {
      missingRaw.push(edition.year);
      continue;
    }

    const raw = readJson<RawEdition>(filePath);
    if (!Array.isArray(raw.matches) || raw.matches.length === 0) {
      fail(`${edition.year}: raw file does not contain a non-empty matches array.`);
    }

    for (const [matchIndex, match] of raw.matches.entries()) {
      const info = match.info;
      if (!info || !Array.isArray(info.teams) || !info.players || !info.registry?.people) {
        fail(`${edition.year}: match ${matchIndex + 1} is missing teams, line-ups, or player registry data.`);
      }

      const addReviewPlayer = (name: string, team: string): string => {
        const id = info.registry!.people![name]?.toLowerCase();
        if (!id || !/^[0-9a-f]{8}$/.test(id)) {
          fail(`${edition.year}: no valid Cricsheet Register ID for "${name}" in match ${matchIndex + 1}.`);
        }
        const player = players.get(id) ?? {
          sourcePlayerId: id,
          names: new Set<string>(),
          teams: new Set<string>(),
          editions: new Set<number>(),
          sourceUrls: new Set<string>(),
        };
        player.names.add(name.trim());
        player.teams.add(team.trim());
        player.editions.add(edition.year);
        player.sourceUrls.add("https://cricsheet.org/downloads/");
        players.set(id, player);
        return id;
      };

      const lineupIds = new Set<string>();
      for (const [team, names] of Object.entries(info.players)) {
        if (!info.teams.includes(team) || !Array.isArray(names)) {
          fail(`${edition.year}: match ${matchIndex + 1} contains an invalid player list for team "${team}".`);
        }
        for (const name of names) lineupIds.add(addReviewPlayer(name, team));
      }

      // Record substitute fielders as players too; they may be credited with catches or stumpings.
      for (const innings of match.innings ?? []) {
        const fieldingTeam = info.teams.find((team) => team !== innings.team);
        if (!fieldingTeam) fail(`${edition.year}: cannot identify fielding team in match ${matchIndex + 1}.`);
        for (const over of innings.overs ?? []) {
          for (const delivery of over.deliveries ?? []) {
            for (const wicket of delivery.wickets ?? []) {
              for (const fielder of wicket.fielders ?? []) {
                const id = info.registry.people[fielder.name]?.toLowerCase();
                if (!id || !/^[0-9a-f]{8}$/.test(id)) fail(`${edition.year}: invalid registry ID for fielder "${fielder.name}".`);
                if (!lineupIds.has(id)) addReviewPlayer(fielder.name, fieldingTeam);
              }
            }
          }
        }
      }
    }
  }

  if (missingRaw.length > 0) {
    fail(`Missing raw edition files: ${missingRaw.join(", ")}. Run npm.cmd run data:download-world and then rerun this command.`);
  }

  const unknownRoleIds = Object.keys(verifiedRoles).filter((id) => !players.has(id));
  if (unknownRoleIds.length > 0) {
    console.warn(`[WORLD ROLE REVIEW] ${unknownRoleIds.length} previously verified Cricsheet IDs are not present in the current raw source pool. They remain stored but are not included in this review file; this can happen while source coverage is incomplete.`);
  }

  const reviewPlayers: ReviewPlayer[] = [...players.values()]
    .sort((a, b) => [...a.names].sort()[0].localeCompare([...b.names].sort()[0]) || a.sourcePlayerId.localeCompare(b.sourcePlayerId))
    .map((player) => {
      const verified = verifiedRoles[player.sourcePlayerId.toLowerCase()];
      return {
        sourcePlayerId: player.sourcePlayerId,
        fullName: [...player.names].sort()[0],
        names: [...player.names].sort((a, b) => a.localeCompare(b)),
        teams: [...player.teams].sort((a, b) => a.localeCompare(b)),
        editions: [...player.editions].sort((a, b) => a - b),
        sourceUrls: [...player.sourceUrls].sort((a, b) => a.localeCompare(b)),
        status: verified ? "verified" : "needs-verification",
        role: verified?.role ?? null,
      };
    });

  const output = {
    version: 2,
    generatedAt: new Date().toISOString(),
    sourcePolicy: {
      primary: ["ICC player/tournament pages", "Official national cricket board profiles/squad releases"],
      fallback: ["ESPNcricinfo player profile with an explicit playing-role field"],
      prohibited: ["CricketArchive", "role inference from statistics", "name-only identity merges"],
    },
    editions: WORLD_CRICSHEET_EDITIONS.map((edition) => edition.year),
    totalPlayers: reviewPlayers.length,
    verifiedPlayers: reviewPlayers.filter((player) => player.status === "verified").length,
    unresolvedPlayers: reviewPlayers.filter((player) => player.status !== "verified").length,
    players: reviewPlayers,
  };

  fs.mkdirSync(DATA, { recursive: true });
  const tempPath = `${REVIEW_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, REVIEW_PATH);

  console.log(`[WORLD ROLE REVIEW] Editions scanned: ${WORLD_CRICSHEET_EDITIONS.map((edition) => edition.year).join(", ")}`);
  console.log(`[WORLD ROLE REVIEW] Unique Cricsheet players: ${reviewPlayers.length}.`);
  console.log(`[WORLD ROLE REVIEW] Explicitly verified roles: ${output.verifiedPlayers}.`);
  console.log(`[WORLD ROLE REVIEW] Still need role verification: ${output.unresolvedPlayers}.`);
  console.log(`[WORLD ROLE REVIEW] Wrote ${REVIEW_PATH}.`);
  console.log("[WORLD ROLE REVIEW] Export the TSV review queue, enrich with explicit ESPNcricinfo role fields, review unresolved entries, and build role-sources.json before processing.");
}

try {
  main();
} catch (error: unknown) {
  console.error(`[WORLD ROLE REVIEW] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
