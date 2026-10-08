export type HistoricalWorldSource = {
  year: number;
  seasonName: string;
  archiveRoot: string;
  provider: "CricketArchive";
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
 * CricketArchive is used for the 1975-1999 editions because its event
 * pages expose the complete tournament scorecard index and the individual
 * scorecards contain structured batting, bowling and player links.
 *
 * 2003 onward continues to use the existing Cricsheet pipeline.
 */
export const WORLD_HISTORICAL_SOURCES: readonly HistoricalWorldSource[] = [
  {
    year: 1975,
    seasonName: "Prudential World Cup 1975",
    archiveRoot:
      "https://www.cricketarchive.com/Events/Prudential_World_Cup_1975.html",
    provider: "CricketArchive",
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
    seasonName: "Prudential World Cup 1979",
    archiveRoot:
      "https://www.cricketarchive.com/Events/Prudential_World_Cup_1979.html",
    provider: "CricketArchive",
    oversPerInnings: 60,
    expectedMatchCount: 15,
    sourcePolicy: "archived-scorecards",
    integrityChecks: {
      expectedTopWickets: 10,
    },
  },
  {
    year: 1983,
    seasonName: "Prudential World Cup 1983",
    archiveRoot:
      "https://www.cricketarchive.com/Events/Prudential_World_Cup_1983.html",
    provider: "CricketArchive",
    oversPerInnings: 60,
    expectedMatchCount: 27,
    sourcePolicy: "archived-scorecards",
  },
  {
    year: 1987,
    seasonName: "Reliance World Cup 1987/88",
    archiveRoot:
      "https://www.cricketarchive.com/Archive/Events/1/Reliance_World_Cup_1987-88.html",
    provider: "CricketArchive",
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
    seasonName: "Benson and Hedges World Cup 1991/92",
    archiveRoot:
      "https://www.cricketarchive.com/Events/Benson_and_Hedges_World_Cup_1991-92.html",
    provider: "CricketArchive",
    oversPerInnings: 50,
    expectedMatchCount: 39,
    sourcePolicy: "archived-scorecards",
  },
  {
    year: 1996,
    seasonName: "Wills World Cup 1995/96",
    archiveRoot:
      "https://www.cricketarchive.com/Events/Wills_World_Cup_1995-96.html",
    provider: "CricketArchive",
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
    seasonName: "ICC World Cup 1999",
    archiveRoot:
      "https://www.cricketarchive.com/Events/ICC_World_Cup_1999.html",
    provider: "CricketArchive",
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