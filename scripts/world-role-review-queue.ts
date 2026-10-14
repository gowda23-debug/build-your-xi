import fs from "node:fs";
import path from "node:path";

type WorldRole = "BAT" | "WK" | "AR" | "BOWL";
type RoleProvider = "ICC" | "BOARD" | "ESPNCRICINFO";
type RoleEntry = { role: WorldRole; source: { provider: RoleProvider; url: string; retrievedAt: string } };
type ReviewPlayer = { sourcePlayerId: string; fullName: string; teams?: string[]; editions?: number[] };
type RoleReviewFile = { players: ReviewPlayer[] };
type VerifiedRolesFile = { version?: number; description?: string; players?: Record<string, RoleEntry> };
type QueueRow = {
  sourcePlayerId: string; fullName: string; teams: string; editions: string; reviewStatus: string;
  role: string; provider: string; sourceUrl: string; retrievedAt: string; reviewNotes: string;
  iccSearchUrl: string; boardSearchUrl: string;
};

const ROOT = process.cwd();
const DATA = path.join(ROOT, "scripts", "data", "world");
const REVIEW_PATH = path.join(DATA, "role-review.json");
const VERIFIED_PATH = path.join(DATA, "verified-world-roles.json");
const QUEUE_PATH = path.join(DATA, "role-review-queue.tsv");
const HEADERS: (keyof QueueRow)[] = [
  "sourcePlayerId", "fullName", "teams", "editions", "reviewStatus", "role", "provider",
  "sourceUrl", "retrievedAt", "reviewNotes", "iccSearchUrl", "boardSearchUrl",
];

