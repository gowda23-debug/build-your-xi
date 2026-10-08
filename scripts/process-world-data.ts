import fs from "node:fs";
import path from "node:path";

type Role =
  | "BAT"
  | "WK"
  | "AR"
  | "BOWL";

type Match = {
  info: {
    dates?: string[];
    teams: string[];
    players: Record<
      string,
      string[]
    >;
    registry?: {
      people?: Record<
        string,
        string
      >;
    };
    event?: {
      name?: string;
      match_number?: number;
    };
  };

  innings?: Array<{
    team: string;
    overs?: Array<{
      deliveries?: Array<{
        batter: string;
        bowler: string;
        non_striker: string;

        runs: {
          batter: number;
          extras: number;
          total: number;
          non_boundary?: boolean;
        };

        extras?: Record<
          string,
          number
        >;

        wickets?: Array<{
          kind: string;
          player_out: string;
          fielders?: Array<{
            name: string;
          }>;
        }>;
      }>;
    }>;
  }>;
};

type RoleEntry = {
  role: Role;
  source: {
    provider: "ICC" | "BOARD";
    url: string;
    retrievedAt: string;
  };
};

const ROOT =
  process.cwd();

const RAW =
  path.join(
    ROOT,
    "scripts/data/world/raw"
  );

const OUT =
  path.join(
    ROOT,
    "scripts/data/world/processed"
  );

const EDITIONS =
  path.join(
    ROOT,
    "scripts/data/world/editions.ts"
  );

const ROLES =
  path.join(
    ROOT,
    "scripts/data/world/role-sources.json"
  );

