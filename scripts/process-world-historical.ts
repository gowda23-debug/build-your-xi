import fs from "node:fs";
import path from "node:path";

import {
  WORLD_HISTORICAL_SOURCES,
} from "./data/world/historical-sources";

import {
  loadVerifiedWorldRoles,
  type RoleEntry,
} from "./world-role-resolver";

type BattingRecord = {
  sourcePlayerId: string;
  fullName: string;
  runs: number | null;
  balls: number | null;
  didNotBat: boolean;
  notOut: boolean;
  retired: boolean;
  dismissal: string;
  bowlerSourcePlayerId: string | null;
  catcherSourcePlayerId: string | null;
  stumperSourcePlayerId: string | null;
  wicketCreditedToBowler: boolean;
};

type BowlingRecord = {
  sourcePlayerId: string;
  fullName: string;
  overs: string;
  runsConceded: number;
  wickets: number;
};

type HistoricalInnings = {
  battingTeam: string;
  batting: BattingRecord[];
  bowling: BowlingRecord[];
};

type HistoricalMatch = {
  sourceMatchId: string;
  sourceUrl: string;
  date: string;
  teams: string[];
  players: Array<{
    sourcePlayerId: string;
    fullName: string;
    team: string;
  }>;
  innings: HistoricalInnings[];
};

type HistoricalNormalizedEdition = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50 | 60;
  matches: HistoricalMatch[];
};

type Accumulator = {
  sourcePlayerId: string;
  fullName: string;
  team: string;

  matches: Set<string>;
  sources: Set<string>;

  innings: number;
  runs: number;
  balls: number;
  dismissals: number;

  wickets: number;
  bowlingBalls: number;
  runsConceded: number;

  catches: number;
  stumpings: number;

  inningsScores: number[];
};

const ROOT =
  process.cwd();

const NORMALIZED_DIRECTORY =
  path.join(
    ROOT,
    "scripts",
    "data",
    "world",
    "historical-normalized"
  );

const OUTPUT_DIRECTORY =
  path.join(
    ROOT,
    "scripts",
    "data",
    "world",
    "processed"
  );

function fail(
  message: string
): never {
  throw new Error(
    `[WORLD HISTORICAL PROCESSING] ${message}`
  );
}

function readJson<T>(
  filePath: string
): T {
  if (
    !fs.existsSync(
      filePath
    )
  ) {
    fail(
      `Missing ${filePath}`
    );
  }

  return JSON.parse(
    fs.readFileSync(
      filePath,
      "utf8"
    )
  ) as T;
}

function oversToBalls(
  value: string
): number {
  const match =
    value
      .trim()
      .match(
        /^(\d+)(?:\.(\d+))?$/
      );

  if (!match) {
    fail(
      `Invalid overs value "${value}".`
    );
  }

  const overs =
    Number(match[1]);

  const balls =
    match[2]
      ? Number(match[2])
      : 0;

  if (
    balls < 0 ||
    balls > 5
  ) {
    fail(
      `Invalid cricket over notation "${value}".`
    );
  }

  return (
    overs * 6 +
    balls
  );
}

