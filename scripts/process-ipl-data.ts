import AdmZip from "adm-zip";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/* =========================================
   PATHS
========================================= */

const RAW_DATA_DIR = path.join(
  process.cwd(),
  "scripts",
  "data",
  "raw"
);

const PROCESSED_DATA_DIR = path.join(
  process.cwd(),
  "scripts",
  "data",
  "processed"
);

const ZIP_FILE = path.join(
  RAW_DATA_DIR,
  "ipl_json.zip"
);

const EXTRACTED_DIR = path.join(
  RAW_DATA_DIR,
  "ipl_json"
);

/* =========================================
   TYPES
========================================= */

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

type PlayerRecord = {
  id: string;
  name: string;
};

type TeamSeasonRecord = {
  team_name: string;
  season: string;
};

type MatchPlayerStats = {
  player_id: string;
  player_name: string;

  runs: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  dismissals: number;

  balls_bowled: number;
  runs_conceded: number;
  wickets: number;
};

/* =========================================
   HELPERS
========================================= */

/*
 * Handles season values such as:
 *
 * 2008
 * 2016
 * 2020/21
 * 2022
 */
function getSeasonStartYear(
  season: string
) {
  const match =
    season.match(/\d{4}/);

  if (!match) {
    return 0;
  }

  return Number(match[0]);
}

function getPlayerSeasonKey(
  playerId: string,
  season: string
) {
  return `${playerId}__${season}`;
}

function getPlayerTeamSeasonKey(
  playerId: string,
  teamName: string,
  season: string
) {
  return `${playerId}__${teamName}__${season}`;
}

function getMatchPlayerKey(
  playerId: string
) {
  return playerId;
}

/*
 * Dismissals that do NOT count
 * against the batter.
 */
const NON_DISMISSAL_KINDS = [
  "retired hurt",
];

/*
 * Wicket types that do NOT count
 * as wickets for the bowler.
 */
const NON_BOWLER_WICKET_KINDS = [
  "run out",
  "retired hurt",
  "obstructing the field",
];

/* =========================================
   MAIN PROCESSOR
========================================= */

