import type { IPLPlayerStats, PlayerRole } from "@/types/ipl";

export type GameStatus = "started" | "completed" | "abandoned";
export type GameMode = "ipl" | "world";

export type GameContext = {
  teamSeasonId: string;
  team: { id: string; name: string };
  season: { id: string; season: string; startYear: number };
  pitch?: { id: string; title: string; type: "BAT" | "PACE" | "SPIN" | "BALANCED" } | null;
  rulesVersion: string;
};

export type GamePlayerSnapshot = {
  playerId: string;
  name: string;
  role: PlayerRole;
  stats: IPLPlayerStats;
  teamSeasonId: string;
  teamName: string;
  seasonId: string;
  season: string;
  seasonStartYear: number;
};

export type GamePlayer = {
  id: string;
  gameSessionId: string;
  playerId: string;
  selectionOrder: number;
  playerSnapshot: GamePlayerSnapshot;
};

export type PlayerContribution = {
  playerId: string;
  name: string;
  role: PlayerRole;
  score: number;
  battingScore: number;
  bowlingScore: number;
  fieldingScore: number;
  reason: string;
};

export type GameScoreBreakdown = {
  totalScore: number;
  battingScore: number;
  bowlingScore: number;
  fieldingScore: number;
  balanceScore: number;
};

export type GameResultPayload = {
  rulesVersion: string;
  contributions: PlayerContribution[];
  breakdown: GameScoreBreakdown;
};
