import fs from "node:fs";
import path from "node:path";

type Role = "BAT" | "WK" | "AR" | "BOWL";
type Json = Record<string, any>;

type Match = {
  info: {
    dates?: string[];
    teams: string[];
    players: Record<string, string[]>;
    registry?: { people?: Record<string, string> };
    event?: { name?: string };
  };
  innings?: Array<{
    team: string;
    overs?: Array<{
      deliveries?: Array<{
        batter: string;
        bowler: string;
        non_striker: string;
        runs: { batter: number; extras: number; total: number; non_boundary?: boolean };
        extras?: Record<string, number>;
        wickets?: Array<{
          kind: string;
          player_out: string;
          fielders?: Array<{ name: string }>;
        }>;
      }>;
    }>;
  }>;
};

type RoleEntry = {
  role: Role;
  source: { provider: string; url: string; retrievedAt: string };
};

const ROOT = process.cwd();
const RAW = path.join(ROOT, "scripts/data/world/raw");
const OUT = path.join(ROOT, "scripts/data/world/processed");
const EDITIONS = path.join(ROOT, "scripts/data/world/editions.ts");
const ROLES = path.join(ROOT, "scripts/data/world/role-sources.json");

function fail(message: string): never {
  throw new Error(`[WORLD PROCESSING] ${message}`);
}
function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
function readJson<T>(p: string): T {
  if (!fs.existsSync(p)) fail(`Missing ${p}`);
  const raw = fs.readFileSync(p, "utf8");
  if (!raw.trim()) fail(`Empty ${p}`);
  try { return JSON.parse(raw) as T; } catch (e) { fail(`Invalid JSON ${p}: ${e}`); }
}
function parseEditions(): Array<{year:number; seasonName:string; oversPerInnings:number; expectedMatchCount:number; competition:string}> {
  const text = fs.readFileSync(EDITIONS, "utf8");
  const re = /\{ year: (\d+), seasonName: "([^"]+)", format: "ODI", competition: "ICC Men's Cricket World Cup", oversPerInnings: (\d+), expectedMatchCount: (\d+),/g;
  const out=[] as any[];
  for (const m of text.matchAll(re)) out.push({year:+m[1], seasonName:m[2], oversPerInnings:+m[3], expectedMatchCount:+m[4], competition:"ICC Men's Cricket World Cup"});
  if (!out.length) fail("Unable to read edition registry.");
  return out;
}
function loadRoles(): Map<string, RoleEntry> {
  const f = readJson<any>(ROLES);
  const map = new Map<string, RoleEntry>();
  for (const [id, entry] of Object.entries(f.players ?? {})) map.set(id, entry as RoleEntry);
  return map;
}
function canonicalId(match: Match, name: string): string {
  const id = match.info.registry?.people?.[name];
  if (!id || !/^[0-9a-f]{8}$/.test(id)) fail(`Missing Cricsheet registry ID for ${name}.`);
  return `cricsheet:${id}`;
}
function numeric(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

type Acc = {
  id: string; name: string; team: string; matches: Set<string>; innings: number;
  runs: number; balls: number; dismissals: number; wickets: number; ballsBowled: number;
  runsConceded: number; catches: number; stumpings: number; fifties: number; hundreds: number;
};

function newAcc(id:string,name:string,team:string):Acc {
  return {id,name,team,matches:new Set(),innings:0,runs:0,balls:0,dismissals:0,wickets:0,ballsBowled:0,runsConceded:0,catches:0,stumpings:0,fifties:0,hundreds:0};
}

function processEdition(year:number, edition:any, roles:Map<string,RoleEntry>) {
  const wrapper = readJson<any>(path.join(RAW, `${year}.json`));
  const matches = Array.isArray(wrapper.matches) ? wrapper.matches as Match[] : [];
  if (matches.length !== edition.expectedMatchCount) fail(`${year}: found ${matches.length} matches, expected ${edition.expectedMatchCount}.`);

  const seen = new Set<string>();
  const players = new Map<string, Acc>();
  const teamPlayers = new Map<string, Set<string>>();

  for (const match of matches) {
    const date = match.info.dates?.[0] ?? "";
    const matchKey = `${date}|${[...match.info.teams].sort().join("|")}`;
    if (seen.has(matchKey)) fail(`${year}: duplicate match ${matchKey}`);
    seen.add(matchKey);

    for (const [team, names] of Object.entries(match.info.players ?? {})) {
      const set = teamPlayers.get(team) ?? new Set<string>();
      for (const name of names) {
        const id = canonicalId(match, name);
        set.add(id);
        const p = players.get(id) ?? newAcc(id, name, team);
        p.matches.add(matchKey);
        players.set(id, p);
      }
      teamPlayers.set(team, set);
    }

    for (const innings of match.innings ?? []) {
      for (const over of innings.overs ?? []) {
        for (const ball of over.deliveries ?? []) {
          const batterId = canonicalId(match, ball.batter);
          const bowlerId = canonicalId(match, ball.bowler);
          const batter = players.get(batterId);
          const bowler = players.get(bowlerId);
          if (!batter || !bowler) fail(`${year}: registry player missing from lineup.`);
          batter.innings = batter.innings || 0;
          batter.runs += numeric(ball.runs?.batter);
          batter.balls += ball.extras?.wides || ball.extras?.noballs ? 0 : 1;
          if (ball.wickets) for (const w of ball.wickets) {
            if (w.player_out === ball.batter && !["retired hurt","retired not out"].includes(w.kind)) batter.dismissals++;
            if (w.fielders) for (const f of w.fielders) {
              const fid = canonicalId(match, f.name);
              const fp = players.get(fid);
              if (fp) {
                if (w.kind === "stumped") fp.stumpings++;
                else if (["caught","caught and bowled"].includes(w.kind)) fp.catches++;
              }
            }
          }
          bowler.ballsBowled += ball.extras?.wides || ball.extras?.noballs ? 0 : 1;
          const conceded = numeric(ball.runs?.total) - numeric(ball.extras?.byes) - numeric(ball.extras?.legbyes) - numeric(ball.extras?.penalty);
          bowler.runsConceded += Math.max(0, conceded);
          if (ball.wickets) for (const w of ball.wickets) {
            if (!["run out","retired hurt","retired not out","obstructing the field"].includes(w.kind)) bowler.wickets++;
          }
        }
      }
      // innings count is added once per team/player who batted in this innings.
      const batters = new Set<string>();
      for (const over of innings.overs ?? []) for (const ball of over.deliveries ?? []) {
        batters.add(canonicalId(match, ball.batter));
      }
      for (const id of batters) { const p=players.get(id); if(p) p.innings++; }
    }
  }

  const teams = [...teamPlayers.entries()].map(([team, ids]) => {
    const teamOut = [...ids].map(id => {
      const p = players.get(id)!;
      const roleId = id.replace(/^cricsheet:/, "");
      const role = roles.get(roleId);
      if (!role) fail(`${year}/${team}/${p.name}: no verified role for ${roleId}.`);
      const battingAvg = p.dismissals ? p.runs / p.dismissals : null;
      const strike = p.balls ? (p.runs / p.balls) * 100 : null;
      const bowlingAvg = p.wickets ? p.runsConceded / p.wickets : null;
      const economy = p.ballsBowled ? (p.runsConceded / (p.ballsBowled / 6)) : null;
      const stats = {
        matches:p.matches.size, innings:p.innings, runs:p.runs,
        batting_average: battingAvg, strike_rate: strike,
        hundreds:p.hundreds, fifties:p.fifties, wickets:p.wickets,
        bowling_average:bowlingAvg, economy, catches:p.catches, stumpings:p.stumpings
      };
      return {
        fullName:p.name, sourcePlayerId:id, role:role.role, stats,
        sources:[{provider:"Cricsheet",url:"https://cricsheet.org/"}],
        roleSource:role.source
      };
    });
    return {
      name:team,
      shortName:team.length <= 4 ? team : team.replace(/[^A-Za-z]/g,"").slice(0,4).toUpperCase(),
      slug:team.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),
      players:teamOut,
      sources:["https://cricsheet.org/"]
    };
  });

  return {year,seasonName:edition.seasonName,format:"ODI",competition:edition.competition,oversPerInnings:edition.oversPerInnings,teams,sources:["https://cricsheet.org/"]};
}

function main() {
  const roles = loadRoles();
  ensureDir(OUT);
  for (const edition of parseEditions().filter(x => x.year >= 2003)) {
    const result = processEdition(edition.year, edition, roles);
    fs.writeFileSync(path.join(OUT, `${edition.year}.json`), JSON.stringify(result,null,2)+"\n");
    console.log(`[WORLD PROCESSING] ${edition.year}: ${result.teams.length} teams`);
  }
  console.log("[WORLD PROCESSING] Modern editions processed.");
}
main();
