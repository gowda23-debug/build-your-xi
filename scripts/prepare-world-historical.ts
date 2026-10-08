import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import {
  WORLD_HISTORICAL_SOURCES,
  type HistoricalWorldSource,
} from "./data/world/historical-sources";

import {
  loadWorldRegister,
  resolveRegisterName,
  type RegisterPerson,
} from "./world-historical-utils";

type ManifestEntry = {
  sourceMatchId: string;
  url: string;
  file: string;
  cacheKey: string;
};

type EditionManifest = {
  year: number;
  seasonName: string;
  expectedMatchCount: number;
  matches: ManifestEntry[];
};

type HistoricalBattingRecord = {
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

type HistoricalBowlingRecord = {
  sourcePlayerId: string;
  fullName: string;
  overs: string;
  runsConceded: number;
  wickets: number;
};

type HistoricalInnings = {
  battingTeam: string;
  batting: HistoricalBattingRecord[];
  bowling: HistoricalBowlingRecord[];
};

type HistoricalPlayerRecord = {
  sourcePlayerId: string;
  fullName: string;
  team: string;
};

type HistoricalMatch = {
  sourceMatchId: string;
  sourceUrl: string;
  date: string;
  teams: string[];
  players: HistoricalPlayerRecord[];
  innings: HistoricalInnings[];
};

type HistoricalNormalizedEdition = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50 | 60;
  source: {
    provider: "CricketArchive";
    url: string;
  };
  matches: HistoricalMatch[];
};

const ROOT = process.cwd();

const CACHE_ROOT = path.join(
  ROOT,
  "scripts",
  "data",
  "world",
  ".cache",
  "historical"
);

const OUTPUT_ROOT = path.join(
  ROOT,
  "scripts",
  "data",
  "world",
  "historical-normalized"
);

function fail(message: string): never {
  throw new Error(
    `[WORLD HISTORICAL PREPARE] ${message}`
  );
}

function ensureDirectory(
  directory: string
): void {
  fs.mkdirSync(directory, {
    recursive: true,
  });
}

