/**
 * ESPNcricinfo historical men's ODI World Cup archive registry.
 *
 * This registry enables source acquisition; it does NOT certify that an
 * edition has been downloaded, validated, role-reviewed, or published.
 *
 * CricketArchive is intentionally prohibited.
 * Historical player identities must resolve to Cricsheet Register IDs.
 */
export type HistoricalWorldProvider = "ICC" | "BOARD" | "ESPNcricinfo";


export type HistoricalWorldSource = {
  year: number;
  seasonName: string;
  archiveRoot: string;
  provider: HistoricalWorldProvider;
  oversPerInnings: 50 | 60;
  expectedMatchCount: number;
  sourcePolicy: "archived-scorecards";
  scorecardUrlOverrides?: Record<number, string>;
  integrityChecks?: {
    expectedTopRuns?: number;
    expectedTopWickets?: number;
  };
};


const ESPN_ARCHIVE_ROOT =
  "https://i.imgci.com/link_to_database/ARCHIVE/WORLD_CUPS";

export const WORLD_HISTORICAL_SOURCES: readonly HistoricalWorldSource[] = [
  {
    year: 1975,
    seasonName: "ICC Men's Cricket World Cup 1975",
    archiveRoot: `${ESPN_ARCHIVE_ROOT}/WC75/`,
    provider: "ESPNcricinfo",
    oversPerInnings: 60,
    expectedMatchCount: 15,
    sourcePolicy: "archived-scorecards",
    scorecardUrlOverrides: {
      2: "https://i.imgci.com/db/ARCHIVE/WORLD_CUPS/WC75/NZ_EA_WC75_ODI2_07JUN1975.html",
      13: "https://i.imgci.com/db/ARCHIVE/WORLD_CUPS/WC75/ENG_AUS_WC75_ODI-SEMI1_18JUN1975.html",
      14: "https://i.imgci.com/db/ARCHIVE/WORLD_CUPS/WC75/NZ_WI_WC75_ODI-SEMI2_18JUN1975.html",
      15: "https://img.cricinfo.com/link_to_database/ARCHIVE/WORLD_CUPS/WC75/WI_AUS_WC75_ODI-FINAL_21JUN1975.html",
    },
  },
  {
    year: 1979,
    seasonName: "ICC Men's Cricket World Cup 1979",
    archiveRoot: `${ESPN_ARCHIVE_ROOT}/WC79/`,
    provider: "ESPNcricinfo",
    oversPerInnings: 60,
    expectedMatchCount: 15,
    sourcePolicy: "archived-scorecards",
  },
  {
    year: 1983,
    seasonName: "ICC Men's Cricket World Cup 1983",
    archiveRoot: `${ESPN_ARCHIVE_ROOT}/WC83/`,
    provider: "ESPNcricinfo",
    oversPerInnings: 60,
    expectedMatchCount: 27,
    sourcePolicy: "archived-scorecards",
  },
  {
    year: 1987,
    seasonName: "ICC Men's Cricket World Cup 1987",
    archiveRoot: `${ESPN_ARCHIVE_ROOT}/WC87/`,
    provider: "ESPNcricinfo",
    oversPerInnings: 50,
    expectedMatchCount: 27,
    sourcePolicy: "archived-scorecards",
  },
  {
    year: 1992,
    seasonName: "ICC Men's Cricket World Cup 1992",
    archiveRoot: `${ESPN_ARCHIVE_ROOT}/WC92/`,
    provider: "ESPNcricinfo",
    oversPerInnings: 50,
    expectedMatchCount: 39,
    sourcePolicy: "archived-scorecards",
  },
  {
    year: 1996,
    seasonName: "ICC Men's Cricket World Cup 1996",
    archiveRoot: `${ESPN_ARCHIVE_ROOT}/WC96/`,
    provider: "ESPNcricinfo",
    oversPerInnings: 50,
    expectedMatchCount: 37,
    sourcePolicy: "archived-scorecards",
  },
  {
    year: 1999,
    seasonName: "ICC Men's Cricket World Cup 1999",
    archiveRoot: `${ESPN_ARCHIVE_ROOT}/WC99/`,
    provider: "ESPNcricinfo",
    oversPerInnings: 50,
    expectedMatchCount: 42,
    sourcePolicy: "archived-scorecards",
  },
] as const;

export function getHistoricalWorldSource(
  year: number,
): HistoricalWorldSource | undefined {
  return WORLD_HISTORICAL_SOURCES.find((source) => source.year === year);
}