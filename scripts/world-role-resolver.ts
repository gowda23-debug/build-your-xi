import fs from "node:fs";
import path from "node:path";

type WorldRole = "BAT" | "WK" | "AR" | "BOWL";
export type RoleProvider = "ICC" | "BOARD" | "ESPNCRICINFO";
export type RoleEntry = {
  role: WorldRole;
  source: { provider: RoleProvider; url: string; retrievedAt: string };
};
export type WorldPlayerIdentity = { sourcePlayerId: string; fullName: string };

type RoleSourceFile = { players?: Record<string, RoleEntry> };
const ROLE_SOURCE_FILE = path.join(process.cwd(), "scripts", "data", "world", "role-sources.json");

function fail(message: string): never { throw new Error(`[WORLD ROLE RESOLVER] ${message}`); }
function isRole(value: unknown): value is WorldRole {
  return value === "BAT" || value === "WK" || value === "AR" || value === "BOWL";
}
function isProvider(value: unknown): value is RoleProvider {
  return value === "ICC" || value === "BOARD" || value === "ESPNCRICINFO";
}
export function loadVerifiedWorldRoles(): Map<string, RoleEntry> {
  if (!fs.existsSync(ROLE_SOURCE_FILE)) fail(`Missing ${ROLE_SOURCE_FILE}. Run data:build-world-roles first.`);
  const text = fs.readFileSync(ROLE_SOURCE_FILE, "utf8");
  if (!text.trim()) fail(`${ROLE_SOURCE_FILE} is empty.`);
  let raw: unknown;
  try { raw = JSON.parse(text) as unknown; }
  catch (error) { fail(`Invalid JSON in role sources: ${error instanceof Error ? error.message : String(error)}`); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("role-sources.json must contain an object.");
  const file = raw as RoleSourceFile;
  if (!file.players || typeof file.players !== "object" || Array.isArray(file.players)) fail("role-sources.json must contain a players object.");
  const result = new Map<string, RoleEntry>();
  for (const [rawId, entry] of Object.entries(file.players)) {
    const id = rawId.toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(id)) fail(`Invalid Cricsheet Register ID ${rawId}.`);
    if (!entry || !isRole(entry.role) || !entry.source || !isProvider(entry.source.provider)) fail(`Invalid or prohibited role mapping for ${id}.`);
    if (!entry.source.url?.startsWith("https://") || Number.isNaN(Date.parse(entry.source.retrievedAt))) fail(`Invalid source provenance for ${id}.`);
    result.set(id, entry);
  }
  return result;
}
export function resolveWorldRoles(players: WorldPlayerIdentity[]) {
  const verified = loadVerifiedWorldRoles();
  const resolved: Array<{ player: WorldPlayerIdentity; role: RoleEntry }> = [];
  const unresolved: WorldPlayerIdentity[] = [];
  const seen = new Set<string>();
  for (const player of players) {
    const id = player.sourcePlayerId.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const role = verified.get(id);
    if (role) resolved.push({ player, role });
    else unresolved.push(player);
  }
  return { resolved, unresolved, total: seen.size };
}
