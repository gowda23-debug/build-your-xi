/**
 * Source registry for the first World Domination data-import phase.
 *
 * IMPORTANT:
 * - Being listed here only means an edition is configured for source audit.
 * - It does NOT mean the edition is complete, imported, or publishable.
 * - Match coverage is audited from raw files and roles are checked before processing.
 * - Runtime availability comes from public.world_editions, not this source registry.
 *
 * Cricsheet currently provides 265 Men's ODI World Cup matches, fewer than the
 * 299 fixtures played across these six editions. Never manufacture missing games.
 */
export type WorldEdition = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50;
  expectedMatchCount: number;
  sourceType: "cricsheet";
  sourceUrl: "https://cricsheet.org/downloads/";
  license: "ODC-By-1.0";
};

export const WORLD_EDITIONS: readonly WorldEdition[] = [
  {
    year: 2003,
    seasonName: "ICC Men's Cricket World Cup 2003",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    expectedMatchCount: 54,
    sourceType: "cricsheet",
    sourceUrl: "https://cricsheet.org/downloads/",
    license: "ODC-By-1.0",
  },
  {
    year: 2007,
    seasonName: "ICC Men's Cricket World Cup 2007",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    expectedMatchCount: 51,
    sourceType: "cricsheet",
    sourceUrl: "https://cricsheet.org/downloads/",
    license: "ODC-By-1.0",
  },
  {
    year: 2011,
    seasonName: "ICC Men's Cricket World Cup 2011",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    expectedMatchCount: 49,
    sourceType: "cricsheet",
    sourceUrl: "https://cricsheet.org/downloads/",
    license: "ODC-By-1.0",
  },
  {
    year: 2015,
    seasonName: "ICC Men's Cricket World Cup 2015",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    expectedMatchCount: 49,
    sourceType: "cricsheet",
    sourceUrl: "https://cricsheet.org/downloads/",
    license: "ODC-By-1.0",
  },
  {
    year: 2019,
    seasonName: "ICC Men's Cricket World Cup 2019",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    expectedMatchCount: 48,
    sourceType: "cricsheet",
    sourceUrl: "https://cricsheet.org/downloads/",
    license: "ODC-By-1.0",
  },
  {
    year: 2023,
    seasonName: "ICC Men's Cricket World Cup 2023",
    format: "ODI",
    competition: "ICC Men's Cricket World Cup",
    oversPerInnings: 50,
    expectedMatchCount: 48,
    sourceType: "cricsheet",
    sourceUrl: "https://cricsheet.org/downloads/",
    license: "ODC-By-1.0",
  },
] as const;

/** Historical editions are deliberately not active until a permitted, auditable source is configured. */
export const WORLD_PLANNED_HISTORICAL_YEARS: readonly number[] = [
  1979, 1983, 1987, 1992, 1996, 1999,
];

export const WORLD_CRICSHEET_EDITIONS = WORLD_EDITIONS;
export const WORLD_CRICSHEET_EDITION_YEARS = WORLD_CRICSHEET_EDITIONS.map((edition) => edition.year);
export const WORLD_EDITION_YEARS = WORLD_EDITIONS.map((edition) => edition.year);

/**
 * Backwards-compatible aliases. A local source registry cannot certify availability;
 * these are intentionally empty. Published editions are read from Supabase.
 */
export type WorldEditionStatus = "pending-coverage" | "pending-roles" | "published";
export const WORLD_AVAILABLE_EDITIONS: readonly WorldEdition[] = [];
export const WORLD_AVAILABLE_EDITION_YEARS: readonly number[] = [];

export function getWorldEdition(year: number): WorldEdition | undefined {
  return WORLD_EDITIONS.find((edition) => edition.year === year);
}

/** This function deliberately returns undefined: publication is DB-backed. */
export function getAvailableWorldEdition(_year: number): undefined {
  return undefined;
}