function slugify(
  value: string
): string {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

function shortName(
  value: string
): string {
  const words =
    value
      .split(/\s+/)
      .filter(Boolean);

  if (
    words.length === 1
  ) {
    return words[0]
      .slice(0, 4)
      .toUpperCase();
  }

  return words
    .map(
      (word) =>
        word[0]
    )
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function getAccumulator(
  map: Map<
    string,
    Accumulator
  >,
  sourcePlayerId: string,
  fullName: string,
  team: string
): Accumulator {
  const existing =
    map.get(
      sourcePlayerId
    );

  if (
    existing
  ) {
    if (
      existing.fullName !==
      fullName
    ) {
      fail(
        `Canonical player ${sourcePlayerId} has conflicting names.`
      );
    }

    if (
      existing.team !==
      team
    ) {
      fail(
        `Canonical player ${sourcePlayerId} appears for multiple teams in the same World Cup edition: ${existing.team}, ${team}.`
      );
    }

    return existing;
  }

  const created: Accumulator = {
    sourcePlayerId,
    fullName,
    team,
    matches:
      new Set<string>(),
    sources:
      new Set<string>(),
    innings: 0,
    runs: 0,
    balls: 0,
    dismissals: 0,
    wickets: 0,
    bowlingBalls: 0,
    runsConceded: 0,
    catches: 0,
    stumpings: 0,
    inningsScores: [],
  };

  map.set(
    sourcePlayerId,
    created
  );

  return created;
}

function processEdition(
  source: typeof WORLD_HISTORICAL_SOURCES[number],
  roles: Map<
    string,
    RoleEntry
  >
): void {
  const normalized =
    readJson<HistoricalNormalizedEdition>(
      path.join(
        NORMALIZED_DIRECTORY,
        `${source.year}.json`
      )
    );

  if (
    normalized.matches.length !==
    source.expectedMatchCount
  ) {
    fail(
      `${source.year}: found ${normalized.matches.length} normalized matches; expected ${source.expectedMatchCount}.`
    );
  }

  const players =
    new Map<
      string,
      Accumulator
    >();

  const seenMatches =
    new Set<string>();

  for (
    const match of
    normalized.matches
  ) {
    if (
      seenMatches.has(
        match.sourceMatchId
      )
    ) {
      fail(
        `${source.year}: duplicate source match ID ${match.sourceMatchId}.`
      );
    }

    seenMatches.add(
      match.sourceMatchId
    );

    for (
      const player of
      match.players
    ) {
      const accumulator =
        getAccumulator(
          players,
          player.sourcePlayerId,
          player.fullName,
          player.team
        );

      accumulator.matches.add(
        match.sourceMatchId
      );

      accumulator.sources.add(
        match.sourceUrl
      );
    }

    for (
      const innings of
      match.innings
    ) {
      const inningsPlayers =
        new Set<string>();

      for (
        const batting of
        innings.batting
      ) {
        if (
          batting.didNotBat
        ) {
          continue;
        }

        const player =
          players.get(
            batting.sourcePlayerId
          );

        if (!player) {
          fail(
            `${source.year}/${match.sourceMatchId}: missing accumulator for ${batting.sourcePlayerId}.`
          );
        }

        player.innings++;

        const runs =
          batting.runs ?? 0;

        const balls =
          batting.balls ?? 0;

        player.runs +=
          runs;

        player.balls +=
          balls;

        player.inningsScores.push(
          runs
        );

        inningsPlayers.add(
          batting.sourcePlayerId
        );

        if (
          !batting.notOut &&
          !batting.retired &&
          batting.dismissal &&
          !/did not bat/i.test(
            batting.dismissal
          )
        ) {
          player.dismissals++;
        }

        if (
          batting.catcherSourcePlayerId
        ) {
          const catcher =
            players.get(
              batting.catcherSourcePlayerId
            );

          if (catcher) {
            catcher.catches++;
          }
        }

        if (
          batting.stumperSourcePlayerId
        ) {
          const stumper =
            players.get(
              batting.stumperSourcePlayerId
            );

          if (stumper) {
            stumper.stumpings++;
          }
        }
      }

      for (
        const bowling of
        innings.bowling
      ) {
        const player =
          players.get(
            bowling.sourcePlayerId
          );

        if (!player) {
          fail(
            `${source.year}/${match.sourceMatchId}: missing bowling accumulator for ${bowling.sourcePlayerId}.`
          );
        }

        player.wickets +=
          bowling.wickets;

        player.runsConceded +=
          bowling.runsConceded;

        player.bowlingBalls +=
          oversToBalls(
            bowling.overs
          );
      }
    }
  }

  if (
    players.size === 0
  ) {
    fail(
      `${source.year}: zero canonical players found.`
    );
  }

  const teams =
    new Map<
      string,
      Accumulator[]
    >();

  for (
    const player of
    players.values()
  ) {
    const list =
      teams.get(
        player.team
      ) ??
      [];

    list.push(
      player
    );

    teams.set(
      player.team,
      list
    );
  }

  const outputTeams =
    [...teams.entries()]
      .sort(
        ([a], [b]) =>
          a.localeCompare(b)
      )
      .map(
        ([teamName, teamPlayers]) => {
          const outputPlayers =
            teamPlayers
              .sort(
                (a, b) =>
                  a.fullName.localeCompare(
                    b.fullName
                  )
              )
              .map(
                (player) => {
                  const role =
                    roles.get(
                      player.sourcePlayerId
                    );

                  if (!role) {
                    fail(
                      `${source.year}/${teamName}/${player.fullName}: missing authoritative role for ${player.sourcePlayerId}.`
                    );
                  }

                  const battingAverage =
                    player.dismissals >
                    0
                      ? player.runs /
                        player.dismissals
                      : null;

                  const strikeRate =
                    player.balls >
                    0
                      ? (player.runs /
                          player.balls) *
                        100
                      : null;

                  const bowlingAverage =
                    player.wickets >
                    0
                      ? player.runsConceded /
                        player.wickets
                      : null;

                  const economy =
                    player.bowlingBalls >
                    0
                      ? player.runsConceded /
                        (player.bowlingBalls /
                          6)
                      : null;

                  const hundreds =
                    player.inningsScores.filter(
                      (score) =>
                        score >=
                        100
                    ).length;

                  const fifties =
                    player.inningsScores.filter(
                      (score) =>
                        score >=
                          50 &&
                        score <
                          100
                    ).length;

                  return {
                    fullName:
                      player.fullName,

                    sourcePlayerId:
                      `cricsheet:${player.sourcePlayerId}`,

                    role:
                      role.role,

                    stats: {
                      matches:
                        player.matches.size,
                      innings:
                        player.innings,
                      runs:
                        player.runs,
                      batting_average:
                        battingAverage,
                      strike_rate:
                        strikeRate,
                      hundreds,
                      fifties,
                      wickets:
                        player.wickets,
                      bowling_average:
                        bowlingAverage,
                      economy,
                      catches:
                        player.catches,
                      stumpings:
                        player.stumpings,
                    },

                    roleSource:
                      role.source,

                    sources:
                      [...player.sources],
                  };
                }
              );

          return {
            name:
              teamName,
            shortName:
              shortName(
                teamName
              ),
            slug:
              slugify(
                teamName
              ),
            players:
              outputPlayers,
            sources:
              [
                ...new Set(
                  outputPlayers.flatMap(
                    (player) =>
                      player.sources
                  )
                ),
              ],
          };
        }
      );

  fs.mkdirSync(
    OUTPUT_DIRECTORY,
    {
      recursive: true,
    }
  );

  const output = {
    year:
      source.year,
    seasonName:
      source.seasonName,
    format:
      "ODI" as const,
    competition:
      "ICC Men's Cricket World Cup" as const,
    oversPerInnings:
      source.oversPerInnings,
    teams:
      outputTeams,
    sources:
      [
        source.archiveRoot,
        ...new Set(
          normalized.matches.map(
            (match) =>
              match.sourceUrl
          )
        ),
      ],
  };

  fs.writeFileSync(
    path.join(
      OUTPUT_DIRECTORY,
      `${source.year}.json`
    ),
    `${JSON.stringify(
      output,
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `[WORLD HISTORICAL PROCESSING] ${source.year}: ${outputTeams.length} teams / ${players.size} canonical players`
  );
}

function main(): void {
  console.log(
    "[WORLD HISTORICAL PROCESSING] Starting."
  );

  const roles =
    loadVerifiedWorldRoles();

  for (
    const source of
    WORLD_HISTORICAL_SOURCES
  ) {
    processEdition(
      source,
      roles
    );
  }

  console.log(
    "[WORLD HISTORICAL PROCESSING] Historical editions processed successfully."
  );
}

main();