function readJson<T>(
  filePath: string
): T {
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${filePath}`);
  }

  const raw = fs.readFileSync(
    filePath,
    "utf8"
  );

  if (!raw.trim()) {
    fail(`Empty ${filePath}`);
  }

  try {
    return JSON.parse(raw) as T;
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

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(
  value: string
): number | null {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(
    /^-?\d+(?:\.\d+)?/
  );

  if (!match) {
    return null;
  }

  const result = Number(match[0]);

  return Number.isFinite(result)
    ? result
    : null;
}

function parseMatchDate(
  text: string,
  expectedYear: number
): string {
  const match = text.match(
    /\bon\s+(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})/i
  );

  if (!match) {
    fail(
      "Unable to extract match date from scorecard."
    );
  }

  const day = Number(match[1]);
  const monthName =
    match[2].toLowerCase();
  const year = Number(match[3]);

  const months: Record<
    string,
    string
  > = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };

  const month = months[monthName];

  if (!month) {
    fail(
      `Unknown month "${match[2]}" in scorecard date.`
    );
  }

  if (year !== expectedYear) {
    fail(
      `Scorecard date ${match[0]} belongs to ${year}, expected ${expectedYear}.`
    );
  }

  if (
    day < 1 ||
    day > 31
  ) {
    fail(
      `Invalid day "${day}" in scorecard date.`
    );
  }

  const date = `${year}-${month}-${String(
    day
  ).padStart(2, "0")}`;

  const parsed = new Date(
    `${date}T00:00:00Z`
  );

  if (
    Number.isNaN(
      parsed.getTime()
    ) ||
    parsed
      .toISOString()
      .slice(0, 10) !== date
  ) {
    fail(
      `Invalid calendar date "${date}".`
    );
  }

  return date;
}

function resolvePerson(
  register: ReturnType<
    typeof loadWorldRegister
  >,
  value: string
): RegisterPerson {
  const cleaned = cleanText(value)
    .replace(/^[*+#]+/, "")
    .trim();

  if (
    !cleaned ||
    /^(sub|substitute)$/i.test(
      cleaned
    )
  ) {
    fail(
      `Cannot resolve anonymous substitute "${value}" as a canonical player identity.`
    );
  }

  return resolveRegisterName(
    register,
    cleaned
  );
}

function parseDismissal(
  dismissal: string,
  register: ReturnType<
    typeof loadWorldRegister
  >
): {
  bowlerSourcePlayerId: string | null;
  catcherSourcePlayerId: string | null;
  stumperSourcePlayerId: string | null;
  wicketCreditedToBowler: boolean;
} {
  const value = cleanText(
    dismissal
  );

  if (
    !value ||
    /^(not out|did not bat)$/i.test(
      value
    )
  ) {
    return {
      bowlerSourcePlayerId: null,
      catcherSourcePlayerId: null,
      stumperSourcePlayerId: null,
      wicketCreditedToBowler: false,
    };
  }

  const lower = value.toLowerCase();

  const retired =
    lower.includes("retired hurt") ||
    lower.includes("retired not out");

  const wicketCreditedToBowler =
    !retired &&
    !lower.startsWith("run out") &&
    !lower.startsWith(
      "obstructing the field"
    ) &&
    !lower.startsWith("timed out");

  let bowlerSourcePlayerId:
    | string
    | null = null;

  /*
   * CricketArchive dismissal notation
   * commonly ends with:
   *
   *   b Bowler
   *   c Fielder b Bowler
   *   st Wicketkeeper b Bowler
   */
  const bowlerMatch = value.match(
    /\bb\s+(.+)$/i
  );

  if (bowlerMatch?.[1]) {
    const bowlerName =
      bowlerMatch[1].trim();

    if (
      !/^sub$/i.test(
        bowlerName
      )
    ) {
      bowlerSourcePlayerId =
        resolvePerson(
          register,
          bowlerName
        ).identifier;
    }
  }

  /*
   * Caught and bowled.
   */
  const caughtAndBowled =
    value.match(
      /^c\s+and\s+b\s+(.+)$/i
    );

  if (caughtAndBowled?.[1]) {
    const catcher =
      resolvePerson(
        register,
        caughtAndBowled[1]
      );

    return {
      bowlerSourcePlayerId,
      catcherSourcePlayerId:
        catcher.identifier,
      stumperSourcePlayerId: null,
      wicketCreditedToBowler,
    };
  }

  /*
   * Caught.
   */
  const caught =
    value.match(
      /^c\s+(.+?)\s+b\s+(.+)$/i
    );

  if (caught?.[1]) {
    const catcherName =
      caught[1].trim();

    if (
      !/^sub$/i.test(
        catcherName
      )
    ) {
      const catcher =
        resolvePerson(
          register,
          catcherName
        );

      return {
        bowlerSourcePlayerId,
        catcherSourcePlayerId:
          catcher.identifier,
        stumperSourcePlayerId: null,
        wicketCreditedToBowler,
      };
    }
  }

  /*
   * Stumped.
   */
  const stumped =
    value.match(
      /^st\s+(.+?)\s+b\s+(.+)$/i
    );

  if (stumped?.[1]) {
    const stumper =
      resolvePerson(
        register,
        stumped[1]
      );

    return {
      bowlerSourcePlayerId,
      catcherSourcePlayerId: null,
      stumperSourcePlayerId:
        stumper.identifier,
      wicketCreditedToBowler,
    };
  }

  return {
    bowlerSourcePlayerId,
    catcherSourcePlayerId: null,
    stumperSourcePlayerId: null,
    wicketCreditedToBowler,
  };
}

function extractCells(
  $: cheerio.CheerioAPI,
  row: AnyNode
): string[] {
  return $(row)
    .find("th,td")
    .map((_, cell) => cleanText($(cell).text()))
    .get();
}

function parseScorecard(
  html: string,
  manifestEntry: ManifestEntry,
  source: HistoricalWorldSource,
  register: ReturnType<
    typeof loadWorldRegister
  >
): HistoricalMatch {
  const $ = cheerio.load(html);

  const text = cleanText(
    $("body").text()
  );

  /*
   * Confirm that the downloaded page really
   * belongs to the manifest entry.
   */
  const scorecardId =
    text.match(
      /\b(o\d+)\b/i
    )?.[1]?.toLowerCase();

  if (!scorecardId) {
    fail(
      `${source.year}/${manifestEntry.sourceMatchId}: scorecard does not expose an o<number> source ID.`
    );
  }

  if (
    scorecardId !==
    manifestEntry.sourceMatchId
  ) {
    fail(
      `${source.year}: manifest sourceMatchId ${manifestEntry.sourceMatchId} does not match scorecard source ID ${scorecardId}.`
    );
  }

  const date =
    parseMatchDate(
      text,
      source.year
    );

  const innings: HistoricalInnings[] =
    [];

  let currentInnings:
    | HistoricalInnings
    | null = null;

  let mode:
    | "batting"
    | "bowling"
    | null = null;

  $("tr").each(
    (_, row) => {
      const cells =
        extractCells(
          $,
          row
        );

      if (
        cells.length === 0
      ) {
        return;
      }

      const rowText =
        cleanText(
          cells.join(" ")
        );

      /*
       * Example conceptual format:
       *
       * Team innings Runs Balls
       */
      const battingHeader =
        rowText.match(
          /^(.+?)\s+innings\s+Runs\s+Balls/i
        );

      if (battingHeader) {
        currentInnings = {
          battingTeam:
            cleanText(
              battingHeader[1]
            ),
          batting: [],
          bowling: [],
        };

        innings.push(
          currentInnings
        );

        mode = "batting";

        return;
      }

      /*
       * Example conceptual format:
       *
       * Team bowling Overs Mdns Runs Wkts
       */
      const bowlingHeader =
        rowText.match(
          /^(.+?)\s+bowling\s+Overs\s+Mdns\s+Runs\s+Wkts/i
        );

      if (bowlingHeader) {
        if (!currentInnings) {
          fail(
            `${source.year}/${manifestEntry.sourceMatchId}: bowling section appeared before an innings section.`
          );
        }

        mode = "bowling";

        return;
      }

      if (
        !currentInnings ||
        !mode
      ) {
        return;
      }

      const first =
        cells[0] ?? "";

      /*
       * Non-player summary rows.
       */
      if (
        /^(Extras|Total|Fall of wickets)/i.test(
          first
        )
      ) {
        if (
          /^Extras/i.test(
            first
          )
        ) {
          mode = null;
        }

        return;
      }

      if (
        mode === "batting"
      ) {
        if (
          cells.length < 2
        ) {
          return;
        }

        const person =
          resolvePerson(
            register,
            first
          );

        const dismissal =
          cleanText(
            cells[1] ?? ""
          );

        const didNotBat =
          /did not bat/i.test(
            dismissal
          );

        const retired =
          /retired hurt|retired not out/i.test(
            dismissal
          );

        const runs =
          parseNumber(
            cells[2] ?? ""
          );

        const balls =
          parseNumber(
            cells[3] ?? ""
          );

        const events =
          parseDismissal(
            dismissal,
            register
          );

        currentInnings.batting.push(
          {
            sourcePlayerId:
              person.identifier,
            fullName:
              person.name,
            runs,
            balls,
            didNotBat,
            notOut:
              /not out/i.test(
                dismissal
              ),
            retired,
            dismissal,
            bowlerSourcePlayerId:
              events.bowlerSourcePlayerId,
            catcherSourcePlayerId:
              events.catcherSourcePlayerId,
            stumperSourcePlayerId:
              events.stumperSourcePlayerId,
            wicketCreditedToBowler:
              events.wicketCreditedToBowler,
          }
        );

        return;
      }

      if (
        mode === "bowling"
      ) {
        if (
          cells.length < 5
        ) {
          return;
        }

        const person =
          resolvePerson(
            register,
            first
          );

        const overs =
          cleanText(
            cells[1] ?? ""
          );

        const runs =
          parseNumber(
            cells[3] ?? ""
          );

        const wickets =
          parseNumber(
            cells[4] ?? ""
          );

        /*
         * Ignore rows that aren't bowling
         * player rows.
         */
        if (
          runs === null ||
          wickets === null
        ) {
          return;
        }

        currentInnings.bowling.push(
          {
            sourcePlayerId:
              person.identifier,
            fullName:
              person.name,
            overs,
            runsConceded:
              runs,
            wickets,
          }
        );
      }
    }
  );

  if (
    innings.length < 2
  ) {
    fail(
      `${source.year}/${manifestEntry.sourceMatchId}: expected at least two innings sections, found ${innings.length}.`
    );
  }

  /*
   * A normal World Cup match must have exactly
   * two participating teams.
   */
  const teamNames = [
    ...new Set(
      innings.map(
        (entry) =>
          entry.battingTeam
      )
    ),
  ];

  if (
    teamNames.length !== 2
  ) {
    fail(
      `${source.year}/${manifestEntry.sourceMatchId}: expected exactly two teams, found ${teamNames.length}: ${teamNames.join(", ")}`
    );
  }

  /*
   * Build the canonical player/team inventory.
   */
  const players =
    new Map<
      string,
      HistoricalPlayerRecord
    >();

  for (
    const inningsEntry of
    innings
  ) {
    for (
      const batting of
      inningsEntry.batting
    ) {
      const existing =
        players.get(
          batting.sourcePlayerId
        );

      const team =
        inningsEntry.battingTeam;

      if (
        existing &&
        existing.team !== team
      ) {
        fail(
          `${source.year}/${manifestEntry.sourceMatchId}: player ${batting.sourcePlayerId} appears for both "${existing.team}" and "${team}".`
        );
      }

      players.set(
        batting.sourcePlayerId,
        {
          sourcePlayerId:
            batting.sourcePlayerId,
          fullName:
            batting.fullName,
          team,
        }
      );
    }

    for (
      const bowling of
      inningsEntry.bowling
    ) {
      /*
       * Every bowler must exist in the match
       * player inventory.
       */
      if (
        !players.has(
          bowling.sourcePlayerId
        )
      ) {
        fail(
          `${source.year}/${manifestEntry.sourceMatchId}: bowler ${bowling.fullName} (${bowling.sourcePlayerId}) is not present in the tournament player inventory.`
        );
      }
    }
  }

  return {
    sourceMatchId:
      manifestEntry.sourceMatchId,
    sourceUrl:
      manifestEntry.url,
    date,
    teams: teamNames,
    players: [
      ...players.values(),
    ],
    innings,
  };
}

function readManifest(
  year: number
): EditionManifest {
  return readJson<EditionManifest>(
    path.join(
      CACHE_ROOT,
      String(year),
      "manifest.json"
    )
  );
}

function processEdition(
  source: HistoricalWorldSource,
  register: ReturnType<
    typeof loadWorldRegister
  >
): void {
  const manifest =
    readManifest(
      source.year
    );

  if (
    manifest.year !==
    source.year
  ) {
    fail(
      `${source.year}: manifest year mismatch.`
    );
  }

  if (
    manifest.seasonName !==
    source.seasonName
  ) {
    fail(
      `${source.year}: manifest season mismatch.`
    );
  }

  if (
    manifest.expectedMatchCount !==
    source.expectedMatchCount
  ) {
    fail(
      `${source.year}: manifest expectedMatchCount mismatch.`
    );
  }

  if (
    manifest.matches.length !==
    source.expectedMatchCount
  ) {
    fail(
      `${source.year}: manifest contains ${manifest.matches.length} matches; expected ${source.expectedMatchCount}.`
    );
  }

  const sourceMatchIds =
    new Set<string>();

  const matches =
    manifest.matches.map(
      (entry) => {
        if (
          sourceMatchIds.has(
            entry.sourceMatchId
          )
        ) {
          fail(
            `${source.year}: duplicate source match ID ${entry.sourceMatchId}.`
          );
        }

        sourceMatchIds.add(
          entry.sourceMatchId
        );

        const filePath =
          path.join(
            CACHE_ROOT,
            String(
              source.year
            ),
            entry.file
          );

        if (
          !fs.existsSync(
            filePath
          )
        ) {
          fail(
            `${source.year}/${entry.sourceMatchId}: missing cached HTML ${filePath}.`
          );
        }

        const html =
          fs.readFileSync(
            filePath,
            "utf8"
          );

        if (
          !html.trim()
        ) {
          fail(
            `${source.year}/${entry.sourceMatchId}: cached HTML is empty.`
          );
        }

        return parseScorecard(
          html,
          entry,
          source,
          register
        );
      }
    );

  /*
   * Confirm that every match has exactly
   * two teams and at least one player.
   */
  for (
    const match of
    matches
  ) {
    if (
      match.teams.length !== 2
    ) {
      fail(
        `${source.year}/${match.sourceMatchId}: expected two teams.`
      );
    }

    if (
      match.players.length === 0
    ) {
      fail(
        `${source.year}/${match.sourceMatchId}: zero players discovered.`
      );
    }
  }

  ensureDirectory(
    OUTPUT_ROOT
  );

  const output:
    HistoricalNormalizedEdition =
    {
      year:
        source.year,
      seasonName:
        source.seasonName,
      format:
        "ODI",
      competition:
        "ICC Men's Cricket World Cup",
      oversPerInnings:
        source.oversPerInnings,
      source: {
        provider:
          "CricketArchive",
        url:
          source.archiveRoot,
      },
      matches,
    };

  fs.writeFileSync(
    path.join(
      OUTPUT_ROOT,
      `${source.year}.json`
    ),
    `${JSON.stringify(
      output,
      null,
      2
    )}\n`,
    "utf8"
  );

  const uniquePlayers =
    new Set(
      matches.flatMap(
        (match) =>
          match.players.map(
            (player) =>
              player.sourcePlayerId
          )
      )
    );

  console.log(
    `[WORLD HISTORICAL PREPARE] ${source.year}: ${matches.length} matches, ${uniquePlayers.size} canonical players.`
  );
}

function main(): void {
  console.log(
    "[WORLD HISTORICAL PREPARE] Starting."
  );

  const register =
    loadWorldRegister();

  ensureDirectory(
    OUTPUT_ROOT
  );

  for (
    const source of
    WORLD_HISTORICAL_SOURCES
  ) {
    processEdition(
      source,
      register
    );
  }

  console.log(
    "[WORLD HISTORICAL PREPARE] Historical normalization successful."
  );
}

main();