function fail(message: string): never { throw new Error(`[WORLD ROLE QUEUE] ${message}`); }
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) fail(`Missing required file: ${filePath}`);
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) fail(`Required file is empty: ${filePath}`);
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch (error) { fail(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`); }
  if (!isObject(parsed)) fail(`${filePath} must contain a JSON object.`);
  return parsed as T;
}
function readVerified(): VerifiedRolesFile {
  if (!fs.existsSync(VERIFIED_PATH)) {
    return { version: 2, description: "Reviewed World Cup roles; allowed provenance only.", players: {} };
  }
  const value = readJson<VerifiedRolesFile>(VERIFIED_PATH);
  if (!isObject(value.players)) fail("verified-world-roles.json must contain a players object.");
  return value;
}
function sanitizeCell(value: unknown): string { return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim(); }
function encodeTsv(rows: QueueRow[]): string {
  return [HEADERS.join("\t"), ...rows.map((row) => HEADERS.map((header) => sanitizeCell(row[header])).join("\t"))].join("\n") + "\n";
}

function readQueue(
  options: { skipLegacyIds?: boolean } = {},
): QueueRow[] {
  if (!fs.existsSync(QUEUE_PATH)) return [];

  const content = fs.readFileSync(QUEUE_PATH, "utf8").replace(/^\uFEFF/, "");
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);

  if (!lines.length) return [];

  const columns = lines[0].split("\t");
  const missing = HEADERS.filter((header) => !columns.includes(header));

  if (missing.length) {
    fail(
      `Existing role queue is missing columns: ${missing.join(", ")}. ` +
      "Back up manual notes and regenerate the queue.",
    );
  }

  const seen = new Set<string>();
  const rows: QueueRow[] = [];

  for (const [index, line] of lines.slice(1).entries()) {
    const values = line.split("\t");
    const row = {} as QueueRow;

    for (const header of HEADERS) {
      row[header] = values[columns.indexOf(header)] ?? "";
    }

    const rawId = row.sourcePlayerId.trim();

    if (!/^[0-9a-f]{8}$/i.test(rawId)) {
      if (options.skipLegacyIds) {
        console.warn(
          `[WORLD ROLE QUEUE] Skipping obsolete row ${index + 2} ` +
          `with a non-Cricsheet ID: ${rawId}`,
        );
        continue;
      }

      fail(
        `Existing queue row ${index + 2} has invalid/non-Cricsheet ID ` +
        `${rawId}. Re-export the queue from the current role inventory.`,
      );
    }

    const id = rawId.toLowerCase();

    if (seen.has(id)) {
      fail(`Duplicate ID ${id} in existing role queue.`);
    }

    row.sourcePlayerId = id;
    seen.add(id);
    rows.push(row);
  }

  return rows;
}

function validRole(value: unknown): value is WorldRole { return value === "BAT" || value === "WK" || value === "AR" || value === "BOWL"; }
function validProvider(value: unknown): value is RoleProvider { return value === "ICC" || value === "BOARD" || value === "ESPNCRICINFO"; }
function validatedEntry(playerId: string, entry: unknown): RoleEntry | null {
  if (!isObject(entry) || !validRole(entry.role) || !isObject(entry.source)) return null;
  const source = entry.source;
  if (!validProvider(source.provider) || typeof source.url !== "string" || typeof source.retrievedAt !== "string") return null;
  let url: URL;
  try { url = new URL(source.url); } catch { return null; }
  if (url.protocol !== "https:" || Number.isNaN(Date.parse(source.retrievedAt))) return null;
  const hostname = url.hostname.toLowerCase();
  const isEspnHost = hostname === "espncricinfo.com" || hostname.endsWith(".espncricinfo.com") || hostname === "core.espnuk.org";
  const isIccHost = hostname === "icc-cricket.com" || hostname.endsWith(".icc-cricket.com");
  if (source.provider === "ESPNCRICINFO" && !isEspnHost) return null;
  if (source.provider === "ICC" && !isIccHost) return null;
  if (!/^[0-9a-f]{8}$/i.test(playerId)) return null;
  return { role: entry.role, source: { provider: source.provider, url: url.toString(), retrievedAt: source.retrievedAt } };
}
function searchUrl(query: string): string { return `https://www.google.com/search?q=${encodeURIComponent(query)}`; }
function createResearchRow(player: ReviewPlayer): QueueRow {
  const name = player.fullName;
  const team = player.teams?.[0] ?? "";
  return {
    sourcePlayerId: player.sourcePlayerId.toLowerCase(), fullName: name,
    teams: (player.teams ?? []).join("; "), editions: (player.editions ?? []).join("; "),
    reviewStatus: "needs-review", role: "", provider: "", sourceUrl: "", retrievedAt: "", reviewNotes: "",
    iccSearchUrl: searchUrl(`site:icc-cricket.com "${name}" cricket player role`),
    boardSearchUrl: searchUrl(`"${name}" "${team}" official cricket board player role`),
  };
}
function atomicWrite(filePath: string, content: string): void {
  const temp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, content, "utf8");
  try { fs.renameSync(temp, filePath); }
  catch (error) { fs.rmSync(filePath, { force: true }); fs.renameSync(temp, filePath); }
}

function exportQueue(): void {
  const review = readJson<RoleReviewFile>(REVIEW_PATH);
  if (!Array.isArray(review.players)) fail("role-review.json must contain a players array.");
  const verified = readVerified();
  const oldById = new Map(
  readQueue({ skipLegacyIds: true }).map(
    (row) => [row.sourcePlayerId.toLowerCase(), row] as const,
  ),
);
  const seen = new Set<string>();
  const rows: QueueRow[] = [];
  for (const player of review.players) {
    const id = player.sourcePlayerId?.toLowerCase();
    if (!id || !/^[0-9a-f]{8}$/.test(id) || !player.fullName?.trim()) fail(`Invalid player identity/name in review inventory: ${String(id)}.`);
    if (seen.has(id)) fail(`Duplicate player ID ${id} in role-review.json.`);
    seen.add(id);
    const fresh = createResearchRow(player);
    const old = oldById.get(id);
    const row: QueueRow = {
      ...fresh,
      ...(old ?? {}),
      sourcePlayerId: id,
      fullName: player.fullName,
      teams: (player.teams ?? []).join("; "),
      editions: (player.editions ?? []).join("; "),
      iccSearchUrl: fresh.iccSearchUrl,
      boardSearchUrl: fresh.boardSearchUrl,
    };
    const approved = validatedEntry(id, verified.players?.[id]);
    if (approved) {
      row.reviewStatus = "verified"; row.role = approved.role; row.provider = approved.source.provider;
      row.sourceUrl = approved.source.url; row.retrievedAt = approved.source.retrievedAt;
    } else if (verified.players?.[id]) {
      row.reviewStatus = "needs-review"; row.role = ""; row.provider = ""; row.sourceUrl = ""; row.retrievedAt = "";
      row.reviewNotes = "Previous role mapping is invalid or uses a prohibited provider; re-verify from an approved source.";
    }
    rows.push(row);
  }
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName) || a.sourcePlayerId.localeCompare(b.sourcePlayerId));
  fs.mkdirSync(DATA, { recursive: true });
  atomicWrite(QUEUE_PATH, encodeTsv(rows));
  console.log(`[WORLD ROLE QUEUE] Players in current Cricsheet pool: ${rows.length}.`);
  console.log(`[WORLD ROLE QUEUE] Reviewed mappings already approved: ${rows.filter((row) => row.reviewStatus === "verified").length}.`);
  console.log(`[WORLD ROLE QUEUE] Needs manual review: ${rows.filter((row) => row.reviewStatus !== "verified").length}.`);
  console.log(`[WORLD ROLE QUEUE] Wrote ${QUEUE_PATH}. Existing legacy/non-Cricsheet IDs are not carried forward.`);
}
function importQueue(): void {
  const review = readJson<RoleReviewFile>(REVIEW_PATH);
  if (!Array.isArray(review.players)) fail("role-review.json must contain a players array.");
  const verified = readVerified();
  const rows = readQueue();
  const knownIds = new Set(review.players.map((player) => player.sourcePlayerId.toLowerCase()));
  // This file is rebuilt from rows explicitly marked verified. Starting empty is
  // intentional: changing a formerly approved row back to needs-review must revoke
  // its approval rather than silently preserving a stale role mapping.
  const next: Record<string, RoleEntry> = {};
  const seen = new Set<string>();
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const id = row.sourcePlayerId.toLowerCase();
    if (seen.has(id)) fail(`Duplicate ID ${id} in review queue.`);
    seen.add(id);
    if (!knownIds.has(id)) fail(`${id} is not in the current Cricsheet role-review inventory. Re-export the queue.`);
    if (row.reviewStatus !== "verified") { skipped++; continue; }
    const entry = validatedEntry(id, { role: row.role, source: { provider: row.provider, url: row.sourceUrl, retrievedAt: row.retrievedAt } });
    if (!entry) fail(`${id}: verified row has invalid role/provenance. Allowed providers: ICC, BOARD, ESPNCRICINFO; HTTPS source and a valid retrieval timestamp are mandatory.`);
    next[id] = entry;
    imported++;
  }
  atomicWrite(VERIFIED_PATH, `${JSON.stringify({
    version: 2,
    description: "Reviewed World Cup player roles with approved source provenance. No roles are inferred from statistics.",
    players: next,
  }, null, 2)}\n`);
  console.log(`[WORLD ROLE QUEUE] Approved rows saved this run: ${imported}. Unreviewed rows skipped: ${skipped}.`);
  console.log(`[WORLD ROLE QUEUE] Total valid role mappings saved: ${Object.keys(next).length}.`);
  console.log("[WORLD ROLE QUEUE] Role and URL checks cannot prove the source text is accurate; each row marked verified must be manually reviewed.");
}

const command = process.argv[2];
if (command === "export") exportQueue();
else if (command === "import") importQueue();
else fail("Use: tsx scripts/world-role-review-queue.ts export|import");