async function processIPLData() {
  console.log(
    "Starting IPL data processing..."
  );

  /* =======================================
     CHECK ZIP FILE
  ======================================= */

  if (!existsSync(ZIP_FILE)) {
    throw new Error(
      `IPL ZIP file not found.\nExpected: ${ZIP_FILE}`
    );
  }

  /* =======================================
     ENSURE DIRECTORIES EXIST
  ======================================= */

  await mkdir(
    EXTRACTED_DIR,
    {
      recursive: true,
    }
  );

  await mkdir(
    PROCESSED_DATA_DIR,
    {
      recursive: true,
    }
  );

  /* =======================================
     EXTRACT ARCHIVE
  ======================================= */

  console.log(
    "Extracting IPL JSON archive..."
  );

  const zip =
    new AdmZip(
      ZIP_FILE
    );

  zip.extractAllTo(
    EXTRACTED_DIR,
    true
  );

  console.log(
    "Extraction completed."
  );

  /* =======================================
     FIND MATCH FILES
  ======================================= */

  const files =
    await readdir(
      EXTRACTED_DIR
    );

  const jsonFiles =
    files.filter(
      (file) =>
        file.endsWith(
          ".json"
        )
    );

  console.log(
    `Found ${jsonFiles.length} match files.`
  );

  /* =======================================
     DATA COLLECTIONS
  ======================================= */

  const teams =
    new Set<string>();

  const seasons =
    new Set<string>();

  const teamSeasons =
    new Map<
      string,
      TeamSeasonRecord
    >();

  const players =
    new Map<
      string,
      PlayerRecord
    >();

  /*
   * Overall IPL statistics
   * for a player in a season.
   */
  const playerSeasonStats =
    new Map<
      string,
      PlayerSeasonStats
    >();

  /*
   * Statistics for a player
   * representing a specific
   * team in a specific season.
   *
   * This is the main dataset
   * required by the game.
   */
  const teamSeasonPlayerStats =
    new Map<
      string,
      TeamSeasonPlayerStats
    >();

  /* =======================================
     PROCESS MATCHES
  ======================================= */

  let processedMatches = 0;

  for (
    const file
    of jsonFiles
  ) {
    const filePath =
      path.join(
        EXTRACTED_DIR,
        file
      );

    const content =
      await readFile(
        filePath,
        "utf8"
      );

    const match =
      JSON.parse(
        content
      );

    const season =
      String(
        match.info?.season ??
          ""
      );

    /*
     * Skip files without
     * season information.
     */
    if (!season) {
      continue;
    }

    seasons.add(
      season
    );

    /* =====================================
       TEAMS + TEAM SEASONS
    ===================================== */

    const matchTeams =
      match.info?.teams ??
      [];

    for (
      const teamName
      of matchTeams
    ) {
      teams.add(
        teamName
      );

      const teamSeasonKey =
        `${teamName}__${season}`;

      teamSeasons.set(
        teamSeasonKey,
        {
          team_name:
            teamName,
          season,
        }
      );
    }

    /* =====================================
       PLAYER REGISTRY
    ===================================== */

    const registryPeople =
      match.info?.registry
        ?.people ?? {};

    /*
     * Name → stable Cricsheet ID
     */
    const playerIdByName =
      new Map<
        string,
        string
      >();

    for (
      const [
        playerName,
        playerId,
      ]
      of Object.entries(
        registryPeople
      )
    ) {
      if (
        typeof playerId !==
        "string"
      ) {
        continue;
      }

      playerIdByName.set(
        playerName,
        playerId
      );

      players.set(
        playerId,
        {
          id: playerId,
          name: playerName,
        }
      );
    }

    /* =====================================
       MATCH PLAYER PARTICIPATION
       + PLAYER TEAM MAPPING
    ===================================== */

    const matchPlayerIds =
      new Set<string>();

    /*
     * Player ID → Team name
     *
     * Only valid for the
     * current match.
     */
    const playerTeamById =
      new Map<
        string,
        string
      >();

    const matchPlayers =
      match.info?.players ??
      {};

    for (
      const [
        teamName,
        teamPlayers,
      ]
      of Object.entries(
        matchPlayers
      )
    ) {
      if (
        !Array.isArray(
          teamPlayers
        )
      ) {
        continue;
      }

      for (
        const playerName
        of teamPlayers
      ) {
        const playerId =
          playerIdByName.get(
            playerName
          );

        if (!playerId) {
          continue;
        }

        matchPlayerIds.add(
          playerId
        );

        playerTeamById.set(
          playerId,
          teamName
        );
      }
    }

    /* =====================================
       TEMPORARY MATCH STATS
    ===================================== */

    const matchStats =
      new Map<
        string,
        MatchPlayerStats
      >();

    function getMatchPlayerStats(
      playerName: string
    ) {
      const playerId =
        playerIdByName.get(
          playerName
        );

      if (!playerId) {
        return null;
      }

      const key =
        getMatchPlayerKey(
          playerId
        );

      const existing =
        matchStats.get(
          key
        );

      if (existing) {
        return existing;
      }

      const playerStats:
        MatchPlayerStats = {
          player_id:
            playerId,

          player_name:
            playerName,

          runs: 0,
          balls_faced: 0,
          fours: 0,
          sixes: 0,
          dismissals: 0,

          balls_bowled: 0,
          runs_conceded: 0,
          wickets: 0,
        };

      matchStats.set(
        key,
        playerStats
      );

      return playerStats;
    }

    /* =====================================
       PROCESS INNINGS
    ===================================== */

    const innings =
      match.innings ??
      [];

    for (
      const inning
      of innings
    ) {
      const overs =
        inning.overs ??
        [];

      for (
        const over
        of overs
      ) {
        const deliveries =
          over.deliveries ??
          [];

        for (
          const delivery
          of deliveries
        ) {
          const batterName =
            delivery.batter;

          const bowlerName =
            delivery.bowler;

          const batterStats =
            getMatchPlayerStats(
              batterName
            );

          const bowlerStats =
            getMatchPlayerStats(
              bowlerName
            );

          const runs =
            delivery.runs ??
            {};

          const extras =
            delivery.extras ??
            {};

          const batterRuns =
            Number(
              runs.batter ??
                0
            );

          const totalRuns =
            Number(
              runs.total ??
                0
            );

          const isWide =
            extras.wides !==
            undefined;

          const isNoBall =
            extras.noballs !==
            undefined;

          /* ===============================
             BATTING
          =============================== */

          if (
            batterStats
          ) {
            batterStats.runs +=
              batterRuns;

            /*
             * Wide does not count
             * as a ball faced.
             *
             * A no-ball DOES count
             * as a ball faced if the
             * batter receives it.
             */
            if (
              !isWide
            ) {
              batterStats.balls_faced +=
                1;
            }

            if (
              batterRuns ===
              4
            ) {
              batterStats.fours +=
                1;
            }

            if (
              batterRuns ===
              6
            ) {
              batterStats.sixes +=
                1;
            }
          }

          /* ===============================
             BOWLING
          =============================== */

          if (
            bowlerStats
          ) {
            /*
             * Wides and no-balls
             * are not legal balls.
             */
            if (
              !isWide &&
              !isNoBall
            ) {
              bowlerStats.balls_bowled +=
                1;
            }

            /*
             * Byes and leg byes
             * are not charged
             * to the bowler.
             */
            const byes =
              Number(
                extras.byes ??
                  0
              );

            const legByes =
              Number(
                extras.legbyes ??
                  0
              );

            const bowlerRuns =
              totalRuns -
              byes -
              legByes;

            bowlerStats.runs_conceded +=
              bowlerRuns;
          }

          /* ===============================
             WICKETS + DISMISSALS
          =============================== */

          const wickets =
            delivery.wickets ??
            [];

          for (
            const wicket
            of wickets
          ) {
            const wicketKind =
              wicket.kind;

            const dismissedPlayerName =
              wicket.player_out;

            /*
             * BATTER DISMISSAL
             */

            if (
              dismissedPlayerName &&
              !NON_DISMISSAL_KINDS.includes(
                wicketKind
              )
            ) {
              const dismissedPlayerStats =
                getMatchPlayerStats(
                  dismissedPlayerName
                );

              if (
                dismissedPlayerStats
              ) {
                dismissedPlayerStats.dismissals +=
                  1;
              }
            }

            /*
             * BOWLER WICKET
             */

            if (
              bowlerStats &&
              !NON_BOWLER_WICKET_KINDS.includes(
                wicketKind
              )
            ) {
              bowlerStats.wickets +=
                1;
            }
          }
        }
      }
    }

    /* =====================================
       AGGREGATE MATCH INTO SEASON STATS
    ===================================== */

    for (
      const playerId
      of matchPlayerIds
    ) {
      const player =
        players.get(
          playerId
        );

      if (!player) {
        continue;
      }

      /*
       * Match-level player statistics.
       */
      const matchPlayerStat =
        matchStats.get(
          getMatchPlayerKey(
            playerId
          )
        );

      /* ===================================
         OVERALL PLAYER + SEASON
      =================================== */

      const playerSeasonKey =
        getPlayerSeasonKey(
          playerId,
          season
        );

      let seasonStats =
        playerSeasonStats.get(
          playerSeasonKey
        );

      if (
        !seasonStats
      ) {
        seasonStats = {
          player_id:
            playerId,

          player_name:
            player.name,

          season,

          matches: 0,

          batting_innings: 0,
          runs: 0,
          balls_faced: 0,
          fours: 0,
          sixes: 0,
          highest_score: 0,
          dismissals: 0,

          bowling_innings: 0,
          balls_bowled: 0,
          runs_conceded: 0,
          wickets: 0,
        };

        playerSeasonStats.set(
          playerSeasonKey,
          seasonStats
        );
      }

      /*
       * Player appeared
       * in the match.
       */
      seasonStats.matches +=
        1;

      if (
        matchPlayerStat
      ) {
        /*
         * Batting.
         */

        if (
          matchPlayerStat.balls_faced >
          0
        ) {
          seasonStats.batting_innings +=
            1;
        }

        seasonStats.runs +=
          matchPlayerStat.runs;

        seasonStats.balls_faced +=
          matchPlayerStat.balls_faced;

        seasonStats.fours +=
          matchPlayerStat.fours;

        seasonStats.sixes +=
          matchPlayerStat.sixes;

        seasonStats.highest_score =
          Math.max(
            seasonStats.highest_score,
            matchPlayerStat.runs
          );

        seasonStats.dismissals +=
          matchPlayerStat.dismissals;

        /*
         * Bowling.
         */

        if (
          matchPlayerStat.balls_bowled >
          0
        ) {
          seasonStats.bowling_innings +=
            1;
        }

        seasonStats.balls_bowled +=
          matchPlayerStat.balls_bowled;

        seasonStats.runs_conceded +=
          matchPlayerStat.runs_conceded;

        seasonStats.wickets +=
          matchPlayerStat.wickets;
      }

      /* ===================================
         TEAM + SEASON + PLAYER
      =================================== */

      const teamName =
        playerTeamById.get(
          playerId
        );

      if (
        !teamName
      ) {
        continue;
      }

      const playerTeamSeasonKey =
        getPlayerTeamSeasonKey(
          playerId,
          teamName,
          season
        );

      let teamSeasonStats =
        teamSeasonPlayerStats.get(
          playerTeamSeasonKey
        );

      if (
        !teamSeasonStats
      ) {
        teamSeasonStats = {
          player_id:
            playerId,

          player_name:
            player.name,

          team_name:
            teamName,

          season,

          matches: 0,

          batting_innings: 0,
          runs: 0,
          balls_faced: 0,
          fours: 0,
          sixes: 0,
          highest_score: 0,
          dismissals: 0,

          bowling_innings: 0,
          balls_bowled: 0,
          runs_conceded: 0,
          wickets: 0,
        };

        teamSeasonPlayerStats.set(
          playerTeamSeasonKey,
          teamSeasonStats
        );
      }

      /*
       * Player appeared
       * for this team.
       */
      teamSeasonStats.matches +=
        1;

      if (
        matchPlayerStat
      ) {
        /*
         * Batting.
         */

        if (
          matchPlayerStat.balls_faced >
          0
        ) {
          teamSeasonStats.batting_innings +=
            1;
        }

        teamSeasonStats.runs +=
          matchPlayerStat.runs;

        teamSeasonStats.balls_faced +=
          matchPlayerStat.balls_faced;

        teamSeasonStats.fours +=
          matchPlayerStat.fours;

        teamSeasonStats.sixes +=
          matchPlayerStat.sixes;

        teamSeasonStats.highest_score =
          Math.max(
            teamSeasonStats.highest_score,
            matchPlayerStat.runs
          );

        teamSeasonStats.dismissals +=
          matchPlayerStat.dismissals;

        /*
         * Bowling.
         */

        if (
          matchPlayerStat.balls_bowled >
          0
        ) {
          teamSeasonStats.bowling_innings +=
            1;
        }

        teamSeasonStats.balls_bowled +=
          matchPlayerStat.balls_bowled;

        teamSeasonStats.runs_conceded +=
          matchPlayerStat.runs_conceded;

        teamSeasonStats.wickets +=
          matchPlayerStat.wickets;
      }
    }

    /* =====================================
       PROGRESS
    ===================================== */

    processedMatches +=
      1;

    if (
      processedMatches %
        100 ===
      0
    ) {
      console.log(
        `Processed ${processedMatches}/${jsonFiles.length} matches...`
      );
    }
  }

  /* =======================================
     SORT OUTPUT
  ======================================= */

  const sortedTeams =
    [...teams]
      .sort()
      .map(
        (name) => ({
          name,
        })
      );

  const sortedSeasons =
    [...seasons]
      .sort(
        (a, b) =>
          getSeasonStartYear(
            a
          ) -
          getSeasonStartYear(
            b
          )
      )
      .map(
        (season) => ({
          season,
        })
      );

  const sortedTeamSeasons =
    [...teamSeasons.values()]
      .sort(
        (a, b) => {
          const seasonDifference =
            getSeasonStartYear(
              a.season
            ) -
            getSeasonStartYear(
              b.season
            );

          if (
            seasonDifference !==
            0
          ) {
            return seasonDifference;
          }

          return a.team_name.localeCompare(
            b.team_name
          );
        }
      );

  const sortedPlayers =
    [...players.values()]
      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name
          )
      );

  const sortedPlayerSeasonStats =
    [...playerSeasonStats.values()]
      .sort(
        (a, b) => {
          const seasonDifference =
            getSeasonStartYear(
              a.season
            ) -
            getSeasonStartYear(
              b.season
            );

          if (
            seasonDifference !==
            0
          ) {
            return seasonDifference;
          }

          return a.player_name.localeCompare(
            b.player_name
          );
        }
      );

  const sortedTeamSeasonPlayerStats =
    [
      ...teamSeasonPlayerStats.values(),
    ]
      .sort(
        (a, b) => {
          const seasonDifference =
            getSeasonStartYear(
              a.season
            ) -
            getSeasonStartYear(
              b.season
            );

          if (
            seasonDifference !==
            0
          ) {
            return seasonDifference;
          }

          const teamDifference =
            a.team_name.localeCompare(
              b.team_name
            );

          if (
            teamDifference !==
            0
          ) {
            return teamDifference;
          }

          return a.player_name.localeCompare(
            b.player_name
          );
        }
      );

  /* =======================================
     WRITE JSON
  ======================================= */

  async function writeJson(
    fileName: string,
    data: unknown
  ) {
    const outputPath =
      path.join(
        PROCESSED_DATA_DIR,
        fileName
      );

    await writeFile(
      outputPath,
      JSON.stringify(
        data,
        null,
        2
      ),
      "utf8"
    );

    console.log(
      `Created ${fileName}`
    );
  }

  await writeJson(
    "teams.json",
    sortedTeams
  );

  await writeJson(
    "seasons.json",
    sortedSeasons
  );

  await writeJson(
    "team-seasons.json",
    sortedTeamSeasons
  );

  await writeJson(
    "players.json",
    sortedPlayers
  );

  /*
   * Overall player
   * statistics per season.
   */
  await writeJson(
    "player-season-stats.json",
    sortedPlayerSeasonStats
  );

  /*
   * Main game dataset:
   *
   * Team
   * + Season
   * + Player
   * + Statistics
   */
  await writeJson(
    "team-season-player-stats.json",
    sortedTeamSeasonPlayerStats
  );

  /* =======================================
     SUMMARY
  ======================================= */

  console.log(
    "\n=============================="
  );

  console.log(
    "PROCESSING COMPLETE"
  );

  console.log(
    "=============================="
  );

  console.log(
    `Matches processed: ${processedMatches}`
  );

  console.log(
    `Teams found: ${sortedTeams.length}`
  );

  console.log(
    `Seasons found: ${sortedSeasons.length}`
  );

  console.log(
    `Team seasons found: ${sortedTeamSeasons.length}`
  );

  console.log(
    `Players found: ${sortedPlayers.length}`
  );

  console.log(
    `Player-season records: ${sortedPlayerSeasonStats.length}`
  );

  console.log(
    `Team-season-player records: ${sortedTeamSeasonPlayerStats.length}`
  );
}

/* =========================================
   RUN
========================================= */

processIPLData().catch(
  (error) => {
    console.error(
      "\nProcessing failed:"
    );

    console.error(
      error
    );

    process.exit(1);
  }
);