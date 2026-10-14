import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "scripts", "data", "world");
const QUEUE_PATH = path.join(DATA, "role-review-queue.tsv");
const PEOPLE_PATH = path.join(DATA, "register", "people.csv");
const CACHE_DIR = path.join(DATA, ".cache", "role-enrichment");

const HEADERS = [
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
] as const;

type Role = "BAT" | "WK" | "AR" | "BOWL";
type QueueRow = Record<(typeof HEADERS)[number], string>;
type RegisterPerson = Record<string, string>;

type Profile = {
  playerId?: string;
  roleText: string;
  profileName: string;
  url: string;
  fetchedAt: string;
};

function fail(message: string): never {
  throw new Error(`[WORLD ROLE ENRICHMENT] ${message}`);
}

function cell(value: unknown): string {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];

  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      record.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;

      record.push(field);

      if (record.some((value) => value.length > 0)) {
        records.push(record);
      }

      record = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (quoted) {
    fail("Malformed delimited file: unterminated quoted field.");
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);

    if (record.some((value) => value.length > 0)) {
      records.push(record);
    }
  }

  return records;
}

function readQueue(): QueueRow[] {
  if (!fs.existsSync(QUEUE_PATH)) {
    fail(
      `Missing ${QUEUE_PATH}. Run npm.cmd run data:prepare-world-role-review first.`,
    );
  }

  const records = parseDelimited(
    fs.readFileSync(QUEUE_PATH, "utf8"),
    "\t",
  );

  if (records.length < 2) {
    fail("Review queue has no player rows.");
  }

  const header = records[0];

  const missing = HEADERS.filter((name) => !header.includes(name));

  if (missing.length) {
    fail(
      `Review queue is missing columns: ${missing.join(", ")}. Re-export the queue.`,
    );
  }

  const seen = new Set<string>();

  return records.slice(1).map((values, index) => {
    const row = {} as QueueRow;

    for (const name of HEADERS) {
      row[name] = values[header.indexOf(name)] ?? "";
    }

    if (!/^[0-9a-f]{8}$/i.test(row.sourcePlayerId)) {
      fail(
        `Queue row ${index + 2} has a non-Cricsheet or invalid identity (${row.sourcePlayerId}). Only Cricsheet Register IDs are allowed; CricketArchive inputs are prohibited.`,
      );
    }

    const id = row.sourcePlayerId.toLowerCase();

    if (seen.has(id)) {
      fail(`Duplicate Cricsheet ID ${id} in role queue.`);
    }

    seen.add(id);
    return row;
  });
}

function readRegister(): RegisterPerson[] {
  if (!fs.existsSync(PEOPLE_PATH)) {
    fail(
      `Missing ${PEOPLE_PATH}. Run npm.cmd run data:sync-world-identities first.`,
    );
  }

  const records = parseDelimited(
    fs.readFileSync(PEOPLE_PATH, "utf8"),
    ",",
  );

  if (records.length < 2) {
    fail("Cricsheet people.csv contains no people records.");
  }

  const headers = records[0];

  if (
    !headers.includes("identifier") ||
    !headers.includes("name") ||
    !headers.includes("key_cricinfo")
  ) {
    fail(
      "Cricsheet people.csv is missing identifier, name or key_cricinfo columns. Refresh the Cricsheet Register download.",
    );
  }

  return records.slice(1).map((values) => {
    const person: RegisterPerson = {};

    headers.forEach((header, index) => {
      person[header] = values[index] ?? "";
    });

    return person;
  });
}

function normalizeRole(text: string): Role | null {
  const value = text
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const code = value.toUpperCase().replace(/[^A-Z]/g, "");

  if (
    ["WK", "WKT", "KEEPER", "WICKETKEEPER"].includes(code) ||
    /wicket.?keeper|keeper batter|keeper batsman/.test(value)
  ) {
    return "WK";
  }

  if (
    ["AR", "ALLR", "ALLROUNDER"].includes(code) ||
    /all.?rounder/.test(value)
  ) {
    return "AR";
  }

  if (
    ["BAT", "BATTER", "BATSMAN"].includes(code) ||
    /\bbatter\b|\bbatsman\b|batting/.test(value)
  ) {
    return "BAT";
  }

  if (
    ["BOWL", "BWL", "BOWLER"].includes(code) ||
    /\bbowler\b|bowling/.test(value)
  ) {
    return "BOWL";
  }

  return null;
}

