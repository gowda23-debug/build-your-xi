import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "scripts/data/world/register");
const PEOPLE_URL = "https://cricsheet.org/register/people.csv";
const NAMES_URL = "https://cricsheet.org/register/names.csv";

function fail(m: string): never { throw new Error(`[WORLD REGISTER] ${m}`); }
function ensure(p: string) { fs.mkdirSync(p, { recursive: true }); }

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": "Build-Your-XI-data-pipeline/1.0" } });
  if (!r.ok) fail(`${url}: HTTP ${r.status}`);
  return await r.text();
}

async function main() {
  ensure(OUT);
  const [people, names] = await Promise.all([fetchText(PEOPLE_URL), fetchText(NAMES_URL)]);
  if (
    !people.includes(
      "identifier"
    ) ||
    !people.includes(
      "key_cricketarchive"
    )
  ) {
    throw new Error(
      "Cricsheet Register does not contain identifier/key_cricketarchive."
    );
  }
  fail("people.csv does not contain the expected register columns.");
  fs.writeFileSync(path.join(OUT, "people.csv"), people, "utf8");
  fs.writeFileSync(path.join(OUT, "names.csv"), names, "utf8");
  fs.writeFileSync(path.join(OUT, "source.json"), JSON.stringify({
    provider: "Cricsheet Register",
    peopleUrl: PEOPLE_URL,
    namesUrl: NAMES_URL,
    retrievedAt: new Date().toISOString()
  }, null, 2) + "\n", "utf8");
  console.log("[WORLD REGISTER] Register downloaded.");
}
main().catch(e => { console.error(e); process.exit(1); });
