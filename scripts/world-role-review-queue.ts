
import fs from "node:fs";
import path from "node:path";

type WorldRole = "BAT" | "WK" | "AR" | "BOWL";
type RoleProvider = "ICC" | "BOARD" | "ESPNCRICINFO" | "CRICKETARCHIVE";

type RoleSource = {
  provider: RoleProvider;
  url: string;
  retrievedAt: string;
};

type VerifiedRoleEntry = {
  role: WorldRole;
  source: RoleSource;
};

type ReviewPlayer = {
  sourcePlayerId: string;
  fullName: string;
  teams?: string[];
  editions?: number[];
};

type RoleReviewFile = {
  players: ReviewPlayer[];
};

type VerifiedRolesFile = {
  version: number;
  description: string;
  players: Record<string, VerifiedRoleEntry>;
};

type QueueRow = {
  sourcePlayerId: string;
  fullName: string;
  teams: string;
  editions: string;
  reviewStatus: string;
  role: string;
  provider: string;
  sourceUrl: string;
  retrievedAt: string;
  reviewNotes: string;
  iccSearchUrl: string;
  boardSearchUrl: string;
};

const ROOT = process.cwd();
const DATA = path.join(ROOT, "scripts", "data", "world");

const REVIEW_PATH = path.join(DATA, "role-review.json");
const VERIFIED_PATH = path.join(DATA, "verified-world-roles.json");
const QUEUE_PATH = path.join(DATA, "role-review-queue.tsv");

const HEADERS: (keyof QueueRow)[] = [
  "sourcePlayerId",
  "fullName",
  "teams",
  "editions",
  "reviewStatus",
  "role",
  "provider",
  "sourceUrl",
  "retrievedAt",
  "reviewNotes",
  "iccSearchUrl",
  "boardSearchUrl",
];

function fail(message: string): never {
  throw new Error(`[WORLD ROLE QUEUE] ${message}`);
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${filePath}`);
  }

  try {
    return JSON.parse(
      fs.readFileSync(filePath, "utf8"),
    ) as T;
  } catch (error) {
    fail(
      `Invalid JSON in ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function readVerified(): VerifiedRolesFile {
  const file = readJson<VerifiedRolesFile>(VERIFIED_PATH);

  if (
    !file.players ||
    typeof file.players !== "object" ||
    Array.isArray(file.players)
  ) {
    fail("verified-world-roles.json must contain a players object.");
  }

  return file;
}

function sanitizeCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
}

function encodeTsv(rows: QueueRow[]): string {
  return [
    HEADERS.join("\t"),
    ...rows.map(row =>
      HEADERS.map(key => sanitizeCell(row[key])).join("\t"),
    ),
  ].join("\n") + "\n";
}