function normalizeName(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function namesCompatible(expected: string, actual: string): boolean {
  const a = normalizeName(expected);
  const b = normalizeName(actual);

  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return false;
  }

  return a.every(
    (token, index) =>
      token === b[index] ||
      (token.length === 1 && b[index].startsWith(token)) ||
      (b[index].length === 1 && token.startsWith(b[index])),
  );
}

/**
 * Extracts a recognized role from either a string or a structured
 * ESPN role/position value.
 *
 * This deliberately recognizes only explicit role labels. It does not
 * infer a player's role from runs, wickets, or other statistics.
 */
function roleFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeRole(value) ? value.trim() : null;
  }

  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const object = value as Record<string, unknown>;

  for (const key of [
    "name",
    "longName",
    "displayName",
    "abbreviation",
    "shortName",
    "value",
  ]) {
    const candidate = object[key];

    if (
      typeof candidate === "string" &&
      normalizeRole(candidate)
    ) {
      return candidate.trim();
    }
  }

  return null;
}

/**
 * ESPN's core athlete endpoint can expose the playing role through
 * `position`, rather than `playingRole` or `playerRole`.
 */
function findExplicitRole(
  value: unknown,
  depth = 0,
): string | null {
  if (
    depth > 10 ||
    value === null ||
    typeof value !== "object"
  ) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findExplicitRole(item, depth + 1);

      if (result) return result;
    }

    return null;
  }

  const object = value as Record<string, unknown>;

  const roleKeys = [
    "playingRole",
    "playing_role",
    "playerRole",
    "player_role",
    "position",
  ];

  for (const key of roleKeys) {
    const result = roleFromValue(object[key]);

    if (result) return result;
  }

  for (const [key, child] of Object.entries(object)) {
    if (roleKeys.includes(key)) continue;

    const result = findExplicitRole(child, depth + 1);

    if (result) return result;
  }

  return null;
}

function findProfileName(
  value: unknown,
  depth = 0,
): string | null {
  if (
    depth > 10 ||
    value === null ||
    typeof value !== "object"
  ) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findProfileName(item, depth + 1);

      if (result) return result;
    }

    return null;
  }

  const object = value as Record<string, unknown>;

  for (const key of [
    "fullName",
    "longName",
    "displayName",
  ]) {
    if (
      typeof object[key] === "string" &&
      (object[key] as string).trim()
    ) {
      return (object[key] as string).trim();
    }
  }

  // Only use a generic `name` field when the object looks like a player
  // record. Avoid accidentally treating a team or unrelated name as a
  // player's identity.
  const isPlayerRecord = [
    "position",
    "playingRole",
    "playing_role",
    "playerRole",
    "player_role",
    "playerId",
    "athleteId",
  ].some((key) => key in object);

  if (
    isPlayerRecord &&
    typeof object.name === "string" &&
    object.name.trim()
  ) {
    return object.name.trim();
  }

  for (const child of Object.values(object)) {
    const result = findProfileName(child, depth + 1);

    if (result) return result;
  }

  return null;
}