function fail(
  message: string
): never {
  throw new Error(
    `[WORLD PROCESSING] ${message}`
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

  const raw =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  if (!raw.trim()) {
    fail(
      `Empty ${filePath}`
    );
  }

  try {
    return JSON.parse(
      raw
    ) as T;
  } catch (error) {
    fail(
      `Invalid JSON ${filePath}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}

function ensureDirectory(
  directory: string
): void {
  fs.mkdirSync(
    directory,
    {
      recursive: true,
    }
  );
}

function parseEditions(): Array<{
  year: number;
  seasonName: string;
  oversPerInnings:
    | 50
    | 60;
  expectedMatchCount: number;
  competition: string;
}> {
  const text =
    fs.readFileSync(
      EDITIONS,
      "utf8"
    );

  const regex =
    /\{ year: (\d+), seasonName: "([^"]+)", format: "ODI", competition: "ICC Men's Cricket World Cup", oversPerInnings: (\d+), expectedMatchCount: (\d+),/g;

  const result: Array<{
    year: number;
    seasonName: string;
    oversPerInnings:
      | 50
      | 60;
    expectedMatchCount: number;
    competition: string;
  }> = [];

  for (
    const match of
    text.matchAll(regex)
  ) {
    result.push({
      year:
        Number(match[1]),
      seasonName:
        match[2],
      oversPerInnings:
        Number(
          match[3]
        ) as 50 | 60,
      expectedMatchCount:
        Number(
          match[4]
        ),
      competition:
        "ICC Men's Cricket World Cup",
    });
  }

  if (
    result.length === 0
  ) {
    fail(
      "Unable to read World edition registry."
    );
  }

  return result;
}

function loadRoles():
  Map<string, RoleEntry> {
  const file =
    readJson<{
      players: Record<
        string,
        RoleEntry
      >;
    }>(ROLES);

  const result =
    new Map<
      string,
      RoleEntry
    >();

  for (
    const [
      playerId,
      entry,
    ] of Object.entries(
      file.players ?? {}
    )
  ) {
    result.set(
      playerId,
      entry
    );
  }

  return result;
}

function canonicalId(
  match: Match,
  name: string
): string {
  const id =
    match.info.registry
      ?.people?.[name];

  if (
    !id ||
    !/^[0-9a-f]{8}$/i.test(
      id
    )
  ) {
    fail(
      `Missing Cricsheet registry ID for ${name}.`
    );
  }

  return id.toLowerCase();
}

function numeric(
  value: unknown
): number {
  return typeof value ===
    "number" &&
    Number.isFinite(value)
    ? value
    : 0;
}

function isLegalDelivery(
  extras:
    | Record<
        string,
        number
      >
    | undefined
): boolean {
  return !(
    (extras?.wides ?? 0) >
      0 ||
    (extras?.noballs ?? 0) >
      0
  );
}

type Accumulator = {
  id: string;
  name: string;
  team: string;

  matches: Set<string>;

  innings: number;
  runs: number;
  balls: number;
  dismissals: number;

  wickets: number;
  ballsBowled: number;
  runsConceded: number;

  catches: number;
  stumpings: number;

  inningsScores: number[];
};

function newAccumulator(
  id: string,
  name: string,
  team: string
): Accumulator {
  return {
    id,
    name,
    team,
    matches:
      new Set<string>(),
    innings: 0,
    runs: 0,
    balls: 0,
    dismissals: 0,
    wickets: 0,
    ballsBowled: 0,
    runsConceded: 0,
    catches: 0,
    stumpings: 0,
    inningsScores: [],
  };
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

function processEdition(
  year: number,
  edition: ReturnType<
    typeof parseEditions
  >[number],
  roles: Map<
    string,
    RoleEntry
  >
) {
  const wrapper =
    readJson<{
      matches: Match[];
    }>(
      path.join(
        RAW,
        `${year}.json`
      )
    );

  const matches =
    Array.isArray(
      wrapper.matches
    )
      ? wrapper.matches
      : [];

  if (
    matches.length !==
    edition.expectedMatchCount
  ) {
    fail(
      `${year}: found ${matches.length} matches; expected ${edition.expectedMatchCount}.`
    );
  }

  const seen =
    new Set<string>();

  const players =
    new Map<
      string,
      Accumulator
    >();

  const teamPlayers =
    new Map<
      string,
      Set<string>
    >();

  for (
    const match of matches
  ) {
    const date =
      match.info.dates?.[0] ??
      "";

    const matchNumber =
      match.info.event
        ?.match_number ??
      "";

    const matchKey =
      [
        date,
        matchNumber,
        ...[
          ...match.info.teams,
        ].sort(),
      ].join("|");

    if (
      seen.has(
        matchKey
      )
    ) {
      fail(
        `${year}: duplicate match ${matchKey}.`
      );
    }

    seen.add(
      matchKey
    );

    for (
      const [
        team,
        names,
      ] of Object.entries(
        match.info.players ??
          {}
      )
    ) {
      const ids =
        teamPlayers.get(
          team
        ) ??
        new Set<string>();

      for (
        const name of
        names
      ) {
        const id =
          canonicalId(
            match,
            name
          );

        ids.add(id);

        const existing =
          players.get(
            id
          );

        if (
          existing &&
          existing.team !==
            team
        ) {
          fail(
            `${year}: player ${id} appears for multiple teams.`
          );
        }

        const player =
          existing ??
          newAccumulator(
            id,
            name,
            team
          );

        player.matches.add(
          matchKey
        );

        players.set(
          id,
          player
        );
      }

      teamPlayers.set(
        team,
        ids
      );
    }

    for (
      const innings of
      match.innings ?? []
    ) {
      const inningsScores =
        new Map<
          string,
          number
        >();

      const batters =
        new Set<string>();

      for (
        const over of
        innings.overs ?? []
      ) {
        for (
          const ball of
          over.deliveries ??
          []
        ) {
          const batterId =
            canonicalId(
              match,
              ball.batter
            );

          const bowlerId =
            canonicalId(
              match,
              ball.bowler
            );

          const batter =
            players.get(
              batterId
            );

          const bowler =
            players.get(
              bowlerId
            );

          if (
            !batter ||
            !bowler
          ) {
            fail(
              `${year}: registry player missing from lineup.`
            );
          }

          const runs =
            numeric(
              ball.runs
                ?.batter
            );

          batter.runs +=
            runs;

          inningsScores.set(
            batterId,
            (inningsScores.get(
              batterId
            ) ?? 0) +
              runs
          );

          batters.add(
            batterId
          );

          if (
            isLegalDelivery(
              ball.extras
            )
          ) {
            batter.balls++;
            bowler.ballsBowled++;
          }

          const conceded =
            numeric(
              ball.runs?.total
            ) -
            numeric(
              ball.extras?.byes
            ) -
            numeric(
              ball.extras?.legbyes
            ) -
            numeric(
              ball.extras?.penalty
            );

          bowler.runsConceded +=
            Math.max(
              0,
              conceded
            );

          for (
            const wicket of
            ball.wickets ??
            []
          ) {
            if (
              wicket.player_out ===
                ball.batter &&
              ![
                "retired hurt",
                "retired not out",
              ].includes(
                wicket.kind
              )
            ) {
              batter.dismissals++;
            }

            if (
              wicket.fielders
            ) {
              for (
                const fielder of
                wicket.fielders
              ) {
                const fielderId =
                  canonicalId(
                    match,
                    fielder.name
                  );

                const fielderPlayer =
                  players.get(
                    fielderId
                  );

                if (
                  !fielderPlayer
                ) {
                  continue;
                }

                if (
                  wicket.kind ===
                  "stumped"
                ) {
                  fielderPlayer.stumpings++;
                } else if (
                  [
                    "caught",
                    "caught and bowled",
                  ].includes(
                    wicket.kind
                  )
                ) {
                  fielderPlayer.catches++;
                }
              }
            }

            if (
              ![
                "run out",
                "retired hurt",
                "retired not out",
                "obstructing the field",
                "timed out",
              ].includes(
                wicket.kind
              )
            ) {
              bowler.wickets++;
            }
          }
        }
      }

      for (
        const id of batters
      ) {
        const player =
          players.get(id);

        if (!player) {
          continue;
        }

        player.innings++;

        player.inningsScores.push(
          inningsScores.get(
            id
          ) ?? 0
        );
      }
    }
  }

  ensureDirectory(
    OUT
  );

  const teams =
    [...teamPlayers.entries()]
      .sort(
        ([a], [b]) =>
          a.localeCompare(b)
      )
      .map(
        ([team, ids]) => {
          const outputPlayers =
            [...ids]
              .map(
                (id) => {
                  const player =
                    players.get(
                      id
                    )!;

                  const role =
                    roles.get(
                      id
                    );

                  if (!role) {
                    fail(
                      `${year}/${team}/${player.name}: no authoritative role for ${id}.`
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
                    player.ballsBowled >
                    0
                      ? player.runsConceded /
                        (player.ballsBowled /
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
                      player.name,

                    sourcePlayerId:
                      `cricsheet:${player.id}`,

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

                    sources: [
                      "https://cricsheet.org/",
                    ],
                  };
                }
              );

          return {
            name:
              team,
            shortName:
              shortName(team),
            slug:
              slugify(team),
            players:
              outputPlayers,
            sources: [
              "https://cricsheet.org/",
            ],
          };
        }
      );

  return {
    year,
    seasonName:
      edition.seasonName,
    format:
      "ODI" as const,
    competition:
      "ICC Men's Cricket World Cup" as const,
    oversPerInnings:
      edition.oversPerInnings,
    teams,
    sources: [
      "https://cricsheet.org/",
    ],
  };
}

function main(): void {
  console.log(
    "[WORLD PROCESSING] Starting."
  );

  const roles =
    loadRoles();

  ensureDirectory(
    OUT
  );

  for (
    const edition of
    parseEditions()
  ) {
    /*
     * Historical editions are processed
     * by process-world-historical.ts.
     */
    if (
      edition.year < 2003
    ) {
      continue;
    }

    const result =
      processEdition(
        edition.year,
        edition,
        roles
      );

    fs.writeFileSync(
      path.join(
        OUT,
        `${edition.year}.json`
      ),
      `${JSON.stringify(
        result,
        null,
        2
      )}\n`,
      "utf8"
    );

    console.log(
      `[WORLD PROCESSING] ${edition.year}: ${result.teams.length} teams`
    );
  }

  console.log(
    "[WORLD PROCESSING] Modern editions processed."
  );
}

main();