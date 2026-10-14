/**
 * Historical men's ODI World Cup sources are intentionally not configured.
 * CricketArchive is excluded by the current project source policy. Do not add
 * an edition here until an approved, auditable source and match inventory exist.
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

  integrityChecks?: {
    expectedTopRuns?: number;
    expectedTopWickets?: number;
  };
};

export const WORLD_HISTORICAL_SOURCES: readonly HistoricalWorldSource[] = [];
export function getHistoricalWorldSource(_year: number): HistoricalWorldSource | undefined {
  return undefined;
}
