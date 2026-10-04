export type WorldRole =
  | "BAT"
  | "WK"
  | "AR"
  | "BOWL";

export type WorldEdition = {
  id: string;
  year: number;
  seasonName: string;
  oversPerInnings: 50 | 60;
};

export type WorldTeam = {
  id: string;
  name: string;
  shortName: string;
  slug: string;
};

export type WorldSeason = {
  id: string;
  year: number;
};

export type WorldPlayerStats = {
  matches: number;
  innings: number;
  runs: number;
  battingAverage: number | null;
  strikeRate: number | null;
  hundreds: number;
  fifties: number;
  wickets: number;
  bowlingAverage: number | null;
  economy: number | null;
  catches: number;
  stumpings: number;
};

export type WorldPlayer = {
  id: string;
  name: string;
  role: WorldRole;
  stats: WorldPlayerStats;
};

export type WorldTeamSeason = {
  id: string;
  team: WorldTeam;
  season: WorldSeason;
};

export type WorldChallenge = {
  teamSeasonId: string;
  team: WorldTeam;
  season: WorldSeason;
  gameSessionId: string | null;
};