import fs from "node:fs";
import path from "node:path";
import { WORLD_AVAILABLE_EDITIONS } from "./data/world/editions";

const ROOT=process.cwd();
const DIR=path.join(ROOT,"scripts/data/world/processed");
const VALID=new Set(["BAT","WK","AR","BOWL"]);

function fail(m:string):never{throw new Error(`[WORLD VALIDATION] ${m}`);}
function read(p:string):any{
  if(!fs.existsSync(p)) fail(`Missing ${p}`);
  try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch(e){fail(`Invalid JSON ${p}: ${e}`);}
}
function finiteOrNull(x:any){return x===null || (typeof x==="number"&&Number.isFinite(x));}

for(const edition of WORLD_AVAILABLE_EDITIONS){
  const s=read(path.join(DIR,`${edition.year}.json`));
  if(s.year!==edition.year) fail(`${edition.year}: year mismatch.`);
  if(s.oversPerInnings!==edition.oversPerInnings) fail(`${edition.year}: overs mismatch.`);
  if(!Array.isArray(s.teams)||!s.teams.length) fail(`${edition.year}: no teams.`);
  const ids=new Set<string>();
  let count=0;
  for(const t of s.teams){
    if(!t.name||!t.slug) fail(`${edition.year}: invalid team.`);
    if(!Array.isArray(t.players)||!t.players.length) fail(`${edition.year}/${t.name}: no players.`);
    for(const p of t.players){
      count++;
      if(!p.sourcePlayerId?.startsWith("cricsheet:")) fail(`${edition.year}/${t.name}/${p.fullName}: canonical Cricsheet ID missing.`);
      if(!VALID.has(p.role)) fail(`${edition.year}/${t.name}/${p.fullName}: invalid role.`);
      if(ids.has(p.sourcePlayerId)) fail(`${edition.year}: duplicate player ID ${p.sourcePlayerId}.`);
      ids.add(p.sourcePlayerId);
      if(!p.roleSource?.provider||!p.roleSource?.url||!p.roleSource?.retrievedAt) fail(`${edition.year}/${p.fullName}: missing role source.`);
      for(const k of ["matches","innings","runs","hundreds","fifties","wickets","catches","stumpings"]){
        if(!Number.isInteger(p.stats?.[k])||p.stats[k]<0) fail(`${edition.year}/${p.fullName}: invalid ${k}.`);
      }
      for(const k of ["batting_average","strike_rate","bowling_average","economy"]){
        if(!finiteOrNull(p.stats?.[k])) fail(`${edition.year}/${p.fullName}: invalid ${k}.`);
      }
      if(p.stats.innings>p.stats.matches) fail(`${edition.year}/${p.fullName}: innings > matches.`);
    }
  }
  if(count===0) fail(`${edition.year}: zero players.`);
  console.log(`[WORLD VALIDATION] ${edition.year}: ${s.teams.length} teams / ${count} players`);
}
console.log("[WORLD VALIDATION] Successful.");
