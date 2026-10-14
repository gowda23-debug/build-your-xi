import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

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
  playerId: string;
  roleText: string;
  profileName: string;
  url: string;
  fetchedAt: string;
};

type FetchResult = {
  profile: Profile | null;
  diagnostics: string[];
};

function fail(message: string): never {
  throw new Error(`[WORLD ROLE ENRICHMENT] ${message}`);
}

function cell(value: unknown): string {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function parseDelimited(input: string, delimiter: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

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
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (quoted) fail("Malformed delimited file: unterminated quoted field.");

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    if (record.some((value) => value.length > 0)) records.push(record);
  }

  return records;
}

function readQueue(): QueueRow[] {
  if (!fs.existsSync(QUEUE_PATH)) {
    fail(`Missing ${QUEUE_PATH}. Run data:prepare-world-role-review first.`);
  }

  const records = parseDelimited(fs.readFileSync(QUEUE_PATH, "utf8"), "\t");

  if (records.length < 2) fail("Review queue contains no player rows.");

  const header = records[0];
  const missing = HEADERS.filter((name) => !header.includes(name));

  if (missing.length) {
    fail(`Queue is missing columns: ${missing.join(", ")}. Re-export the queue.`);
  }

  const seen = new Set<string>();

  return records.slice(1).map((values, index) => {
    const row = {} as QueueRow;

    for (const name of HEADERS) {
      row[name] = values[header.indexOf(name)] ?? "";
    }

    if (!/^[0-9a-f]{8}$/i.test(row.sourcePlayerId)) {
      fail(
        `Queue row ${index + 2} has invalid identity "${row.sourcePlayerId}". ` +
        "Only Cricsheet Register IDs are allowed.",
      );
    }

    const id = row.sourcePlayerId.toLowerCase();

    if (seen.has(id)) fail(`Duplicate Cricsheet ID ${id} in the queue.`);

    seen.add(id);
    row.sourcePlayerId = id;
    return row;
  });
}

function readRegister(): RegisterPerson[] {
  if (!fs.existsSync(PEOPLE_PATH)) {
    fail(`Missing ${PEOPLE_PATH}. Run data:sync-world-identities first.`);
  }

  const records = parseDelimited(
    fs.readFileSync(PEOPLE_PATH, "utf8"),
    ",",
  );

  if (records.length < 2) fail("Cricsheet people.csv contains no player records.");

  const headers = records[0];

  if (!headers.includes("identifier") || !headers.includes("name")) {
    fail("Cricsheet people.csv is missing identifier or name columns.");
  }

  return records.slice(1).map((values) => {
    const person: RegisterPerson = {};
    headers.forEach((header, index) => {
      person[header] = values[index] ?? "";
    });
    return person;
  });
}

function normalizeRole(value: string): Role | null {
  const text = value
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (
    /\bwicket.?keeper\b|\bkeeper batter\b|\bkeeper batsman\b/.test(text) ||
    /^(wk|wkt|keeper|wicketkeeper)$/.test(text.replace(/[^a-z]/g, ""))
  ) {
    return "WK";
  }

  if (
    /\ball.?rounder\b/.test(text) ||
    /^(ar|allr|allrounder)$/.test(text.replace(/[^a-z]/g, ""))
  ) {
    return "AR";
  }

  if (
    /\bbatter\b|\bbatsman\b|\bbatting\b/.test(text) ||
    /^(bat|batter|batsman)$/.test(text.replace(/[^a-z]/g, ""))
  ) {
    return "BAT";
  }

  if (
    /\bbowler\b|\bbowling\b/.test(text) ||
    /^(bowl|bwl|bowler)$/.test(text.replace(/[^a-z]/g, ""))
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

  if (!a.length || !b.length || a.length !== b.length) return false;

  return a.every(
    (token, index) =>
      token === b[index] ||
      (token.length === 1 && b[index].startsWith(token)) ||
      (b[index].length === 1 && token.startsWith(b[index])),
  );
}

function roleFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeRole(value) ? value.trim() : null;
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const object = value as Record<string, unknown>;

  for (const key of [
    "name",
    "longName",
    "displayName",
    "abbreviation",
    "shortName",
    "description",
    "value",
  ]) {
    const candidate = object[key];

    if (typeof candidate === "string" && normalizeRole(candidate)) {
      return candidate.trim();
    }
  }

  return null;
}

