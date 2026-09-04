export type IPLTeam = {
  id: string;
  name: string;
};

export type IPLSeason = {
  id: string;
  season: string;
  startYear: number;
};

export type IPLChallenge = {
  teamSeasonId: string;

  team: IPLTeam;

  season: IPLSeason;
};

export type RandomTeamResponse = {
  teamSeasonId?: string;

  team: IPLTeam;
};

export type RandomSeasonResponse = {
  season: {
    teamSeasonId: string;
    id: string;
    season: string;
    startYear: number;
  };
};

export type IPLPlayerStats = {
  matches: number;
  battingInnings: number;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  highestScore: number;
  dismissals: number;

  bowlingInnings: number;
  ballsBowled: number;
  runsConceded: number;
  wickets: number;
};

export type IPLPlayer = {
  id: string;
  name: string;
  stats: IPLPlayerStats;
};

export type PlayerPoolResponse = {
  challenge: IPLChallenge;

  players: IPLPlayer[];
};

export type IPLGameState =
  | "challenge"
  | "selection"
  | "ready"
  | "playing"
  | "finished";