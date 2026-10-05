export type HistoricalWorldSource = {
  year: number;
  seasonName: string;
  archiveRoot: string;
  provider: "ESPNcricinfo";
  oversPerInnings: 50 | 60;
  expectedMatchCount: number;
  sourcePolicy: "archived-scorecards";
  integrityChecks?: {
    expectedTopRuns?: number;
    expectedTopWickets?: number;
  };
};

/**
 * Historical source registry.
 *
 * These are source locations and validation metadata, not the World player pool.
 * Player/team/stat records must still be discovered from the source pages and
 * imported into Supabase through the ingestion pipeline.
 */
export const WORLD_HISTORICAL_SOURCES: readonly HistoricalWorldSource[] = [
  {
    year: 1975,
    seasonName: "ICC Men's Cricket World Cup 1975",
    archiveRoot: "https://i.imgci.com/link_to_database/ARCHIVE/WORLD_CUPS/WC75/",
    provider: "ESPNcricinfo",
    oversPerInnings: 60,
    expectedMatchCount: 15,
    sourcePolicy: "archived-scorecards",
    integrityChecks: {
      expectedTopRuns: 333,
      expectedTopWickets: 11,
    },
  },
  {
    year: 1979,
    seasonName: "ICC Men's Cricket World Cup 1979",
    archiveRoot: "https://i.imgci.com/db/ARCHIVE/WORLD_CUPS/WC79/",
    provider: "ESPNcricinfo",
    oversPerInnings: 60,
    expectedMatchCount: 15,
    sourcePolicy: "archived-scorecards",
    integrityChecks: {
      expectedTopWickets: 10,
    },
  },
  {
    year: 1983,
    seasonName: "ICC Men's Cricket World Cup 1983",
    archiveRoot: "https://img.cricinfo.com/db/ARCHIVE/WORLD_CUPS/WC83/",
    provider: "ESPNcricinfo",
    oversPerInnings: 60,
    expectedMatchCount: 27,
    sourcePolicy: "archived-scorecards",
  },
  {
    year: 1987,
    seasonName: "ICC Men's Cricket World Cup 1987",
    archiveRoot: "https://img.cricinfo.com/db/ARCHIVE/WORLD_CUPS/WC87/",
    provider: "ESPNcricinfo",
    oversPerInnings: 50,
    expectedMatchCount: 27,
    sourcePolicy: "archived-scorecards",
    integrityChecks: {
      expectedTopRuns: 471,
      expectedTopWickets: 18,
    },
  },
  {
    year: 1992,
    seasonName: "ICC Men's Cricket World Cup 1992",
    archiveRoot: "https://img.cricinfo.com/db/ARCHIVE/WORLD_CUPS/WC92/",
    provider: "ESPNcricinfo",
    oversPerInnings: 50,
    expectedMatchCount: 39,
    sourcePolicy: "archived-scorecards",
  },
  {
    year: 1996,
    seasonName: "ICC Men's Cricket World Cup 1996",
    archiveRoot: "https://img.cricinfo.com/link_to_database/ARCHIVE/WORLD_CUPS/WC96/",
    provider: "ESPNcricinfo",
    oversPerInnings: 50,
    expectedMatchCount: 37,
    sourcePolicy: "archived-scorecards",
    integrityChecks: {
      expectedTopRuns: 523,
      expectedTopWickets: 15,
    },
  },
  {
    year: 1999,
    seasonName: "ICC Men's Cricket World Cup 1999",
    archiveRoot: "https://img.cricinfo.com/db/ARCHIVE/1999/WC99/",
    provider: "ESPNcricinfo",
    oversPerInnings: 50,
    expectedMatchCount: 42,
    sourcePolicy: "archived-scorecards",
  },
];

export function getHistoricalWorldSource(
  year: number
): HistoricalWorldSource | undefined {
  return WORLD_HISTORICAL_SOURCES.find(
    (source) => source.year === year
  );
}