function findExplicitRole(value: unknown, depth = 0): string | null {
  if (depth > 12 || value === null || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const role = findExplicitRole(item, depth + 1);
      if (role) return role;
    }
    return null;
  }

  const object = value as Record<string, unknown>;
  const keys = [
    "playingRole",
    "playing_role",
    "playerRole",
    "player_role",
    "position",
  ];

  for (const key of keys) {
    const role = roleFromValue(object[key]);
    if (role) return role;
  }

  for (const [key, child] of Object.entries(object)) {
    if (keys.includes(key)) continue;
    const role = findExplicitRole(child, depth + 1);
    if (role) return role;
  }

  return null;
}

function findRoleReferences(value: unknown, depth = 0): string[] {
  if (depth > 12 || value === null || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => findRoleReferences(item, depth + 1));
  }

  const object = value as Record<string, unknown>;
  const refs: string[] = [];

  for (const key of ["position", "playingRole", "playing_role", "playerRole"]) {
    const candidate = object[key];

    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const ref = (candidate as Record<string, unknown>)["$ref"];

      if (typeof ref === "string") refs.push(ref);
    }
  }

  for (const child of Object.values(object)) {
    refs.push(...findRoleReferences(child, depth + 1));
  }

  return [...new Set(refs)];
}

function findProfileName(value: unknown, depth = 0): string | null {
  if (depth > 12 || value === null || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const name = findProfileName(item, depth + 1);
      if (name) return name;
    }
    return null;
  }

  const object = value as Record<string, unknown>;

  for (const key of ["fullName", "longName", "displayName"]) {
    if (typeof object[key] === "string" && object[key].trim()) {
      return object[key].trim();
    }
  }

  const isPlayerRecord = [
    "position",
    "playingRole",
    "playing_role",
    "playerRole",
    "player_role",
    "playerId",
    "athleteId",
  ].some((key) => key in object);

  if (isPlayerRecord && typeof object.name === "string" && object.name.trim()) {
    return object.name.trim();
  }

  for (const child of Object.values(object)) {
    const name = findProfileName(child, depth + 1);
    if (name) return name;
  }

  return null;
}

function isAllowedReference(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      [
        "core.espnuk.org",
        "sports.core.api.espn.com",
      ].includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

async function getJson(
  url: string,
): Promise<{ payload: unknown; diagnostic: string }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 Build-Your-XI role evidence review",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    return {
      payload: null,
      diagnostic: `HTTP ${response.status} (${contentType || "no content-type"})`,
    };
  }

  if (!contentType.toLowerCase().includes("json")) {
    return {
      payload: null,
      diagnostic: `HTTP ${response.status}, unexpected content-type "${contentType || "missing"}"`,
    };
  }

  return {
    payload: await response.json() as unknown,
    diagnostic: `HTTP ${response.status}, JSON`,
  };
}

function roleFromProfileHtml(html: string): string | null {
  const $ = cheerio.load(html);

  // First inspect embedded JSON; profile data is more reliable than free text.
  let result: string | null = null;

  $("script").each((_, element) => {
    if (result) return;

    const content = $(element).html()?.trim();
    if (!content || !content.startsWith("{")) return;

    try {
      result = findExplicitRole(JSON.parse(content) as unknown);
    } catch {
      // Not every script tag contains JSON.
    }
  });

  if (result) return result;

  // Only accept a role adjacent to an explicit "Playing Role" label.
  const text = $("body").text().replace(/\s+/g, " ");

  const match = text.match(
    /\bplaying\s+role\b\s*:?\s*(wicket[\s-]?keeper(?:[\s-]+batter)?|keeper[\s-]+batsman|batting\s+all[\s-]?rounder|bowling\s+all[\s-]?rounder|all[\s-]?rounder|batter|batsman|bowler)\b/i,
  );

  return match?.[1] ?? null;
}

function nameFromProfileHtml(html: string): string {
  const $ = cheerio.load(html);

  const meta = $('meta[property="og:title"]').attr("content");
  const heading = $("h1").first().text();
  const title = $("title").text();

  const raw = (meta || heading || title || "").trim();

  return raw
    .replace(/\s*[-|]\s*ESPNcricinfo.*$/i, "")
    .replace(/\s+profile\s*$/i, "")
    .trim();
}

