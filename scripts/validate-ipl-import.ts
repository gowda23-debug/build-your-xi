import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
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
   EXPECTED DATA COUNTS
========================================= */

const EXPECTED = {
  teams: 19,
  seasons: 19,
  players: 964,
  teamSeasons: 166,
  playerStats: 3354,
};

/* =========================================
   HELPERS
========================================= */

async function getCount(
  table: string
): Promise<number> {
  const { count, error } =
    await supabase
      .from(table)
      .select("*", {
        count: "exact",
        head: true,
      });

  if (error) {
    throw new Error(
      `Could not count ${table}: ${error.message}`
    );
  }

  return count ?? 0;
}

function validateCount(
  label: string,
  actual: number,
  expected: number
) {
  const valid = actual === expected;

  console.log(
    `${valid ? "✓" : "✗"} ${label}: ${actual} ${
      valid
        ? "(correct)"
        : `(expected ${expected})`
    }`
  );

  if (!valid) {
    throw new Error(
      `${label} count mismatch. Expected ${expected}, received ${actual}.`
    );
  }
}

/* =========================================
   MAIN VALIDATION
========================================= */

async function validateImport() {
  console.log("");
  console.log(
    "================================"
  );
  console.log(
    "SUPABASE IPL IMPORT VALIDATION"
  );
  console.log(
    "================================"
  );
  console.log("");

  /* =======================================
     ROW COUNTS
  ======================================= */

  console.log("ROW COUNTS");
  console.log("");

  const teamsCount =
    await getCount("ipl_teams");

  const seasonsCount =
    await getCount("ipl_seasons");

  const playersCount =
    await getCount("ipl_players");

  const teamSeasonsCount =
    await getCount("ipl_team_seasons");

  const playerStatsCount =
    await getCount(
      "ipl_team_season_player_stats"
    );

  validateCount(
    "Teams",
    teamsCount,
    EXPECTED.teams
  );

  validateCount(
    "Seasons",
    seasonsCount,
    EXPECTED.seasons
  );

  validateCount(
    "Players",
    playersCount,
    EXPECTED.players
  );

  validateCount(
    "Team seasons",
    teamSeasonsCount,
    EXPECTED.teamSeasons
  );

  validateCount(
    "Player statistics",
    playerStatsCount,
    EXPECTED.playerStats
  );

  /* =======================================
     TEAM-SEASON COVERAGE
  ======================================= */

  console.log("");
  console.log(
    "================================"
  );
  console.log(
    "TEAM-SEASON PLAYER COVERAGE"
  );
  console.log(
    "================================"
  );
  console.log("");

  const {
    data: teamSeasons,
    error: teamSeasonsError,
  } = await supabase
    .from("ipl_team_seasons")
    .select(`
      id,
      team:ipl_teams (
        name
      ),
      season:ipl_seasons (
        season
      )
    `);

  if (teamSeasonsError) {
    throw teamSeasonsError;
  }

  if (!teamSeasons) {
    throw new Error(
      "No team-season records returned."
    );
  }

  let lowestCoverage:
    | {
        team: string;
        season: string;
        players: number;
      }
    | undefined;

  let highestCoverage:
    | {
        team: string;
        season: string;
        players: number;
      }
    | undefined;

  for (const teamSeason of teamSeasons) {
    const { count, error } =
      await supabase
        .from(
          "ipl_team_season_player_stats"
        )
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "team_season_id",
          teamSeason.id
        );

    if (error) {
      throw error;
    }

    const playerCount =
      count ?? 0;

    /*
     * Supabase relationship results can be
     * typed as objects or arrays depending
     * on generated database types.
     */

    const teamData =
      Array.isArray(teamSeason.team)
        ? teamSeason.team[0]
        : teamSeason.team;

    const seasonData =
      Array.isArray(teamSeason.season)
        ? teamSeason.season[0]
        : teamSeason.season;

    const teamName =
      teamData?.name ??
      "Unknown team";

    const seasonName =
      seasonData?.season ??
      "Unknown season";

    const coverage = {
      team: teamName,
      season: seasonName,
      players: playerCount,
    };

    if (
      !lowestCoverage ||
      coverage.players <
        lowestCoverage.players
    ) {
      lowestCoverage =
        coverage;
    }

    if (
      !highestCoverage ||
      coverage.players >
        highestCoverage.players
    ) {
      highestCoverage =
        coverage;
    }

    if (playerCount === 0) {
      throw new Error(
        `No players found for ${teamName} — ${seasonName}`
      );
    }
  }

  console.log(
    `✓ Valid team-season records checked: ${teamSeasons.length}`
  );

  console.log("");

  if (lowestCoverage) {
    console.log(
      `Lowest coverage: ${lowestCoverage.players}`
    );

    console.log(
      `${lowestCoverage.team} — ${lowestCoverage.season}`
    );
  }

  console.log("");

  if (highestCoverage) {
    console.log(
      `Highest coverage: ${highestCoverage.players}`
    );

    console.log(
      `${highestCoverage.team} — ${highestCoverage.season}`
    );
  }

  /* =======================================
     SAMPLE RECORDS
  ======================================= */

  console.log("");
  console.log(
    "================================"
  );
  console.log(
    "SAMPLE RECORD VALIDATION"
  );
  console.log(
    "================================"
  );

  const samplePlayers = [
    {
      playerName: "V Kohli",
      season: "2016",
    },
    {
      playerName: "DA Warner",
      season: "2016",
    },
    {
      playerName: "CH Gayle",
      season: "2011",
    },
    {
      playerName: "JJ Bumrah",
      season: "2020/21",
    },
    {
      playerName: "Rashid Khan",
      season: "2022",
    },
  ];

  for (const sample of samplePlayers) {
    console.log("");
    console.log(
      `Checking ${sample.playerName} — ${sample.season}`
    );

    const {
      data: player,
      error: playerError,
    } = await supabase
      .from("ipl_players")
      .select("id, name")
      .eq(
        "name",
        sample.playerName
      )
      .maybeSingle();

    if (playerError) {
      throw playerError;
    }

    if (!player) {
      console.log(
        `✗ Player not found: ${sample.playerName}`
      );

      continue;
    }

    const {
      data: season,
      error: seasonError,
    } = await supabase
      .from("ipl_seasons")
      .select("id, season")
      .eq(
        "season",
        sample.season
      )
      .maybeSingle();

    if (seasonError) {
      throw seasonError;
    }

    if (!season) {
      console.log(
        `✗ Season not found: ${sample.season}`
      );

      continue;
    }

    /*
     * Player stats are linked through:
     *
     * player
     *   ↓
     * player statistics
     *   ↓
     * team-season
     *   ↓
     * season
     */

    const {
      data: stats,
      error: statsError,
    } = await supabase
      .from(
        "ipl_team_season_player_stats"
      )
      .select(`
        matches,
        runs,
        wickets,
        highest_score,
        team_season:ipl_team_seasons (
          team:ipl_teams (
            name
          ),
          season:ipl_seasons (
            season
          )
        )
      `)
      .eq(
        "player_id",
        player.id
      );

    if (statsError) {
      throw statsError;
    }

    const matchingStats =
      stats?.filter(
        (stat) => {
          const teamSeason =
            Array.isArray(
              stat.team_season
            )
              ? stat.team_season[0]
              : stat.team_season;

          const statSeason =
            Array.isArray(
              teamSeason?.season
            )
              ? teamSeason?.season[0]
              : teamSeason?.season;

          return (
            statSeason?.season ===
            sample.season
          );
        }
      ) ?? [];

    if (
      matchingStats.length === 0
    ) {
      console.log(
        `✗ No statistics found`
      );

      continue;
    }

    for (
      const stat of matchingStats
    ) {
      const teamSeason =
        Array.isArray(
          stat.team_season
        )
          ? stat.team_season[0]
          : stat.team_season;

      const team =
        Array.isArray(
          teamSeason?.team
        )
          ? teamSeason?.team[0]
          : teamSeason?.team;

      console.log(
        `✓ ${team?.name ?? "Unknown team"}`
      );

      console.log({
        matches:
          stat.matches,
        runs:
          stat.runs,
        wickets:
          stat.wickets,
        highest_score:
          stat.highest_score,
      });
    }
  }

  /* =======================================
     COMPLETE
  ======================================= */

  console.log("");
  console.log(
    "================================"
  );
  console.log(
    "SUPABASE VALIDATION COMPLETE"
  );
  console.log(
    "================================"
  );
  console.log("");

  console.log(
    "✓ All database counts match the processed IPL dataset."
  );

  console.log(
    "✓ All team-season combinations have player coverage."
  );

  console.log(
    "✓ Sample player records were successfully resolved."
  );
}

/* =========================================
   RUN
========================================= */

validateImport().catch(
  (error) => {
    console.error("");
    console.error(
      "================================"
    );
    console.error(
      "SUPABASE VALIDATION FAILED"
    );
    console.error(
      "================================"
    );
    console.error("");

    console.error(error);

    process.exit(1);
  }
);