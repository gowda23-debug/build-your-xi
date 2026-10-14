/**
 * World edition metadata is database-backed. A source registry entry is not
 * equivalent to an import-ready or published edition.
 */
export type WorldEdition = {
  id: string;
  year: number;
  seasonName: string;
  oversPerInnings: 50 | 60;
};

/** @deprecated Use GET /api/world/editions for database-published editions. */
export const WORLD_AVAILABLE_EDITIONS: readonly WorldEdition[] = [];
