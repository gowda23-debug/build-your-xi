export type WorldEditionStatus = "available";

export type WorldEdition = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50 | 60;
  status: WorldEditionStatus;
  sourceType: "cricsheet" | "cricinfo";
};

export const WORLD_EDITIONS: readonly WorldEdition[] = [
  {
    year: 1975,
    seasonName: "ICC Men's Cricket World Cup 1975",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 60,
    status: "available",
    sourceType: "cricinfo",
  },
  {
    year: 1979,
    seasonName: "ICC Men's Cricket World Cup 1979",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 60,
    status: "available",
    sourceType: "cricinfo",
  },
  {
    year: 1983,
    seasonName: "ICC Men's Cricket World Cup 1983",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 60,
    status: "available",
    sourceType: "cricinfo",
  },
  {
    year: 1987,
    seasonName: "ICC Men's Cricket World Cup 1987",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    status: "available",
    sourceType: "cricinfo",
  },
  {
    year: 1992,
    seasonName: "ICC Men's Cricket World Cup 1992",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    status: "available",
    sourceType: "cricinfo",
  },
  {
    year: 1996,
    seasonName: "ICC Men's Cricket World Cup 1996",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    status: "available",
    sourceType: "cricinfo",
  },
  {
    year: 1999,
    seasonName: "ICC Men's Cricket World Cup 1999",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    status: "available",
    sourceType: "cricinfo",
  },
  {
    year: 2003,
    seasonName: "ICC Men's Cricket World Cup 2003",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    status: "available",
    sourceType: "cricsheet",
  },
  {
    year: 2007,
    seasonName: "ICC Men's Cricket World Cup 2007",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    status: "available",
    sourceType: "cricsheet",
  },
  {
    year: 2011,
    seasonName: "ICC Men's Cricket World Cup 2011",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    status: "available",
    sourceType: "cricsheet",
  },
  {
    year: 2015,
    seasonName: "ICC Men's Cricket World Cup 2015",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    status: "available",
    sourceType: "cricsheet",
  },
  {
    year: 2019,
    seasonName: "ICC Men's Cricket World Cup 2019",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    status: "available",
    sourceType: "cricsheet",
  },
  {
    year: 2023,
    seasonName: "ICC Men's Cricket World Cup 2023",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    status: "available",
    sourceType: "cricsheet",
  },
];

export const WORLD_EDITION_YEARS = WORLD_EDITIONS.map(
  (edition) => edition.year
);

export const WORLD_AVAILABLE_EDITIONS = WORLD_EDITIONS.filter(
  (edition) => edition.status === "available"
);

export const WORLD_AVAILABLE_EDITION_YEARS = WORLD_AVAILABLE_EDITIONS.map(
  (edition) => edition.year
);

export const WORLD_CRICSHEET_EDITIONS =
  WORLD_AVAILABLE_EDITIONS.filter(
    (edition) => edition.sourceType === "cricsheet"
  );

export const WORLD_CRICSHEET_EDITION_YEARS =
  WORLD_CRICSHEET_EDITIONS.map(
    (edition) => edition.year
  );

export function getWorldEdition(
  year: number
): WorldEdition | undefined {
  return WORLD_EDITIONS.find(
    (edition) => edition.year === year
  );
}

export function getAvailableWorldEdition(
  year: number
): WorldEdition | undefined {
  const edition = getWorldEdition(year);

  if (!edition || edition.status !== "available") {
    return undefined;
  }

  return edition;
}
