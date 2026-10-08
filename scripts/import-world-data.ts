import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { WORLD_AVAILABLE_EDITION_YEARS } from "./data/world/editions";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const DIR=path.join(process.cwd(),"scripts/data/world/processed");

type Season=any;

function fail(m:string):never{throw new Error(`[WORLD IMPORT] ${m}`);}
function read(year:number):Season{
  const p=path.join(DIR,`${year}.json`);
  if(!fs.existsSync(p)) fail(`Missing ${p}`);
  return JSON.parse(fs.readFileSync(p,"utf8"));
}
async function one<T>(promise:PromiseLike<{data:T|null,error:any}>):Promise<T>{
  const r=await promise;
  if(r.error) throw r.error;
  if(r.data===null) throw new Error("Expected data but received null.");
  return r.data;
}
async function getSeason(year:number){
  const q=await db.from("seasons").select("id").eq("year",year).maybeSingle();
  if(q.error) throw q.error;
  if(q.data) return q.data.id;
  return (await one(db.from("seasons").insert({year}).select("id").single())).id;
}
async function getTeam(t:any){
  const q=await db.from("teams").select("id,name,short_name,slug").eq("slug",t.slug).maybeSingle();
  if(q.error) throw q.error;
  if(q.data){
    if(q.data.name!==t.name||q.data.short_name!==t.shortName){
      const u=await db.from("teams").update({name:t.name,short_name:t.shortName}).eq("id",q.data.id);
      if(u.error) throw u.error;
    }
    return q.data.id;
  }
  return (await one(db.from("teams").insert({name:t.name,short_name:t.shortName,slug:t.slug}).select("id").single())).id;
}
async function getTeamSeason(teamId:string,seasonId:string){
  const q=await db.from("team_seasons").select("id").eq("team_id",teamId).eq("season_id",seasonId).maybeSingle();
  if(q.error) throw q.error;
  if(q.data) return q.data.id;
  return (await one(db.from("team_seasons").insert({team_id:teamId,season_id:seasonId}).select("id").single())).id;
}
async function getPlayer(p:any){
  const q=await db.from("players").select("id,full_name,source_player_id").eq("source_player_id",p.sourcePlayerId).maybeSingle();
  if(q.error) throw q.error;
  if(q.data){
    if(q.data.full_name!==p.fullName) fail(`Identity collision ${p.sourcePlayerId}: ${q.data.full_name} vs ${p.fullName}`);
    return q.data.id;
  }
  return (await one(db.from("players").insert({full_name:p.fullName,source_player_id:p.sourcePlayerId}).select("id").single())).id;
}
async function importPlayer(p:any,teamSeasonId:string){
  const playerId=await getPlayer(p);
  const role=await db.from("player_roles").upsert({player_id:playerId,role:p.role},{onConflict:"player_id,role"});
  if(role.error) throw role.error;
  const stats=await db.from("player_season_stats").upsert({
    player_id:playerId,team_season_id:teamSeasonId,
    matches:p.stats.matches,innings:p.stats.innings,runs:p.stats.runs,
    batting_average:p.stats.batting_average,strike_rate:p.stats.strike_rate,
    hundreds:p.stats.hundreds,fifties:p.stats.fifties,wickets:p.stats.wickets,
    bowling_average:p.stats.bowling_average,economy:p.stats.economy,
    catches:p.stats.catches,stumpings:p.stats.stumpings
  },{onConflict:"player_id,team_season_id"});
  if(stats.error) throw stats.error;

  const sourceId=p.sourcePlayerId.replace(/^cricsheet:/,"");
  const source=await db.from("world_player_sources").upsert({
    player_id:playerId,provider:"Cricsheet",source_player_id:sourceId,
    source_url:"https://cricsheet.org/",retrieved_at:new Date().toISOString()
  },{onConflict:"provider,source_player_id"});
  if(source.error) throw source.error;
}
async function main(){
  console.log("[WORLD IMPORT] Starting.");
  for(const year of WORLD_AVAILABLE_EDITION_YEARS){
    const season=read(year);
    const seasonId=await getSeason(year);
    for(const t of season.teams){
      const teamId=await getTeam(t);
      const tsId=await getTeamSeason(teamId,seasonId);
      for(const p of t.players) await importPlayer(p,tsId);
    }
    console.log(`[WORLD IMPORT] ${year} imported.`);
  }
  console.log("[WORLD IMPORT] Successful.");
}
main().catch(e=>{console.error("[WORLD IMPORT] Failed:",e);process.exit(1);});