function readQueue(): QueueRow[] {
  if (!fs.existsSync(QUEUE_PATH)) {
    return [];
  }

  const lines = fs.readFileSync(QUEUE_PATH, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split("\t");
  const missing = HEADERS.filter(header => !headers.includes(header));

  if (missing.length > 0) {
    fail(`Review queue is missing columns: ${missing.join(", ")}.`);
  }

  return lines.slice(1).map((line, index) => {
    const values = line.split("\t");
    const row = {} as QueueRow;

    for (const header of HEADERS) {
      row[header] = values[headers.indexOf(header)] ?? "";
    }

    if (!row.sourcePlayerId) {
      fail(`Review queue row ${index + 2} has no sourcePlayerId.`);
    }

    return row;
  });
}

function searchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function createResearchRow(player: ReviewPlayer): QueueRow {
  const id = player.sourcePlayerId;
  const name = player.fullName;
  const team = player.teams?.[0] ?? "";

  return {
    sourcePlayerId: id,
    fullName: name,
    teams: (player.teams ?? []).join("; "),
    editions: (player.editions ?? []).join("; "),
    reviewStatus: "needs-review",
    role: "",
    provider: "",
    sourceUrl: "",
    retrievedAt: "",
    reviewNotes: "",
    iccSearchUrl: searchUrl(
      `site:icc-cricket.com/rankings "${name}" cricket player role`,
    ),
    boardSearchUrl: searchUrl(
      `"${name}" "${team}" official cricket board player profile role`,
    ),
  };
}

function exportQueue(): void {
  const review = readJson<RoleReviewFile>(REVIEW_PATH);
  const verified = readVerified();
  const oldRows = readQueue();

  if (!Array.isArray(review.players)) {
    fail("role-review.json must contain a players array.");
  }

  const oldById = new Map<string, QueueRow>();

  for (const row of oldRows) {
    if (oldById.has(row.sourcePlayerId)) {
      fail(`Duplicate ID in existing queue: ${row.sourcePlayerId}.`);
    }
    oldById.set(row.sourcePlayerId, row);
  }

  const seen = new Set<string>();
  const rows: QueueRow[] = [];

  for (const player of review.players) {
    const id = player.sourcePlayerId;

    if (!id || !player.fullName) {
      fail("Review inventory contains a blank player ID or name.");
    }

    if (seen.has(id)) {
      fail(`Duplicate player ID in role-review.json: ${id}.`);
    }
    seen.add(id);

    const old = oldById.get(id);
    const approved = verified.players[id];
    const fresh = createResearchRow(player);

    // Keep previous manual research when regenerating the queue.
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

    // The approved mapping takes precedence over editable queue values.
    if (approved) {
      row.reviewStatus = "verified";
      row.role = approved.role;
      row.provider = approved.source.provider;
      row.sourceUrl = approved.source.url;
      row.retrievedAt = approved.source.retrievedAt;
    }

    rows.push(row);
  }

  rows.sort((a, b) =>
    a.fullName.localeCompare(b.fullName) ||
    a.sourcePlayerId.localeCompare(b.sourcePlayerId),
  );

  fs.writeFileSync(QUEUE_PATH, encodeTsv(rows), "utf8");

  console.log(`[WORLD ROLE QUEUE] Players in queue: ${rows.length}.`);
  console.log(
    `[WORLD ROLE QUEUE] Already approved: ${
      rows.filter(row => row.reviewStatus === "verified").length
    }.`,
  );
  console.log(
    `[WORLD ROLE QUEUE] Needs review or resolution: ${
      rows.filter(row => row.reviewStatus !== "verified").length
    }.`,
  );
  console.log(`[WORLD ROLE QUEUE] Wrote ${QUEUE_PATH}.`);
}

function isRole(value: string): value is WorldRole {
  return ["BAT", "WK", "AR", "BOWL"].includes(value);
}

function isProvider(value: string): value is RoleProvider {
  return ["ICC", "BOARD", "ESPNCRICINFO", "CRICKETARCHIVE"].includes(value as RoleProvider);
}

function validateApprovedRow(row: QueueRow): VerifiedRoleEntry {
  if (!isRole(row.role)) {
    fail(`${row.sourcePlayerId}: invalid role "${row.role}".`);
  }

  if (!isProvider(row.provider)) {
    fail(`${row.sourcePlayerId}: provider must be ICC, BOARD, ESPNCRICINFO, or CRICKETARCHIVE.`);
  }

  let sourceUrl: URL;

  try {
    sourceUrl = new URL(row.sourceUrl);
  } catch {
    fail(`${row.sourcePlayerId}: sourceUrl is not a valid URL.`);
  }

  if (sourceUrl.protocol !== "https:") {
    fail(`${row.sourcePlayerId}: source URL must use HTTPS.`);
  }

  if (
    !row.retrievedAt ||
    Number.isNaN(Date.parse(row.retrievedAt))
  ) {
    fail(`${row.sourcePlayerId}: retrievedAt must be a valid timestamp.`);
  }

  return {
    role: row.role,
    source: {
      provider: row.provider,
      url: sourceUrl.toString(),
      retrievedAt: row.retrievedAt,
    },
  };
}

function importQueue(): void {
  const review = readJson<RoleReviewFile>(REVIEW_PATH);
  const verified = readVerified();
  const rows = readQueue();

  if (!Array.isArray(review.players)) {
    fail("role-review.json must contain a players array.");
  }

  const knownIds = new Set(
    review.players.map(player => player.sourcePlayerId),
  );
  const seen = new Set<string>();
  const merged: Record<string, VerifiedRoleEntry> = {
    ...verified.players,
  };

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = row.sourcePlayerId;

    if (seen.has(id)) {
      fail(`Duplicate ID in review queue: ${id}.`);
    }
    seen.add(id);

    if (!knownIds.has(id)) {
      fail(`${id} does not exist in the current role-review inventory.`);
    }

    if (row.reviewStatus !== "verified") {
      skipped++;
      continue;
    }

    const entry = validateApprovedRow(row);

    // Only rows explicitly marked verified are imported.
    merged[id] = entry;
    imported++;
  }

  fs.writeFileSync(
    VERIFIED_PATH,
    JSON.stringify(
      {
        version: verified.version ?? 1,
        description:
          "World Cup player roles with source provenance; prefer ICC/board sources, with documented ESPNcricinfo/CricketArchive profile fallback.",
        players: merged,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(`[WORLD ROLE QUEUE] Imported approved rows: ${imported}.`);
  console.log(`[WORLD ROLE QUEUE] Unapproved rows skipped: ${skipped}.`);
  console.log(
    `[WORLD ROLE QUEUE] Total saved verified mappings: ${Object.keys(merged).length}.`,
  );
  console.log(
    "[WORLD ROLE QUEUE] Note: URL and field validation does not independently prove that a source supports the assigned role.",
  );
}

const command = process.argv[2];

if (command === "export") {
  exportQueue();
} else if (command === "import") {
  importQueue();
} else {
  fail("Use: tsx scripts/world-role-review-queue.ts export|import");
}
