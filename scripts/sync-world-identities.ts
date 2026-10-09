
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const OUTPUT_DIRECTORY = path.join(
  ROOT,
  "scripts",
  "data",
  "world",
  "register"
);

const PEOPLE_URL = "https://cricsheet.org/register/people.csv";
const NAMES_URL = "https://cricsheet.org/register/names.csv";

function fail(message: string): never {
  throw new Error(`[WORLD REGISTER] ${message}`);
}

function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

/**
 * Read the CSV header without assuming that the file
 * starts immediately with its first column name.
 */
function readCsvHeader(csv: string): string[] {
  const firstLine = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/, 1)[0];

  if (!firstLine) {
    fail("Downloaded CSV is empty.");
  }

  const columns: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < firstLine.length; i++) {
    const character = firstLine[i];
    const next = firstLine[i + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      columns.push(field.trim());
      field = "";
      continue;
    }

    field += character;
  }

  columns.push(field.trim());

  return columns.map((column) =>
    column.replace(/^\uFEFF/, "").trim()
  );
}

async function fetchCsv(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Build-Your-XI-data-pipeline/1.0",
      Accept: "text/csv,text/plain,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    fail(`${url}: HTTP ${response.status} ${response.statusText}`);
  }

  const body = await response.text();

  if (!body.trim()) {
    fail(`${url}: response was empty.`);
  }

  // Avoid writing an HTML error or access-denied page as a CSV.
  const beginning = body.trimStart().slice(0, 200).toLowerCase();

  if (
    beginning.startsWith("<!doctype html") ||
    beginning.startsWith("<html")
  ) {
    fail(`${url}: received HTML instead of CSV.`);
  }

  return body.replace(/^\uFEFF/, "");
}

function validatePeopleCsv(csv: string): number {
  const columns = readCsvHeader(csv);
  const required = [
    "identifier",
    "name",
    "unique_name",
    "key_cricketarchive",
  ];

  const missing = required.filter(
    (column) => !columns.includes(column)
  );

  if (missing.length > 0) {
    fail(
      `people.csv is missing required columns: ${missing.join(", ")}. ` +
        `Received columns: ${columns.join(", ")}`
    );
  }

  const identifierIndex = columns.indexOf("identifier");
  const nameIndex = columns.indexOf("name");

  let validRecords = 0;

  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;

    // The register rows can contain quoted commas. This lightweight
    // record check reads the identifier and name at the start of a row.
    const match = line.match(
      /^\s*(?:"([0-9a-f]{8})"|([0-9a-f]{8})),(?:"([^"]*(?:""[^"]*)*)"|([^,]*)),/i
    );

    if (match) {
      const identifier = (match[1] ?? match[2] ?? "").trim();
      const name = (match[3] ?? match[4] ?? "").trim();

      if (
        /^[0-9a-f]{8}$/i.test(identifier) &&
        name.length > 0
      ) {
        validRecords++;
      }
    }
  }

  if (validRecords === 0) {
    fail(
      `people.csv has the expected columns but no valid player records ` +
        `(identifier column ${identifierIndex}, name column ${nameIndex}).`
    );
  }

  return validRecords;
}

function validateNamesCsv(csv: string): number {
  const columns = readCsvHeader(csv);
  const required = ["identifier", "name"];

  const missing = required.filter(
    (column) => !columns.includes(column)
  );

  if (missing.length > 0) {
    fail(
      `names.csv is missing required columns: ${missing.join(", ")}. ` +
        `Received columns: ${columns.join(", ")}`
    );
  }

  const records = csv
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim()).length;

  if (records === 0) {
    fail("names.csv contains no alternate-name records.");
  }

  return records;
}

async function main(): Promise<void> {
  console.log("[WORLD REGISTER] Downloading Cricsheet Register.");

  const [peopleCsv, namesCsv] = await Promise.all([
    fetchCsv(PEOPLE_URL),
    fetchCsv(NAMES_URL),
  ]);

  const peopleCount = validatePeopleCsv(peopleCsv);
  const namesCount = validateNamesCsv(namesCsv);

  ensureDirectory(OUTPUT_DIRECTORY);

  // Write only after both files have passed validation.
  fs.writeFileSync(
    path.join(OUTPUT_DIRECTORY, "people.csv"),
    peopleCsv,
    "utf8"
  );

  fs.writeFileSync(
    path.join(OUTPUT_DIRECTORY, "names.csv"),
    namesCsv,
    "utf8"
  );

  fs.writeFileSync(
    path.join(OUTPUT_DIRECTORY, "source.json"),
    `${JSON.stringify(
      {
        provider: "Cricsheet Register",
        peopleUrl: PEOPLE_URL,
        namesUrl: NAMES_URL,
        retrievedAt: new Date().toISOString(),
        peopleRecords: peopleCount,
        alternateNameRecords: namesCount,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `[WORLD REGISTER] Successful: ${peopleCount} player records and ` +
      `${namesCount} alternate-name records downloaded.`
  );
}

main().catch((error: unknown) => {
  console.error("[WORLD REGISTER] Failed:", error);
  process.exitCode = 1;
});