async function fetchProfile(
  cricinfoId: string,
  playerId: string,
): Promise<Profile | null> {
  const cachePath = path.join(
    CACHE_DIR,
    `espn-${cricinfoId}.json`,
  );

  if (
    !process.argv.includes("--refresh") &&
    fs.existsSync(cachePath)
  ) {
    try {
      const cached = JSON.parse(
        fs.readFileSync(cachePath, "utf8"),
      ) as Profile & { playerId: string };

      if (
        cached.playerId === playerId &&
        cached.roleText &&
        cached.profileName &&
        cached.url
      ) {
        return cached;
      }
    } catch {
      // Corrupt cache is ignored and replaced after a successful response.
    }
  }

  const endpoints = [
    `https://hs-consumer-api.espncricinfo.com/v1/pages/player/home?playerId=${encodeURIComponent(cricinfoId)}`,
    `https://core.espnuk.org/v2/sports/cricket/athletes/${encodeURIComponent(cricinfoId)}`,
  ];

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            "User-Agent":
              "Build-Your-XI/1.0 (World role provenance review)",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(20000),
        });

        if (
          response.status === 429 ||
          response.status >= 500
        ) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (
          !response.ok ||
          !(response.headers.get("content-type") ?? "")
            .includes("json")
        ) {
          break;
        }

        const payload = await response.json() as unknown;

        const roleText = findExplicitRole(payload);
        const profileName = findProfileName(payload) ?? "";

        if (
          roleText &&
          profileName &&
          normalizeRole(roleText)
        ) {
          const profile: Profile = {
            playerId,
            roleText,
            profileName,
            url: endpoint,
            fetchedAt: new Date().toISOString(),
          };

          fs.mkdirSync(CACHE_DIR, { recursive: true });

          const temp = `${cachePath}.tmp`;

          fs.writeFileSync(
            temp,
            `${JSON.stringify(profile, null, 2)}\n`,
            "utf8",
          );

          fs.renameSync(temp, cachePath);

          return profile;
        }

        break;
      } catch {
        if (attempt === 2) break;

        await new Promise((resolve) =>
          setTimeout(resolve, 800 * (attempt + 1)),
        );
      }
    }
  }

  return null;
}

function writeQueue(rows: QueueRow[]): void {
  const output = [
    HEADERS.join("\t"),
    ...rows.map((row) =>
      HEADERS.map((key) => cell(row[key])).join("\t"),
    ),
  ].join("\n") + "\n";

  const temp = `${QUEUE_PATH}.tmp`;

  fs.writeFileSync(temp, output, "utf8");
  fs.renameSync(temp, QUEUE_PATH);
}

