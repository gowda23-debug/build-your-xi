import type { IPLPlayer, PitchProfile } from "@/types/ipl";

export type ScoreBreakdown = {
  batting: number;
  bowling: number;
  balance: number;
  conditions: number;
};

export type MatchResult = {
  match: number;
  opponentStrength: number;
  winProbability: number;
  result: "W" | "L";
};

export type XIEngineResult = {
  score: number;
  breakdown: ScoreBreakdown;
  teamStrength: number;
  wins: number;
  losses: number;
  matches: MatchResult[];
};

export type EvaluateXIInput = {
  players: IPLPlayer[];
  pitch: PitchProfile | null;
  challengeId: string;
};
