import fs from "node:fs";
import path from "node:path";

type WorldRole = "BAT" | "WK" | "AR" | "BOWL";

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

type RegisterPerson = Record<string, string>;
type CachedProfile = {
  playerId: string;
  provider?: "ESPNCRICINFO" | "CRICKETARCHIVE";
  fetchedAt: string;
  profileName: string;
  roleText: string;
  profileUrl: string;
};

const ROOT = process.cwd();
const DATA = path.join(ROOT, "scripts", "data", "world");
const QUEUE_PATH = path.join(DATA, "role-review-queue.tsv");
const PEOPLE_PATH = path.join(DATA, "register", "people.csv");
const CACHE_DIR = path.join(DATA, ".cache", "role-enrichment");
const HEADERS: (keyof QueueRow)[] = [
  "sourcePlayerId", "fullName", "teams", "editions", "reviewStatus",
  "role", "provider", "sourceUrl", "retrievedAt", "reviewNotes",
  "iccSearchUrl", "boardSearchUrl",
];

function fail(message: string): never {
  throw new Error(`[WORLD ROLE ENRICHMENT] ${message}`);
}

function sanitizeCell(value: unknown): string {
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
      if (record.some(value => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (quoted) fail("Encountered an unterminated quoted CSV field in the Cricsheet Register.");
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    if (record.some(value => value.length > 0)) records.push(record);
  }
  return records;
}

function readQueue(): QueueRow[] {
  if (!fs.existsSync(QUEUE_PATH)) fail(`Missing ${QUEUE_PATH}.`);
  const records = parseDelimited(fs.readFileSync(QUEUE_PATH, "utf8"), "\t");
  if (records.length < 2) fail("Review queue has no player rows.");
  const header = records[0];
  const missing = HEADERS.filter(name => !header.includes(name));
  if (missing.length) fail(`Review queue is missing columns: ${missing.join(", ")}.`);

  return records.slice(1).map((values, index) => {
    const row = {} as QueueRow;
    for (const key of HEADERS) row[key] = values[header.indexOf(key)] ?? "";
    if (!row.sourcePlayerId || !row.fullName) fail(`Queue row ${index + 2} has a blank ID or name.`);
    return row;
  });
}

function writeQueue(rows: QueueRow[]): void {
  const content = [
    HEADERS.join("\t"),
    ...rows.map(row => HEADERS.map(key => sanitizeCell(row[key])).join("\t")),
  ].join("\n") + "\n";
  fs.writeFileSync(QUEUE_PATH, content, "utf8");
}

function readRegister(): RegisterPerson[] {
  if (!fs.existsSync(PEOPLE_PATH)) {
    fail(`Missing ${PEOPLE_PATH}. Run npm run data:sync-world-identities first.`);
  }
  const records = parseDelimited(fs.readFileSync(PEOPLE_PATH, "utf8"), ",");
  if (records.length < 2) fail("Cricsheet people.csv has no data rows.");
  const header = records[0];
  const required = ["identifier", "name", "key_cricinfo", "key_cricketarchive"];
  const missing = required.filter(name => !header.includes(name));
  if (missing.length) fail(`Cricsheet people.csv is missing columns: ${missing.join(", ")}.`);
  return records.slice(1).map(values => {
    const row: RegisterPerson = {};
    header.forEach((key, index) => row[key] = values[index] ?? "");
    return row;
  });
}

function historicalCricketArchiveId(sourcePlayerId: string): string | null {
  if (!sourcePlayerId.startsWith("cricketarchive:")) return null;
  const match = sourcePlayerId.match(/\/players?\/\d+\/\d+\/(\d+)\.html(?:[?#].*)?$/i);
  return match?.[1] ?? null;
}

function cricketArchiveProfileUrl(sourcePlayerId: string): string | null {
  const match = sourcePlayerId.match(
    /^cricketarchive:(?:\/[a-z-]+)?\/players?\/(\d+)\/(\d+)\/(\d+)\.html(?:[?#].*)?$/i,
  );
  if (!match) return null;
  return `https://cricketarchive.com/Archive/Players/${match[1]}/${match[2]}/${match[3]}.html`;
}

async function fetchCricketArchiveRole(sourcePlayerId: string): Promise<CachedProfile | null> {
  const profileUrl = cricketArchiveProfileUrl(sourcePlayerId);
  if (!profileUrl) return null;
  const cacheName = encodeURIComponent(sourcePlayerId).replace(/%/g, "_");
  const cachePath = path.join(CACHE_DIR, `ca-${cacheName}.json`);
  if (!process.argv.includes("--refresh") && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as CachedProfile;
      if (cached.playerId === sourcePlayerId && cached.roleText && normalizeRole(cached.roleText)) return cached;
    } catch {
      // Ignore invalid cache entries and retry the source.
    }
  }

  try {
    const response = await fetch(profileUrl, {
      headers: {
        "User-Agent": "Build-Your-XI/1.0 (World Cup historical role enrichment)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    if (!html.trim() || /access denied|captcha|checking your browser/i.test(html.slice(0, 3000))) return null;

    const stripHtml = (value: string): string => value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#(?:39|x27);/gi, "'")
      .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/\s+/g, " ")
      .trim();

    let roleText = "";
    for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rowMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
        .map(match => stripHtml(match[1]));
      if (cells.length < 2) continue;
      const label = cells[0].toLowerCase();
      const value = cells[1];
      if (["playing role", "player role", "role"].includes(label) && normalizeRole(value)) {
        roleText = value;
        break;
      }
    }
    if (!roleText) {
      for (const match of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
        const label = stripHtml(match[1]).toLowerCase();
        const value = stripHtml(match[2]);
        if (["playing role", "player role", "role"].includes(label) && normalizeRole(value)) {
          roleText = value;
          break;
        }
      }
    }
    if (!roleText) return null;

    const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const cached: CachedProfile = {
      playerId: sourcePlayerId,
      provider: "CRICKETARCHIVE",
      fetchedAt: new Date().toISOString(),
      profileName: heading ? stripHtml(heading[1]) : "",
      roleText,
      profileUrl,
    };
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify(cached, null, 2)}\n`, "utf8");
    return cached;
  } catch {
    return null;
  }
}

function buildRegisterIndex(people: RegisterPerson[]) {
  const byIdentifier = new Map<string, RegisterPerson>();
  const byCricketArchiveId = new Map<string, RegisterPerson[]>();
  for (const person of people) {
    const identifier = (person.identifier ?? "").toLowerCase().trim();
    if (identifier) byIdentifier.set(identifier, person);
    for (const field of ["key_cricketarchive", "key_cricketarchive_2"]) {
      const value = (person[field] ?? "").trim();
      if (!value) continue;
      const current = byCricketArchiveId.get(value) ?? [];
      current.push(person);
      byCricketArchiveId.set(value, current);
    }
  }
  return { byIdentifier, byCricketArchiveId };
}

function cricinfoId(person: RegisterPerson): string | null {
  for (const field of ["key_cricinfo", "key_cricinfo_2", "key_cricinfo_3"]) {
    const value = (person[field] ?? "").trim();
    if (/^\d+$/.test(value)) return value;
  }
  return null;
}

function getRoleText(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = getRoleText(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const object = value as Record<string, unknown>;
  for (const key of ["playingRole", "playing_role", "position", "playerRole", "player_role"]) {
    if (!(key in object)) continue;
    const candidate = object[key];
    if (typeof candidate === "string" && normalizeRole(candidate)) return candidate.trim();
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      for (const nestedKey of ["name", "longName", "displayName", "value"]) {
        const nestedValue = nested[nestedKey];
        if (typeof nestedValue === "string" && normalizeRole(nestedValue)) return nestedValue.trim();
      }
    }
  }

  for (const [key, child] of Object.entries(object)) {
    if (["playingRole", "playing_role", "position", "playerRole", "player_role"].includes(key)) continue;
    const found = getRoleText(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizeRole(raw: string): WorldRole | null {
  const value = raw.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (!value) return null;
  if (/wicket.?keeper|keeper batter|keeper batsman/.test(value)) return "WK";
  if (/all.?rounder|all rounder/.test(value)) return "AR";
  if (/\bbatter\b|\bbatsman\b|batting/.test(value)) return "BAT";
  if (/\bbowler\b|bowling/.test(value)) return "BOWL";
  return null;
}

function findProfileName(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProfileName(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const object = value as Record<string, unknown>;
  for (const key of ["fullName", "longName", "displayName", "name"]) {
    if (typeof object[key] === "string" && (object[key] as string).trim()) return (object[key] as string).trim();
  }
  for (const child of Object.values(object)) {
    const found = findProfileName(child, depth + 1);
    if (found) return found;
  }
  return null;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Build-Your-XI/1.0 (World Cup role metadata enrichment)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`ESPNcricinfo returned HTTP ${response.status}.`);
  }
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return null;
  return await response.json() as unknown;
}

async function fetchProfile(playerId: string): Promise<CachedProfile | null> {
  const cachePath = path.join(CACHE_DIR, `espn-${playerId}.json`);
  if (!process.argv.includes("--refresh") && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as CachedProfile;
      if (cached.playerId === playerId && cached.roleText && normalizeRole(cached.roleText)) return cached;
    } catch {
      // Invalid cache entries are ignored and fetched again.
    }
  }

  const endpoints = [
    `https://hs-consumer-api.espncricinfo.com/v1/pages/player/home?playerId=${encodeURIComponent(playerId)}`,
    `https://core.espnuk.org/v2/sports/cricket/athletes/${encodeURIComponent(playerId)}`,
  ];

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await fetchJson(endpoint);
        if (data) {
          const roleText = getRoleText(data);
          if (roleText && normalizeRole(roleText)) {
            const cached: CachedProfile = {
              playerId,
              fetchedAt: new Date().toISOString(),
              profileName: findProfileName(data) ?? "",
              roleText,
              profileUrl: `https://www.espncricinfo.com/cricketers/player-name-${playerId}`,
            };
            fs.mkdirSync(CACHE_DIR, { recursive: true });
            fs.writeFileSync(cachePath, `${JSON.stringify(cached, null, 2)}\n`, "utf8");
            return cached;
          }
        }
        break;
      } catch (error) {
        if (attempt === 2) break;
        await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const people = readRegister();
  const queue = readQueue();
  const { byIdentifier, byCricketArchiveId } = buildRegisterIndex(people);
  const historicalIds = new Map<string, RegisterPerson | null>();

  let matched = 0;
  let alreadyReviewed = 0;
  let autoAssigned = 0;
  let noRegisterMatch = 0;
  let noCricinfoId = 0;
  let noDocumentedRole = 0;

  const work: Array<{ row: QueueRow; provider: "ESPNCRICINFO" | "CRICKETARCHIVE"; id: string }> = [];
  for (const row of queue) {
    if (row.reviewStatus === "verified" && row.role && row.provider && row.sourceUrl) {
      alreadyReviewed++;
      continue;
    }

    let person = byIdentifier.get(row.sourcePlayerId.toLowerCase());
    if (!person) {
      const caId = historicalCricketArchiveId(row.sourcePlayerId);
      if (caId) {
        if (!historicalIds.has(caId)) {
          const candidates = byCricketArchiveId.get(caId) ?? [];
          historicalIds.set(caId, candidates.length === 1 ? candidates[0] : null);
        }
        person = historicalIds.get(caId) ?? undefined;
      }
    }

    if (!person) {
      noRegisterMatch++;
      const archiveUrl = cricketArchiveProfileUrl(row.sourcePlayerId);
      if (archiveUrl) {
        work.push({ row, provider: "CRICKETARCHIVE", id: row.sourcePlayerId });
      } else {
        row.reviewNotes = row.reviewNotes || "No unique Cricsheet Register identity mapping or direct CricketArchive profile URL; manual identity/source review required.";
      }
      continue;
    }
    matched++;

    const id = cricinfoId(person);
    if (!id) {
      noCricinfoId++;
      const archiveUrl = cricketArchiveProfileUrl(row.sourcePlayerId);
      if (archiveUrl) {
        work.push({ row, provider: "CRICKETARCHIVE", id: row.sourcePlayerId });
      } else {
        row.reviewNotes = row.reviewNotes || "Register identity matched, but no ESPNcricinfo profile ID or direct CricketArchive profile URL is available.";
      }
      continue;
    }
    work.push({ row, provider: "ESPNCRICINFO", id });
  }

  const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(limit) && limit !== Number.POSITIVE_INFINITY) fail("--limit must be a positive number.");
  if (limit <= 0) fail("--limit must be a positive number.");
  const selected = work.slice(0, limit);

  console.log(`[WORLD ROLE ENRICHMENT] Queue rows: ${queue.length}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Register identity matches: ${matched}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Profile lookups queued: ${work.length}; processing: ${selected.length} (ESPNcricinfo and CricketArchive fallback).`);
  console.log("[WORLD ROLE ENRICHMENT] Using explicit profile role metadata only; no statistical inference is performed.");

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= selected.length) return;
      const { row, provider, id } = selected[index];
      const profile = provider === "ESPNCRICINFO"
        ? await fetchProfile(id)
        : await fetchCricketArchiveRole(id);
      if (!profile) {
        noDocumentedRole++;
        row.reviewNotes = provider === "ESPNCRICINFO"
          ? "ESPNcricinfo profile could not provide an explicit, recognized playing-role field; left unresolved."
          : "CricketArchive profile did not expose an explicit, recognized playing-role field or was unavailable; left unresolved.";
      } else {
        const role = normalizeRole(profile.roleText);
        if (!role) {
          noDocumentedRole++;
          row.reviewNotes = `Unrecognized ${provider} playing-role text: ${profile.roleText}; left unresolved.`;
        } else {
          row.reviewStatus = "verified";
          row.role = role;
          row.provider = provider;
          row.sourceUrl = profile.profileUrl;
          row.retrievedAt = profile.fetchedAt;
          const identityEvidence = provider === "ESPNCRICINFO"
            ? `Identity linked through the Cricsheet Register (ESPNcricinfo ID ${id})`
            : `Historical profile URL is derived from the record's CricketArchive sourcePlayerId (${id})`;
          row.reviewNotes = `Explicit ${provider} profile role: "${profile.roleText}". ${identityEvidence}; profile display name: ${profile.profileName || "not supplied"}.`;
          autoAssigned++;
        }
      }
      if ((index + 1) % 25 === 0 || index + 1 === selected.length) {
        console.log(`[WORLD ROLE ENRICHMENT] Processed ${index + 1}/${selected.length}; assigned ${autoAssigned} in this run.`);
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, selected.length) }, () => worker()));
  writeQueue(queue);

  console.log(`[WORLD ROLE ENRICHMENT] Explicit roles assigned this run: ${autoAssigned}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Rows already reviewed and preserved: ${alreadyReviewed}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Rows with no register match: ${noRegisterMatch}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Register matches without ESPNcricinfo ID: ${noCricinfoId}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Profiles without a recognized explicit role: ${noDocumentedRole}.`);
  console.log(`[WORLD ROLE ENRICHMENT] Updated ${QUEUE_PATH}.`);
  if (selected.length < work.length) {
    console.log(`[WORLD ROLE ENRICHMENT] ${work.length - selected.length} profile(s) were not processed because --limit was used.`);
  }
  console.log(`[WORLD ROLE ENRICHMENT] Retrieved timestamp is recorded per profile; cached results are reused unless --refresh is passed.`);
}

main().catch((error: unknown) => {
  console.error("[WORLD ROLE ENRICHMENT] Failed:", error);
  process.exitCode = 1;
});