async function main(): Promise<void> {
  const register = readRegister();
  const rows = readQueue();

  const byIdentifier = new Map<string, RegisterPerson>();

  for (const person of register) {
    const identifier = (person.identifier ?? "")
      .trim()
      .toLowerCase();

    if (identifier) {
      byIdentifier.set(identifier, person);
    }
  }

  const work: Array<{
    row: QueueRow;
    person: RegisterPerson;
    cricinfoId: string;
  }> = [];

  let missingIdentity = 0;
  const refresh = process.argv.includes("--refresh");

  for (const row of rows) {
    if (
      row.reviewStatus === "verified" &&
      row.role &&
      row.provider &&
      row.sourceUrl &&
      row.retrievedAt
    ) {
      continue;
    }

    const hasSavedCandidate = Boolean(
      row.role &&
      row.provider &&
      row.sourceUrl &&
      row.retrievedAt,
    );

    const previouslyAttempted =
      /^(CANDIDATE ONLY|ENRICHMENT ATTEMPT)\s*[—-]/i.test(
        row.reviewNotes.trim(),
      );

    // Avoid repeatedly processing the same rows unless --refresh is used.
    if (
      !refresh &&
      (hasSavedCandidate || previouslyAttempted)
    ) {
      continue;
    }

    const person = byIdentifier.get(
      row.sourcePlayerId.toLowerCase(),
    );

    if (!person) {
      row.reviewNotes =
        "No exact Cricsheet Register identifier match in people.csv; do not use name-only matching. Manual identity/source review required.";

      missingIdentity++;
      continue;
    }

    const cricinfoId = [
      person.key_cricinfo,
      person.key_cricinfo_2,
      person.key_cricinfo_3,
    ]
      .map((value) => (value ?? "").trim())
      .find((value) => /^\d+$/.test(value));

    if (!cricinfoId) {
      row.reviewNotes =
        "Register identity matched, but no ESPNcricinfo identifier is available; manual official-source review required.";

      continue;
    }

    work.push({
      row,
      person,
      cricinfoId,
    });
  }

  const limitArg = process.argv.find((arg) =>
    arg.startsWith("--limit="),
  );

  const limit = limitArg
    ? Number(limitArg.slice(8))
    : Number.POSITIVE_INFINITY;

  if (
    limit !== Number.POSITIVE_INFINITY &&
    (!Number.isInteger(limit) || limit <= 0)
  ) {
    fail("--limit must be a positive integer.");
  }

  const selected = work.slice(0, limit);

  console.log(
    `[WORLD ROLE ENRICHMENT] Queue rows: ${rows.length}; profile lookups selected: ${selected.length}/${work.length}.`,
  );

  console.log(
    "[WORLD ROLE ENRICHMENT] Only explicit ESPNcricinfo role fields are used. Fetched roles stay in needs-review status; a human must verify the source and explicitly approve the TSV row before import.",
  );

  let assigned = 0;
  let unresolved = 0;
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor++;

      if (index >= selected.length) return;

      const { row, person, cricinfoId } = selected[index];

      const profile = await fetchProfile(
        cricinfoId,
        row.sourcePlayerId,
      );

      if (!profile) {
        row.reviewNotes =
          "ENRICHMENT ATTEMPT — ESPNcricinfo returned no usable explicit playing-role field and profile name; left unresolved for manual review.";

        unresolved++;
      } else if (
        !namesCompatible(row.fullName, profile.profileName) &&
        !namesCompatible(person.name ?? "", profile.profileName)
      ) {
        row.reviewNotes =
          `ENRICHMENT ATTEMPT — ESPNcricinfo profile name "${profile.profileName}" did not match the expected Cricsheet Register identity; no role was assigned automatically.`;

        unresolved++;
      } else {
        const role = normalizeRole(profile.roleText);

        if (!role) {
          row.reviewNotes =
            `ENRICHMENT ATTEMPT — Unrecognized explicit ESPNcricinfo role text "${profile.roleText}"; left unresolved.`;

          unresolved++;
        } else {
          row.reviewStatus = "needs-review";
          row.role = role;
          row.provider = "ESPNCRICINFO";
          row.sourceUrl = profile.url;
          row.retrievedAt = profile.fetchedAt;

          row.reviewNotes =
            `CANDIDATE ONLY — explicit ESPNcricinfo playing role: "${profile.roleText}". Profile name matched the Cricsheet Register identity. Inspect the cited source and manually set reviewStatus to "verified" only after confirming the exact role.`;

          assigned++;
        }
      }

      if (
        (index + 1) % 25 === 0 ||
        index + 1 === selected.length
      ) {
        console.log(
          `[WORLD ROLE ENRICHMENT] Processed ${index + 1}/${selected.length}; assigned ${assigned} in this run.`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(3, selected.length) },
      () => worker(),
    ),
  );

  writeQueue(rows);

  console.log(
    `[WORLD ROLE ENRICHMENT] Role candidates generated for manual review: ${assigned}.`,
  );

  console.log(
    `[WORLD ROLE ENRICHMENT] Lookups unresolved: ${unresolved}.`,
  );

  console.log(
    `[WORLD ROLE ENRICHMENT] Exact Register identity missing: ${missingIdentity}.`,
  );

  console.log(
    `[WORLD ROLE ENRICHMENT] Updated ${QUEUE_PATH}.`,
  );

  if (selected.length < work.length) {
    console.log(
      `[WORLD ROLE ENRICHMENT] ${work.length - selected.length} candidates remain for later batches; re-run without --limit or with a higher --limit.`,
    );
  }

  console.log(
    "[WORLD ROLE ENRICHMENT] No roles are inferred from statistics. 'verified' means source metadata passed automated checks; you must review queue rows before importing approvals.",
  );
}

main().catch((error) => {
  console.error(
    `[WORLD ROLE ENRICHMENT] Failed: ${error instanceof Error ? error.message : String(error)}`,
  );

  process.exitCode = 2;
});