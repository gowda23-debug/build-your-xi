import { readFile } from "node:fs/promises";
import path from "node:path";

/* =========================================
   PATHS
========================================= */

const PROCESSED_DATA_DIR = path.join(
  process.cwd(),
  "scripts",
  "data",
  "processed"
);

/* =========================================
   TYPES
========================================= */

type Team = {
  name: string;
};

type Season = {
  season: string;
};

type TeamSeason = {
  team_name: string;
  season: string;
};

type Player = {
  id: string;
  name: string;
};

type PlayerSeasonStats = {
  player_id: string;
  player_name: string;
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

type TeamSeasonPlayerStats = {
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

/* =========================================
   HELPERS
========================================= */

function getSeasonStartYear(
  season: string
) {
  const match = season.match(/\d{4}/);

  if (!match) {
    return 0;
  }

  return Number(match[0]);
}

async function readJson<T>(
  fileName: string
): Promise<T> {
  const filePath = path.join(
    PROCESSED_DATA_DIR,
    fileName
  );

  const content = await readFile(
    filePath,
    "utf8"
  );

  return JSON.parse(content);
}

function printDivider() {
  console.log(
    "\n=============================="
  );
}

/* =========================================
   MAIN VALIDATION
========================================= */

async function validateIPLData() {
  printDivider();

  console.log(
    "IPL DATA VALIDATION"
  );

  printDivider();

  /* =======================================
     LOAD DATA
  ======================================= */

  const teams =
    await readJson<Team[]>(
      "teams.json"
    );

  const seasons =
    await readJson<Season[]>(
      "seasons.json"
    );

  const teamSeasons =
    await readJson<TeamSeason[]>(
      "team-seasons.json"
    );

  const players =
    await readJson<Player[]>(
      "players.json"
    );

  const playerSeasonStats =
    await readJson<
      PlayerSeasonStats[]
    >(
      "player-season-stats.json"
    );

  const teamSeasonPlayerStats =
    await readJson<
      TeamSeasonPlayerStats[]
    >(
      "team-season-player-stats.json"
    );

  /* =======================================
     BASIC COUNTS
  ======================================= */

  console.log(
    `Teams: ${teams.length}`
  );

  console.log(
    `Seasons: ${seasons.length}`
  );

  console.log(
    `Team seasons: ${teamSeasons.length}`
  );

  console.log(
    `Players: ${players.length}`
  );

  console.log(
    `Player-season records: ${playerSeasonStats.length}`
  );

  console.log(
    `Team-season-player records: ${teamSeasonPlayerStats.length}`
  );

  /* =======================================
     SEASON ORDER VALIDATION
  ======================================= */

  const seasonNames =
    seasons.map(
      (item) =>
        item.season
    );

  const sortedSeasonNames =
    [...seasonNames].sort(
      (a, b) =>
        getSeasonStartYear(a) -
        getSeasonStartYear(b)
    );

  const seasonsAreSorted =
    JSON.stringify(
      seasonNames
    ) ===
    JSON.stringify(
      sortedSeasonNames
    );

  printDivider();

  console.log(
    "SEASON RANGE"
  );

  printDivider();

  console.log(
    `First season: ${seasonNames[0]}`
  );

  console.log(
    `Last season: ${
      seasonNames[
        seasonNames.length - 1
      ]
    }`
  );

  console.log(
    `Season order valid: ${
      seasonsAreSorted
        ? "YES"
        : "NO"
    }`
  );

  if (!seasonsAreSorted) {
    throw new Error(
      "Season data is not sorted correctly."
    );
  }

  /* =======================================
     TEAM-SEASON VALIDATION
  ======================================= */

  const teamNames =
    new Set(
      teams.map(
        (team) =>
          team.name
      )
    );

  const seasonSet =
    new Set(
      seasonNames
    );

  let invalidTeamSeasonRecords =
    0;

  for (
    const record
    of teamSeasons
  ) {
    if (
      !teamNames.has(
        record.team_name
      )
    ) {
      invalidTeamSeasonRecords +=
        1;

      console.error(
        "Unknown team in team-seasons:",
        record
      );
    }

    if (
      !seasonSet.has(
        record.season
      )
    ) {
      invalidTeamSeasonRecords +=
        1;

      console.error(
        "Unknown season in team-seasons:",
        record
      );
    }
  }

  console.log(
    `Invalid team-season records: ${invalidTeamSeasonRecords}`
  );

  if (
    invalidTeamSeasonRecords >
    0
  ) {
    throw new Error(
      "Invalid team-season records found."
    );
  }

  /* =======================================
     PLAYER VALIDATION
  ======================================= */

  const playerIds =
    new Set(
      players.map(
        (player) =>
          player.id
      )
    );

  let invalidPlayerSeasonRecords =
    0;

  for (
    const record
    of playerSeasonStats
  ) {
    if (
      !playerIds.has(
        record.player_id
      )
    ) {
      invalidPlayerSeasonRecords +=
        1;

      console.error(
        "Unknown player in player-season stats:",
        record
      );
    }

    if (
      !seasonSet.has(
        record.season
      )
    ) {
      invalidPlayerSeasonRecords +=
        1;

      console.error(
        "Unknown season in player-season stats:",
        record
      );
    }
  }

  console.log(
    `Invalid player-season records: ${invalidPlayerSeasonRecords}`
  );

  if (
    invalidPlayerSeasonRecords >
    0
  ) {
    throw new Error(
      "Invalid player-season records found."
    );
  }

  /* =======================================
     TEAM-SEASON-PLAYER VALIDATION
  ======================================= */

  printDivider();

  console.log(
    "TEAM-SEASON-PLAYER VALIDATION"
  );

  printDivider();

  const validTeamSeasonKeys =
    new Set(
      teamSeasons.map(
        (record) =>
          `${record.team_name}__${record.season}`
      )
    );

  let invalidTeamSeasonPlayerRecords =
    0;

  let invalidStatRecords =
    0;

  const duplicateKeys =
    new Set<string>();

  const seenKeys =
    new Set<string>();

  for (
    const record
    of teamSeasonPlayerStats
  ) {
    /* =====================================
       PLAYER EXISTS
    ===================================== */

    if (
      !playerIds.has(
        record.player_id
      )
    ) {
      invalidTeamSeasonPlayerRecords +=
        1;

      console.error(
        "Unknown player:",
        record
      );
    }

    /* =====================================
       TEAM EXISTS
    ===================================== */

    if (
      !teamNames.has(
        record.team_name
      )
    ) {
      invalidTeamSeasonPlayerRecords +=
        1;

      console.error(
        "Unknown team:",
        record
      );
    }

    /* =====================================
       SEASON EXISTS
    ===================================== */

    if (
      !seasonSet.has(
        record.season
      )
    ) {
      invalidTeamSeasonPlayerRecords +=
        1;

      console.error(
        "Unknown season:",
        record
      );
    }

    /* =====================================
       TEAM + SEASON EXISTS
    ===================================== */

    const teamSeasonKey =
      `${record.team_name}__${record.season}`;

    if (
      !validTeamSeasonKeys.has(
        teamSeasonKey
      )
    ) {
      invalidTeamSeasonPlayerRecords +=
        1;

      console.error(
        "Invalid team-season combination:",
        record
      );
    }

    /* =====================================
       DUPLICATE RECORD CHECK
    ===================================== */

    const uniqueKey =
      `${record.player_id}__${record.team_name}__${record.season}`;

    if (
      seenKeys.has(
        uniqueKey
      )
    ) {
      duplicateKeys.add(
        uniqueKey
      );
    }

    seenKeys.add(
      uniqueKey
    );

    /* =====================================
       STAT VALIDATION
    ===================================== */

    const statValues = [
      record.matches,

      record.batting_innings,
      record.runs,
      record.balls_faced,
      record.fours,
      record.sixes,
      record.highest_score,
      record.dismissals,

      record.bowling_innings,
      record.balls_bowled,
      record.runs_conceded,
      record.wickets,
    ];

    const hasInvalidStat =
      statValues.some(
        (value) =>
          typeof value !==
            "number" ||
          value < 0 ||
          !Number.isFinite(
            value
          )
      );

    if (
      hasInvalidStat
    ) {
      invalidStatRecords +=
        1;

      console.error(
        "Invalid statistics:",
        record
      );
    }

    /* =====================================
       LOGICAL STAT CHECKS
    ===================================== */

    if (
      record.batting_innings >
      record.matches
    ) {
      invalidStatRecords +=
        1;

      console.error(
        "Batting innings exceed matches:",
        record
      );
    }

    if (
      record.bowling_innings >
      record.matches
    ) {
      invalidStatRecords +=
        1;

      console.error(
        "Bowling innings exceed matches:",
        record
      );
    }

    if (
      record.fours * 4 >
      record.runs
    ) {
      invalidStatRecords +=
        1;

      console.error(
        "Invalid four count:",
        record
      );
    }

    if (
      record.sixes * 6 >
      record.runs
    ) {
      invalidStatRecords +=
        1;

      console.error(
        "Invalid six count:",
        record
      );
    }
  }

  /* =======================================
     DUPLICATE RESULTS
  ======================================= */

  console.log(
    `Duplicate team-season-player records: ${duplicateKeys.size}`
  );

  if (
    duplicateKeys.size >
    0
  ) {
    console.error(
      "Duplicate keys:"
    );

    console.error(
      [...duplicateKeys]
    );

    throw new Error(
      "Duplicate team-season-player records found."
    );
  }

  /* =======================================
     VALIDATION RESULTS
  ======================================= */

  console.log(
    `Invalid team-season-player records: ${invalidTeamSeasonPlayerRecords}`
  );

  console.log(
    `Invalid statistical records: ${invalidStatRecords}`
  );

  if (
    invalidTeamSeasonPlayerRecords >
    0
  ) {
    throw new Error(
      "Invalid team-season-player records found."
    );
  }

  if (
    invalidStatRecords >
    0
  ) {
    throw new Error(
      "Invalid statistical records found."
    );
  }

  /* =======================================
     TEAM-SEASON PLAYER COUNTS
  ======================================= */

  printDivider();

  console.log(
    "TEAM-SEASON PLAYER COVERAGE"
  );

  printDivider();

  const playersPerTeamSeason =
    new Map<
      string,
      number
    >();

  for (
    const record
    of teamSeasonPlayerStats
  ) {
    const key =
      `${record.team_name}__${record.season}`;

    playersPerTeamSeason.set(
      key,
      (
        playersPerTeamSeason.get(
          key
        ) ?? 0
      ) + 1
    );
  }

  let minimumPlayers =
    Number.POSITIVE_INFINITY;

  let maximumPlayers = 0;

  let minimumPlayerTeamSeason =
    "";

  let maximumPlayerTeamSeason =
    "";

  for (
    const [
      key,
      count,
    ]
    of playersPerTeamSeason
  ) {
    if (
      count <
      minimumPlayers
    ) {
      minimumPlayers =
        count;

      minimumPlayerTeamSeason =
        key;
    }

    if (
      count >
      maximumPlayers
    ) {
      maximumPlayers =
        count;

      maximumPlayerTeamSeason =
        key;
    }
  }

  console.log(
    `Lowest player coverage: ${minimumPlayers}`
  );

  console.log(
    `Team-season: ${minimumPlayerTeamSeason}`
  );

  console.log();

  console.log(
    `Highest player coverage: ${maximumPlayers}`
  );

  console.log(
    `Team-season: ${maximumPlayerTeamSeason}`
  );

  /* =======================================
     SAMPLE DATA
  ======================================= */

  printDivider();

  console.log(
    "SAMPLE TEAM-SEASON PLAYERS"
  );

  printDivider();

  /*
   * Pick a few records from
   * different areas of the dataset.
   */

  const samples =
    teamSeasonPlayerStats.filter(
      (_, index) =>
        index === 0 ||
        index ===
          Math.floor(
            teamSeasonPlayerStats.length /
              4
          ) ||
        index ===
          Math.floor(
            teamSeasonPlayerStats.length /
              2
          ) ||
        index ===
          Math.floor(
            (teamSeasonPlayerStats.length *
              3) /
              4
          ) ||
        index ===
          teamSeasonPlayerStats.length -
            1
    );

  for (
    const record
    of samples
  ) {
    console.log(
      "\n------------------------------"
    );

    console.log(
      `${record.player_name} — ${record.team_name} — ${record.season}`
    );

    console.log({
      matches:
        record.matches,

      batting_innings:
        record.batting_innings,

      runs:
        record.runs,

      balls_faced:
        record.balls_faced,

      fours:
        record.fours,

      sixes:
        record.sixes,

      highest_score:
        record.highest_score,

      dismissals:
        record.dismissals,

      bowling_innings:
        record.bowling_innings,

      balls_bowled:
        record.balls_bowled,

      runs_conceded:
        record.runs_conceded,

      wickets:
        record.wickets,
    });
  }

  /* =======================================
     FINAL RESULT
  ======================================= */

  printDivider();

  console.log(
    "VALIDATION COMPLETE"
  );

  printDivider();

  console.log(
    "All dataset integrity checks passed."
  );

  console.log(
    `Validated ${teamSeasonPlayerStats.length} team-season-player records.`
  );
}

/* =========================================
   RUN
========================================= */

validateIPLData().catch(
  (error) => {
    console.error(
      "\nVALIDATION FAILED"
    );

    console.error(
      error
    );

    process.exit(1);
  }
);