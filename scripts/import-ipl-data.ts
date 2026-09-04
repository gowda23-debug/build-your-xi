import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
});

/* =========================================
   ENVIRONMENT
========================================= */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL in .env.local"
  );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
}

/* =========================================
   SUPABASE ADMIN CLIENT

   IMPORTANT:
   This script runs only on your local machine.

   Never import this client into your
   Next.js application.
========================================= */

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/* =========================================
   FILE PATHS
========================================= */

const processedDir = path.join(
  process.cwd(),
  "scripts",
  "data",
  "processed"
);

function readJson<T>(fileName: string): T {
  const filePath = path.join(
    processedDir,
    fileName
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Processed file not found: ${filePath}`
    );
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  ) as T;
}

/* =========================================
   DATA TYPES
========================================= */

type Team = {
  name: string;
};

type Season = {
  season: string;
  // start_year: number;
};

type Player = {
  id: string;
  name: string;
};

type TeamSeason = {
  team_name: string;
  season: string;
};

type PlayerStats = {
  player_id: string;
  player_name: string;

  team_name: string;
  season: string;

  matches: number;

  batting_innings: number;
  runs: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  highest_score: number;
  dismissals: number;

  bowling_innings: number;
  balls_bowled: number;
  runs_conceded: number;
  wickets: number;
};

function getStartYear(season: string): number {
  const match = season.match(/^(\d{4})/);

  if (!match) {
    throw new Error(
      `Could not determine start year for season: ${season}`
    );
  }

  const startYear = Number(match[1]);

  if (
    Number.isNaN(startYear) ||
    startYear < 2000 ||
    startYear > 2100
  ) {
    throw new Error(
      `Invalid start year for season: ${season}`
    );
  }

  return startYear;
}
/* =========================================
   MAIN IMPORT
========================================= */

async function importData() {
  console.log("");
  console.log("================================");
  console.log("IPL DATA IMPORT");
  console.log("================================");
  console.log("");

  /* -----------------------------------------
     LOAD FILES
  ----------------------------------------- */

  const teams =
    readJson<Team[]>("teams.json");

  const seasons =
    readJson<Season[]>("seasons.json");

  const players =
    readJson<Player[]>("players.json");

  const teamSeasons =
    readJson<TeamSeason[]>(
      "team-seasons.json"
    );

  const playerStats =
    readJson<PlayerStats[]>(
      "team-season-player-stats.json"
    );

  console.log("Loaded processed data:");
  console.log(`Teams: ${teams.length}`);
  console.log(`Seasons: ${seasons.length}`);
  console.log(`Players: ${players.length}`);
  console.log(
    `Team seasons: ${teamSeasons.length}`
  );
  console.log(
    `Player statistics: ${playerStats.length}`
  );

  /* =========================================
     IMPORT TEAMS
  ========================================= */

  console.log("");
  console.log("Importing teams...");

  const { error: teamsError } =
    await supabase
      .from("ipl_teams")
      .upsert(
        teams.map((team) => ({
          name: team.name,
        })),
        {
          onConflict: "name",
        }
      );

  if (teamsError) {
    throw teamsError;
  }

  console.log("✓ Teams imported");

  /* =========================================
     IMPORT SEASONS
  ========================================= */

  console.log("Importing seasons...");

  const { error: seasonsError } =
    await supabase
      .from("ipl_seasons")
      .upsert(
        seasons.map((season) => ({
          season: season.season,
          start_year: getStartYear(
            season.season
          ),
        })),
        {
          onConflict: "season",
        }
      );

  if (seasonsError) {
    throw seasonsError;
  }

  console.log("✓ Seasons imported");

  /* =========================================
     IMPORT PLAYERS
  ========================================= */

  console.log("Importing players...");

  const { error: playersError } =
    await supabase
      .from("ipl_players")
      .upsert(
        players.map((player) => ({
          id: player.id,
          name: player.name,
        })),
        {
          onConflict: "id",
        }
      );

  if (playersError) {
    throw playersError;
  }

  console.log("✓ Players imported");

  /* =========================================
     FETCH DATABASE IDS
  ========================================= */

  console.log("");
  console.log(
    "Fetching database relationships..."
  );

  const {
    data: dbTeams,
    error: dbTeamsError,
  } = await supabase
    .from("ipl_teams")
    .select("id, name");

  if (dbTeamsError || !dbTeams) {
    throw (
      dbTeamsError ??
      new Error(
        "Could not fetch imported teams."
      )
    );
  }

  const {
    data: dbSeasons,
    error: dbSeasonsError,
  } = await supabase
    .from("ipl_seasons")
    .select("id, season");

  if (dbSeasonsError || !dbSeasons) {
    throw (
      dbSeasonsError ??
      new Error(
        "Could not fetch imported seasons."
      )
    );
  }

  /*
   * Maps:
   *
   * Team Name
   * → Database UUID
   */

  const teamIdMap =
    new Map<string, string>(
      dbTeams.map((team) => [
        team.name,
        team.id,
      ])
    );

  /*
   * Season Name
   * → Database UUID
   */

  const seasonIdMap =
    new Map<string, string>(
      dbSeasons.map((season) => [
        season.season,
        season.id,
      ])
    );

  /* =========================================
     PREPARE TEAM-SEASONS
  ========================================= */

  console.log("");
  console.log(
    "Preparing team-season relationships..."
  );

  const mappedTeamSeasons =
    teamSeasons.map((record) => {
      const teamId =
        teamIdMap.get(
          record.team_name
        );

      const seasonId =
        seasonIdMap.get(
          record.season
        );

      if (!teamId) {
        throw new Error(
          `Team not found: ${record.team_name}`
        );
      }

      if (!seasonId) {
        throw new Error(
          `Season not found: ${record.season}`
        );
      }

      return {
        team_id: teamId,
        season_id: seasonId,
      };
    });

  /* =========================================
     IMPORT TEAM-SEASONS
  ========================================= */

  console.log(
    "Importing team-season relationships..."
  );

  const {
    error: teamSeasonsError,
  } = await supabase
    .from("ipl_team_seasons")
    .upsert(
      mappedTeamSeasons,
      {
        onConflict:
          "team_id,season_id",
      }
    );

  if (teamSeasonsError) {
    throw teamSeasonsError;
  }

  console.log(
    "✓ Team-season relationships imported"
  );

  /* =========================================
     FETCH TEAM-SEASON UUIDS
  ========================================= */

  console.log("");
  console.log(
    "Fetching team-season records..."
  );

  const {
    data: dbTeamSeasons,
    error: dbTeamSeasonsError,
  } = await supabase
    .from("ipl_team_seasons")
    .select(
      "id, team_id, season_id"
    );

  if (
    dbTeamSeasonsError ||
    !dbTeamSeasons
  ) {
    throw (
      dbTeamSeasonsError ??
      new Error(
        "Could not fetch team-season records."
      )
    );
  }

  /*
   * Build:
   *
   * team UUID + season UUID
   *
   * →
   *
   * team-season UUID
   */

  const teamSeasonIdMap =
    new Map<string, string>();

  dbTeamSeasons.forEach(
    (record) => {
      const key =
        `${record.team_id}__${record.season_id}`;

      teamSeasonIdMap.set(
        key,
        record.id
      );
    }
  );

  /* =========================================
     PREPARE PLAYER STATISTICS
  ========================================= */

  console.log("");
  console.log(
    "Preparing player statistics..."
  );

  const mappedPlayerStats =
    playerStats.map((stat) => {
      const teamId =
        teamIdMap.get(
          stat.team_name
        );

      const seasonId =
        seasonIdMap.get(
          stat.season
        );

      if (!teamId) {
        throw new Error(
          `Team not found for player stats: ${stat.team_name}`
        );
      }

      if (!seasonId) {
        throw new Error(
          `Season not found for player stats: ${stat.season}`
        );
      }

      const teamSeasonKey =
        `${teamId}__${seasonId}`;

      const teamSeasonId =
        teamSeasonIdMap.get(
          teamSeasonKey
        );

      if (!teamSeasonId) {
        throw new Error(
          `Team-season relationship not found: ${stat.team_name} / ${stat.season}`
        );
      }

      return {
        team_season_id:
          teamSeasonId,

        player_id:
          stat.player_id,

        matches:
          stat.matches,

        batting_innings:
          stat.batting_innings,

        runs:
          stat.runs,

        balls_faced:
          stat.balls_faced,

        fours:
          stat.fours,

        sixes:
          stat.sixes,

        highest_score:
          stat.highest_score,

        dismissals:
          stat.dismissals,

        bowling_innings:
          stat.bowling_innings,

        balls_bowled:
          stat.balls_bowled,

        runs_conceded:
          stat.runs_conceded,

        wickets:
          stat.wickets,
      };
    });

  console.log(
    `Prepared ${mappedPlayerStats.length} player statistic records`
  );

  /* =========================================
     IMPORT PLAYER STATISTICS
  ========================================= */

  console.log("");
  console.log(
    "Importing player statistics..."
  );

  const CHUNK_SIZE = 500;

  for (
    let index = 0;
    index < mappedPlayerStats.length;
    index += CHUNK_SIZE
  ) {
    const chunk =
      mappedPlayerStats.slice(
        index,
        index + CHUNK_SIZE
      );

    const {
      error: statsError,
    } = await supabase
      .from(
        "ipl_team_season_player_stats"
      )
      .upsert(
        chunk,
        {
          onConflict:
            "team_season_id,player_id",
        }
      );

    if (statsError) {
      throw statsError;
    }

    const imported =
      Math.min(
        index + CHUNK_SIZE,
        mappedPlayerStats.length
      );

    console.log(
      `✓ Imported ${imported}/${mappedPlayerStats.length}`
    );
  }

  /* =========================================
     COMPLETE
  ========================================= */

  console.log("");
  console.log("================================");
  console.log(
    "IPL DATA IMPORT COMPLETE"
  );
  console.log("================================");
  console.log("");

  console.log(
    `Teams: ${teams.length}`
  );

  console.log(
    `Seasons: ${seasons.length}`
  );

  console.log(
    `Players: ${players.length}`
  );

  console.log(
    `Team seasons: ${teamSeasons.length}`
  );

  console.log(
    `Player statistics: ${playerStats.length}`
  );
}

/* =========================================
   RUN IMPORT
========================================= */

importData().catch((error) => {
  console.error("");
  console.error("================================");
  console.error("IPL DATA IMPORT FAILED");
  console.error("================================");
  console.error("");

  console.error(error);

  process.exit(1);
});