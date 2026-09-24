import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const RAW_DIR = path.join(process.cwd(), "scripts", "data", "raw", "ipl_json");

const PITCH_PROFILES = {
  "M. Chinnaswamy Stadium": {
    pitch_type: "BAT",
    pitch_title: "Batting Paradise",
    pitch_summary: "A high-scoring venue with true bounce, a quick outfield and relatively short boundaries.",
    batting_factor: 95,
    pace_factor: 60,
    spin_factor: 35,
    dew_factor: 70,
  },
  "MA Chidambaram Stadium": {
    pitch_type: "SPIN",
    pitch_title: "Slow Turner",
    pitch_summary: "A traditionally slower surface where grip and changes of pace can make spin valuable.",
    batting_factor: 55,
    pace_factor: 45,
    spin_factor: 95,
    dew_factor: 30,
  },
  "Wankhede Stadium": {
    pitch_type: "PACE",
    pitch_title: "Pace & Bounce",
    pitch_summary: "A venue that can offer early pace and carry before becoming excellent for batting, with evening dew often relevant.",
    batting_factor: 85,
    pace_factor: 90,
    spin_factor: 45,
    dew_factor: 85,
  },
  "Eden Gardens": {
    pitch_type: "BAT",
    pitch_title: "Batting Paradise",
    pitch_summary: "A generally true surface with good value for strokeplay and significant dew in evening matches.",
    batting_factor: 90,
    pace_factor: 75,
    spin_factor: 50,
    dew_factor: 85,
  },
  "Narendra Modi Stadium": {
    pitch_type: "BALANCED",
    pitch_title: "Balanced Surface",
    pitch_summary: "A large venue with conditions that can vary by surface, offering a broad mix of batting and bowling conditions.",
    batting_factor: 75,
    pace_factor: 70,
    spin_factor: 65,
    dew_factor: 55,
  },
  "Punjab Cricket Association IS Bindra Stadium": {
    pitch_type: "PACE",
    pitch_title: "Pace & Bounce",
    pitch_summary: "A surface that can offer seam movement and carry while still providing good scoring conditions.",
    batting_factor: 75,
    pace_factor: 85,
    spin_factor: 45,
    dew_factor: 55,
  },
} as const;

const DEFAULT_PROFILE = {
  pitch_type: "BALANCED",
  pitch_title: "Balanced Surface",
  pitch_summary: "A balanced venue profile used until a venue-specific tuning profile is defined.",
  batting_factor: 75,
  pace_factor: 70,
  spin_factor: 65,
  dew_factor: 50,
} as const;

type RawMatch = {
  info?: {
    season?: number | string;
    city?: string | null;
    venue?: string | null;
    teams?: string[];
  };
};

type DbTeam = { id: string; name: string };
type DbSeason = { id: string; season: string };
type DbTeamSeason = { id: string; team_id: string; season_id: string };
type DbVenue = { id: string; name: string; city: string | null };

