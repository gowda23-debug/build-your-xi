import fs from "node:fs";
import path from "node:path";

type WorldRole = "BAT" | "WK" | "AR" | "BOWL";
type RoleProvider = "ICC" | "BOARD" | "ESPNCRICINFO";
type RoleSource = { provider: RoleProvider; url: string; retrievedAt: string };
type VerifiedRoleEntry = { role: WorldRole; source: RoleSource };
type ReviewPlayer = { sourcePlayerId: string; fullName: string; status?: string; role?: WorldRole | null };
type RoleReviewFile = { players: ReviewPlayer[] };
type VerifiedRolesFile = { version?: number; description?: string; players: Record<string, VerifiedRoleEntry> };

const ROOT = process.cwd();
const DATA = path.join(ROOT, "scripts", "data", "world");
const REVIEW_PATH = path.join(DATA, "role-review.json");
const VERIFIED_PATH = path.join(DATA, "verified-world-roles.json");
const OUTPUT_PATH = path.join(DATA, "role-sources.json");

function fail(message: string): never { throw new Error(`[WORLD ROLE BUILD] ${message}`); }
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}. Run the World role-review workflow first.`);
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) fail(`File is empty: ${filePath}`);
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; }
  catch (error) { fail(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`); }
  if (!isObject(value)) fail(`${filePath} must contain a JSON object.`);
  return value as T;
}
function validRole(value: unknown): value is WorldRole {
  return value === "BAT" || value === "WK" || value === "AR" || value === "BOWL";
}
function validProvider(value: unknown): value is RoleProvider {
  return value === "ICC" || value === "BOARD" || value === "ESPNCRICINFO";
}
function validateEntry(playerId: string, entry: unknown): entry is VerifiedRoleEntry {
  if (!isObject(entry) || !validRole(entry.role) || !isObject(entry.source)) {
    console.warn(`[WORLD ROLE BUILD] Ignoring invalid role entry for ${playerId}.`);
    return false;
  }
  const source = entry.source;
  if (!validProvider(source.provider)) {
    console.warn(`[WORLD ROLE BUILD] Ignoring ${playerId}: provider must be ICC, BOARD, or ESPNCRICINFO (CricketArchive is prohibited).`);
    return false;
  }
  if (typeof source.url !== "string") {
    console.warn(`[WORLD ROLE BUILD] Ignoring ${playerId}: role source URL must be a URL string.`);
    return false;
  }
  let sourceUrl: URL;
  try { sourceUrl = new URL(source.url); }
  catch { console.warn(`[WORLD ROLE BUILD] Ignoring ${playerId}: role source URL is invalid.`); return false; }
  const host = sourceUrl.hostname.toLowerCase();
  const isIccHost = host === "icc-cricket.com" || host.endsWith(".icc-cricket.com");
  const isEspnHost = host === "espncricinfo.com" || host.endsWith(".espncricinfo.com") || host === "core.espnuk.org";
  if (sourceUrl.protocol !== "https:" || sourceUrl.username || sourceUrl.password || (source.provider === "ICC" && !isIccHost) || (source.provider === "ESPNCRICINFO" && !isEspnHost)) {
    console.warn(`[WORLD ROLE BUILD] Ignoring ${playerId}: source URL does not match the approved provider (${source.provider}). BOARD sources must be manually reviewed on the issuing board's official domain.`);
    return false;
  }
  if (typeof source.retrievedAt !== "string" || Number.isNaN(Date.parse(source.retrievedAt))) {
    console.warn(`[WORLD ROLE BUILD] Ignoring ${playerId}: retrievedAt must be a valid timestamp.`);
    return false;
  }
  return true;
}

function main(): void {
  const review = readJson<RoleReviewFile>(REVIEW_PATH);
  const verified = readJson<VerifiedRolesFile>(VERIFIED_PATH);
  if (!Array.isArray(review.players)) fail("role-review.json must contain a players array.");
  if (!isObject(verified.players)) fail("verified-world-roles.json must contain a players object.");

  const discoveredIds = new Set<string>();
  for (const player of review.players) {
    if (!player || typeof player.sourcePlayerId !== "string" || !/^[0-9a-f]{8}$/i.test(player.sourcePlayerId)) {
      fail("role-review.json contains a missing or invalid Cricsheet Register ID. Re-run npm.cmd run data:world-role-review.");
    }
    discoveredIds.add(player.sourcePlayerId.toLowerCase());
  }

  const approved: Record<string, VerifiedRoleEntry> = {};
  let ignoredUnknown = 0;
  for (const [rawId, entry] of Object.entries(verified.players)) {
    const playerId = rawId.toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(playerId)) {
      ignoredUnknown++;
      console.warn(`[WORLD ROLE BUILD] Ignoring disallowed/non-Cricsheet identity key: ${rawId}`);
      continue;
    }
    if (!discoveredIds.has(playerId)) {
      ignoredUnknown++;
      console.warn(`[WORLD ROLE BUILD] Ignoring role for ${playerId}: ID is not in the current Cricsheet source pool.`);
      continue;
    }
    if (validateEntry(playerId, entry)) approved[playerId] = entry;
  }

  const unresolved = review.players.filter((player) => !approved[player.sourcePlayerId.toLowerCase()]);
  const output = {
    version: 2,
    generatedAt: new Date().toISOString(),
    description: "Approved per-player roles with explicit source provenance. Only ICC, official board and explicitly documented ESPNcricinfo roles are permitted.",
    sourcePolicy: {
      primary: ["ICC player profile or tournament media guide", "Official national cricket board profile or squad release"],
      fallback: ["ESPNcricinfo player profile with an explicit playing-role field"],
      prohibited: ["CricketArchive as an input source", "Role inference from statistics", "Name-only identity merges"],
    },
    players: approved,
  };
  fs.mkdirSync(DATA, { recursive: true });
  const tempPath = `${OUTPUT_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, OUTPUT_PATH);

  console.log(`[WORLD ROLE BUILD] Approved roles written: ${Object.keys(approved).length}.`);
  console.log(`[WORLD ROLE BUILD] Unresolved/unapproved players: ${unresolved.length}.`);
  if (ignoredUnknown) console.log(`[WORLD ROLE BUILD] Ignored legacy/unknown identity keys: ${ignoredUnknown}.`);
  console.log(`[WORLD ROLE BUILD] Wrote ${OUTPUT_PATH}. The processor will decide readiness per edition.`);
  if (unresolved.length) {
    console.log(`[WORLD ROLE BUILD] First unresolved IDs: ${unresolved.slice(0, 12).map((player) => `${player.fullName} (${player.sourcePlayerId})`).join(", ")}`);
    console.log("[WORLD ROLE BUILD] No roles were inferred. Verify and review the remaining records before expecting the associated editions to process.");
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(`[WORLD ROLE BUILD] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