async function fetchProfile(
  cricinfoId: string,
  playerId: string,
): Promise<FetchResult> {
  const diagnostics: string[] = [];
  const cachePath = path.join(CACHE_DIR, `espn-${cricinfoId}.json`);
  const profileUrl = `https://www.espncricinfo.com/cricketers/player-name-${encodeURIComponent(cricinfoId)}`;

  if (!process.argv.includes("--refresh") && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(
        fs.readFileSync(cachePath, "utf8"),
      ) as Profile;

      if (
        cached.playerId === playerId &&
        cached.roleText &&
        cached.profileName &&
        cached.url &&
        normalizeRole(cached.roleText)
      ) {
        return { profile: cached, diagnostics: ["valid cached candidate"] };
      }
    } catch {
      diagnostics.push("cached profile was invalid; refetching");
    }
  }

  const endpoints = [
    `https://core.espnuk.org/v2/sports/cricket/athletes/${encodeURIComponent(cricinfoId)}`,
    `https://hs-consumer-api.espncricinfo.com/v1/pages/player/home?playerId=${encodeURIComponent(cricinfoId)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const result = await getJson(endpoint);
      diagnostics.push(`${new URL(endpoint).hostname}: ${result.diagnostic}`);

      if (!result.payload) continue;

      let roleText = findExplicitRole(result.payload);
      const profileName = findProfileName(result.payload) ?? "";

      // Some ESPN resources expose position as a $ref. Resolve only known ESPN
      // hosts, and only accept an explicit role in the referenced resource.
      if (!roleText) {
        for (const ref of findRoleReferences(result.payload).slice(0, 3)) {
          if (!isAllowedReference(ref)) {
            diagnostics.push("ignored an unapproved role-reference host");
            continue;
          }

          try {
            const referenced = await getJson(ref);
            diagnostics.push(`position reference: ${referenced.diagnostic}`);

            if (referenced.payload) {
              roleText = findExplicitRole(referenced.payload);
            }

            if (roleText) break;
          } catch (error) {
            diagnostics.push(
              `position reference error: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      if (roleText && profileName && normalizeRole(roleText)) {
        const profile: Profile = {
          playerId,
          roleText,
          profileName,
          url: profileUrl,
          fetchedAt: new Date().toISOString(),
        };

        fs.mkdirSync(CACHE_DIR, { recursive: true });

        const tempPath = `${cachePath}.tmp`;
        fs.writeFileSync(tempPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
        fs.renameSync(tempPath, cachePath);

        return { profile, diagnostics };
      }

      diagnostics.push(
        `JSON response had no usable explicit role/name pair (name=${profileName ? "yes" : "no"}, role=${roleText ?? "none"})`,
      );
    } catch (error) {
      diagnostics.push(
        `${new URL(endpoint).hostname}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Fallback to the public profile page. The role must still be explicit.
  try {
    const response = await fetch(profileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 Build-Your-XI role evidence review",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });

    const contentType = response.headers.get("content-type") ?? "";
    diagnostics.push(
      `profile page: HTTP ${response.status} (${contentType || "no content-type"})`,
    );

    if (response.ok && contentType.toLowerCase().includes("html")) {
      const html = await response.text();
      const roleText = roleFromProfileHtml(html);
      const profileName = nameFromProfileHtml(html);
      const finalUrl = response.url || profileUrl;

      if (roleText && profileName && normalizeRole(roleText)) {
        const profile: Profile = {
          playerId,
          roleText,
          profileName,
          url: finalUrl,
          fetchedAt: new Date().toISOString(),
        };

        fs.mkdirSync(CACHE_DIR, { recursive: true });

        const tempPath = `${cachePath}.tmp`;
        fs.writeFileSync(tempPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
        fs.renameSync(tempPath, cachePath);

        return { profile, diagnostics };
      }

      diagnostics.push(
        `HTML profile had no usable explicit role/name pair (name=${profileName || "none"}, role=${roleText ?? "none"})`,
      );
    }
  } catch (error) {
    diagnostics.push(
      `profile page error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { profile: null, diagnostics };
}

function writeQueue(rows: QueueRow[]): void {
  const output = [
    HEADERS.join("\t"),
    ...rows.map((row) =>
      HEADERS.map((key) => cell(row[key])).join("\t"),
    ),
  ].join("\n") + "\n";

  const tempPath = `${QUEUE_PATH}.tmp`;
  fs.writeFileSync(tempPath, output, "utf8");
  fs.renameSync(tempPath, QUEUE_PATH);
}

async function main(): Promise<void> {
  const register = readRegister();
  const rows = readQueue();
  const byIdentifier = new Map<string, RegisterPerson>();

  for (const person of register) {
    const id = (person.identifier ?? "").trim().toLowerCase();
    if (id) byIdentifier.set(id, person);
  }

  const refresh = process.argv.includes("--refresh");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;

  if (limit !== Infinity && (!Number.isInteger(limit) || limit <= 0)) {
    fail("--limit must be a positive integer.");
  }

  const work: Array<{
    row: QueueRow;
    person: RegisterPerson;
    cricinfoId: string;
  }> = [];

  let missingIdentity = 0;
  let missingCricinfoId = 0;

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

    const savedCandidate = Boolean(
      row.role && row.provider && row.sourceUrl && row.retrievedAt,
    );

    const attempted = /^(CANDIDATE ONLY|ENRICHMENT ATTEMPT)\s*[—-]/i.test(
      row.reviewNotes.trim(),
    );

    if (!refresh && (savedCandidate || attempted)) continue;

    const person = byIdentifier.get(row.sourcePlayerId.toLowerCase());

    if (!person) {
      row.reviewNotes =
        "No exact Cricsheet Register identifier match in people.csv; no name-only matching attempted.";
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
        "Exact Register identity exists, but no ESPNcricinfo ID is available. Manual ICC/official-board source review required.";
      missingCricinfoId++;
      continue;
    }

    work.push({ row, person, cricinfoId });
  }

  const selected = work.slice(0, limit);

  console.log(
    `[WORLD ROLE ENRICHMENT] Queue rows: ${rows.length}; selected for lookup: ${selected.length}/${work.length}.`,
  );
  console.log(
    "[WORLD ROLE ENRICHMENT] Every result remains needs-review. No role is approved by this script.",
  );

  let candidates = 0;
  let unresolved = 0;
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= selected.length) return;

      const { row, person, cricinfoId } = selected[index];
      const result = await fetchProfile(cricinfoId, row.sourcePlayerId);
      const profile = result.profile;

      if (!profile) {
        row.reviewStatus = "needs-review";
        row.role = "";
        row.provider = "";
        row.sourceUrl = "";
        row.retrievedAt = "";
        row.reviewNotes =
          `ENRICHMENT ATTEMPT — no usable explicit role. ${result.diagnostics.join(" | ")}`;
        unresolved++;
      } else if (
        !namesCompatible(row.fullName, profile.profileName) &&
        !namesCompatible(person.name ?? "", profile.profileName)
      ) {
        row.reviewStatus = "needs-review";
        row.role = "";
        row.provider = "";
        row.sourceUrl = "";
        row.retrievedAt = "";
        row.reviewNotes =
          `ENRICHMENT ATTEMPT — profile name "${profile.profileName}" did not match the Register identity. No role assigned. ${result.diagnostics.join(" | ")}`;
        unresolved++;
      } else {
        const role = normalizeRole(profile.roleText);

        if (!role) {
          row.reviewStatus = "needs-review";
          row.role = "";
          row.provider = "";
          row.sourceUrl = "";
          row.retrievedAt = "";
          row.reviewNotes =
            `ENRICHMENT ATTEMPT — unrecognized explicit role "${profile.roleText}".`;
          unresolved++;
        } else {
          row.reviewStatus = "needs-review";
          row.role = role;
          row.provider = "ESPNCRICINFO";
          row.sourceUrl = profile.url;
          row.retrievedAt = profile.fetchedAt;
          row.reviewNotes =
            `CANDIDATE ONLY — explicit ESPNcricinfo role "${profile.roleText}". Profile name matched the Register identity. Human review is required before setting reviewStatus to verified.`;
          candidates++;
        }
      }

      console.log(
        `[WORLD ROLE ENRICHMENT] ${index + 1}/${selected.length} ${row.fullName}: ` +
        `${profile ? `candidate ${profile.roleText}` : "unresolved"}`,
      );

      // Be polite to the upstream service.
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(2, selected.length) }, () => worker()),
  );

  writeQueue(rows);

  console.log(`[WORLD ROLE ENRICHMENT] Candidates for human review: ${candidates}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Unresolved in this run: ${unresolved}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Missing Register identity: ${missingIdentity}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Missing ESPNcricinfo ID: ${missingCricinfoId}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Updated ${QUEUE_PATH}.`);
  console.log(
    "[WORLD ROLE ENRICHMENT] No role was inferred from statistics and no candidate was auto-approved.",
  );
}

main().catch((error) => {
  console.error(
    `[WORLD ROLE ENRICHMENT] Failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
});