type VenueAggregate = {
  name: string;
  city: string | null;
  matchCount: number;
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function readRawMatches(): RawMatch[] {
  if (!fs.existsSync(RAW_DIR)) throw new Error(`Raw IPL directory not found: ${RAW_DIR}`);

  const files = fs.readdirSync(RAW_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();

  if (files.length === 0) throw new Error(`No JSON files found in ${RAW_DIR}`);

  console.log(`Found ${files.length} raw IPL match files.`);

  return files.map((file) => {
    const fullPath = path.join(RAW_DIR, file);
    return JSON.parse(fs.readFileSync(fullPath, "utf8")) as RawMatch;
  });
}

async function fetchDatabaseMaps() {
  const [teamsResult, seasonsResult, teamSeasonsResult] = await Promise.all([
    supabase.from("ipl_teams").select("id, name"),
    supabase.from("ipl_seasons").select("id, season"),
    supabase.from("ipl_team_seasons").select("id, team_id, season_id"),
  ]);

  if (teamsResult.error) throw teamsResult.error;
  if (seasonsResult.error) throw seasonsResult.error;
  if (teamSeasonsResult.error) throw teamSeasonsResult.error;

  return {
    teams: (teamsResult.data ?? []) as DbTeam[],
    seasons: (seasonsResult.data ?? []) as DbSeason[],
    teamSeasons: (teamSeasonsResult.data ?? []) as DbTeamSeason[],
  };
}

async function importVenues() {
  console.log("\n================================");
  console.log("IPL VENUE IMPORT");
  console.log("================================\n");

  const matches = readRawMatches();
  const db = await fetchDatabaseMaps();

  const teamIdByName = new Map(db.teams.map((team) => [normalize(team.name), team.id]));
  const seasonIdByName = new Map(db.seasons.map((season) => [normalize(season.season), season.id]));
  const teamSeasonIdByKey = new Map(
    db.teamSeasons.map((record) => [`${record.team_id}__${record.season_id}`, record.id]),
  );

  const aggregates = new Map<string, VenueAggregate>();
  const relationshipCounts = new Map<string, number>();
  const missingTeamSeasons = new Set<string>();
  const malformedFiles: string[] = [];

  for (const match of matches) {
    const info = match.info;
    const venueName = info?.venue?.trim();
    const season = info?.season == null ? null : String(info.season);
    const teams = info?.teams ?? [];

    if (!venueName || !season || teams.length < 2) {
      malformedFiles.push(`season=${season ?? "unknown"}, venue=${venueName ?? "missing"}`);
      continue;
    }

    const city = info?.city?.trim() || null;
    const venueKey = `${normalize(venueName)}__${normalize(city ?? "")}`;
    const current = aggregates.get(venueKey) ?? { name: venueName, city, matchCount: 0 };
    current.matchCount += 1;
    aggregates.set(venueKey, current);

    const seasonId = seasonIdByName.get(normalize(season));
    if (!seasonId) throw new Error(`Season not found in DB: ${season}`);

    for (const teamName of teams) {
      const teamId = teamIdByName.get(normalize(teamName));
      if (!teamId) throw new Error(`Team not found in DB: ${teamName} (season ${season})`);

      const teamSeasonId = teamSeasonIdByKey.get(`${teamId}__${seasonId}`);
      if (!teamSeasonId) {
        missingTeamSeasons.add(`${teamName} / ${season}`);
        continue;
      }

      const relationshipKey = `${teamSeasonId}__${venueKey}`;
      relationshipCounts.set(relationshipKey, (relationshipCounts.get(relationshipKey) ?? 0) + 1);
    }
  }

  if (missingTeamSeasons.size > 0) {
    throw new Error(`Missing team-season rows:\n${[...missingTeamSeasons].sort().join("\n")}`);
  }

  const venueRows = [...aggregates.values()].map((venue) => {
    const profile = PITCH_PROFILES[venue.name as keyof typeof PITCH_PROFILES] ?? DEFAULT_PROFILE;
    return {
      name: venue.name,
      city: venue.city,
      country: "India",
      ...profile,
    };
  });

  console.log(`Unique venue/city combinations: ${venueRows.length}`);
  console.log(`Team-season/venue relationships: ${relationshipCounts.size}`);

  const CHUNK_SIZE = 500;
  for (let i = 0; i < venueRows.length; i += CHUNK_SIZE) {
    const chunk = venueRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("ipl_venues").upsert(chunk, { onConflict: "name,city" });
    if (error) throw error;
  }

  const { data: dbVenues, error: venueFetchError } = await supabase
    .from("ipl_venues")
    .select("id, name, city");
  if (venueFetchError) throw venueFetchError;

  const venueIdByKey = new Map(
    ((dbVenues ?? []) as DbVenue[]).map((venue) => [
      `${normalize(venue.name)}__${normalize(venue.city ?? "")}`,
      venue.id,
    ]),
  );

  const relationshipRows: Array<{ team_season_id: string; venue_id: string; match_count: number }> = [];

  for (const [relationshipKey, matchCount] of relationshipCounts) {
    const separatorIndex = relationshipKey.indexOf("__");
    const teamSeasonId = relationshipKey.slice(0, separatorIndex);
    const venueKey = relationshipKey.slice(separatorIndex + 2);
    const venueId = venueIdByKey.get(venueKey);
    if (!venueId) throw new Error(`Venue not found after upsert: ${venueKey}`);
    relationshipRows.push({ team_season_id: teamSeasonId, venue_id: venueId, match_count: matchCount });
  }

  for (let i = 0; i < relationshipRows.length; i += CHUNK_SIZE) {
    const chunk = relationshipRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from("ipl_team_season_venues")
      .upsert(chunk, { onConflict: "team_season_id,venue_id" });
    if (error) throw error;
    console.log(`Imported ${Math.min(i + CHUNK_SIZE, relationshipRows.length)}/${relationshipRows.length} relationships.`);
  }

  console.log("\nVenue import complete.");
  console.log(`Venues: ${venueRows.length}`);
  console.log(`Relationships: ${relationshipRows.length}`);
  console.log(`Malformed match files skipped: ${malformedFiles.length}`);
  if (malformedFiles.length) console.log(malformedFiles.slice(0, 20));
}

importVenues().catch((error) => {
  console.error("\nIPL VENUE IMPORT FAILED\n");
  console.error(error);
  process.exit(1);
});
