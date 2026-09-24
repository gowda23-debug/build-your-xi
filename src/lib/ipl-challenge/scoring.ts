import type { IPLPlayer, PitchProfile } from "@/types/ipl";
import {
  getBattingAverage,
  getBowlingAverage,
  getEconomyRate,
  getStrikeRate,
} from "./player-stats";
import {
  BATTING_MAX,
  BALANCE_MAX,
  CHALLENGE_OPPONENT_STRENGTHS,
  CONDITIONS_MAX,
  IPL_CHALLENGE_MATCHES,
  SCORE_MAX,
  BOWLING_MAX,
} from "./game-data";
import type {
  EvaluateXIInput,
  MatchResult,
  ScoreBreakdown,
  XIEngineResult,
} from "./game-types";

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const normalize = (value: number, low: number, high: number) =>
  clamp((value - low) / (high - low));

const inverseNormalize = (
  value: number,
  best: number,
  worst: number
) => clamp((worst - value) / (worst - best));

function battingQuality(player: IPLPlayer) {
  const average = getBattingAverage(player);
  const strikeRate = getStrikeRate(player);
  const runsPerMatch =
    player.stats.matches > 0
      ? player.stats.runs / player.stats.matches
      : 0;

  const averageScore = average === null
    ? 0
    : normalize(average, 15, 50);

  const strikeRateScore = strikeRate === null
    ? 0
    : normalize(strikeRate, 95, 165);

  const volumeScore = normalize(runsPerMatch, 10, 45);
  const highestScore = normalize(player.stats.highestScore, 30, 120);

  const roleWeight =
    player.role === "BAT" ? 1 :
    player.role === "WK" ? 0.96 :
    player.role === "AR" ? 0.9 :
    0.3;

  return (
    (
      averageScore * 0.35 +
      strikeRateScore * 0.3 +
      volumeScore * 0.2 +
      highestScore * 0.15
    ) *
    roleWeight
  );
}

function bowlingQuality(player: IPLPlayer) {
  const wicketsPerMatch =
    player.stats.matches > 0
      ? player.stats.wickets / player.stats.matches
      : 0;

  const bowlingAverage = getBowlingAverage(player);
  const economy = getEconomyRate(player);

  const bowlingStrikeRate =
    player.stats.wickets > 0
      ? player.stats.ballsBowled / player.stats.wickets
      : null;

  const wicketsScore = normalize(wicketsPerMatch, 0.3, 2.2);

  const averageScore = bowlingAverage === null
    ? 0
    : inverseNormalize(bowlingAverage, 18, 35);

  const economyScore = economy === null
    ? 0
    : inverseNormalize(economy, 5.5, 9);

  const strikeRateScore = bowlingStrikeRate === null
    ? 0
    : inverseNormalize(bowlingStrikeRate, 14, 30);

  const roleWeight =
    player.role === "BOWL" ? 1 :
    player.role === "AR" ? 0.9 :
    0.15;

  return (
    (
      wicketsScore * 0.35 +
      averageScore * 0.25 +
      economyScore * 0.25 +
      strikeRateScore * 0.15
    ) *
    roleWeight
  );
}

function averageTop(values: number[], count: number) {
  const sorted = [...values].sort((a, b) => b - a).slice(0, count);
  if (!sorted.length) return 0;
  return sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
}

function calculateBattingPoints(players: IPLPlayer[]) {
  const quality = averageTop(
    players.map(battingQuality),
    7
  );

  return Math.round(quality * BATTING_MAX);
}

function calculateBowlingPoints(players: IPLPlayer[]) {
  const quality = averageTop(
    players.map(bowlingQuality),
    5
  );

  return Math.round(quality * BOWLING_MAX);
}

function calculateBalancePoints(players: IPLPlayer[]) {
  const counts = {
    WK: players.filter((p) => p.role === "WK").length,
    BAT: players.filter((p) => p.role === "BAT").length,
    AR: players.filter((p) => p.role === "AR").length,
    BOWL: players.filter((p) => p.role === "BOWL").length,
  };

  if (players.length !== 11) return 0;

  const bowlingOptions = counts.AR + counts.BOWL;

  // The XI validation rules are already enforced during selection.
  // This score rewards useful depth without imposing arbitrary maxima.
  const battingDepth = clamp((counts.WK + counts.BAT + counts.AR - 6) / 3);
  const bowlingDepth = clamp((bowlingOptions - 5) / 2);

  const roleSpread =
    counts.BAT >= 4 &&
    counts.AR >= 1 &&
    counts.BOWL >= 3 &&
    counts.WK >= 1
      ? 1
      : 0;

  return Math.round(
    (
      0.35 * battingDepth +
      0.35 * bowlingDepth +
      0.30 * roleSpread
    ) * BALANCE_MAX
  );
}

function calculateConditionPoints(
  players: IPLPlayer[],
  pitch: PitchProfile | null,
  battingPoints: number,
  bowlingPoints: number
) {
  if (!pitch) return Math.round(CONDITIONS_MAX * 0.5);

  const battingStrength = battingPoints / BATTING_MAX;
  const bowlingStrength = bowlingPoints / BOWLING_MAX;

  // We do not invent player bowling styles. Instead, conditions reward
  // having genuine batting and bowling strength on the supplied surface.
  const battingFit = battingStrength * (pitch.batting / 100);
  const bowlingFit =
    bowlingStrength *
    ((pitch.pace + pitch.spin) / 200);

  const dewAdjustment =
    pitch.dew >= 70
      ? battingStrength * 0.15
      : pitch.dew <= 35
        ? bowlingStrength * 0.1
        : 0;

  const roleDiversity =
    new Set(players.map((player) => player.role)).size / 4;

  const conditionQuality = clamp(
    battingFit * 0.42 +
    bowlingFit * 0.42 +
    dewAdjustment +
    roleDiversity * 0.16
  );

  return Math.round(conditionQuality * CONDITIONS_MAX);
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function winProbability(teamStrength: number, opponentStrength: number) {
  const probability =
    1 /
    (1 + Math.exp(-(teamStrength - opponentStrength + 2) / 8));

  return clamp(probability, 0.03, 0.97);
}

function simulateMatches(
  teamStrength: number,
  players: IPLPlayer[],
  pitch: PitchProfile | null,
  challengeId: string
): MatchResult[] {
  const seedInput = [
    challengeId,
    pitch?.id ?? "no-pitch",
    ...players.map((player) => player.id).sort(),
  ].join("|");

  const random = seededRandom(hashString(seedInput));

  return CHALLENGE_OPPONENT_STRENGTHS.map(
    (opponentStrength, index) => {
      const probability =
        winProbability(teamStrength, opponentStrength);

      return {
        match: index + 1,
        opponentStrength,
        winProbability: Number(probability.toFixed(3)),
        result: random() < probability ? "W" : "L",
      };
    }
  );
}

export function evaluateXI({
  players,
  pitch,
  challengeId,
}: EvaluateXIInput): XIEngineResult {
  const batting = calculateBattingPoints(players);
  const bowling = calculateBowlingPoints(players);
  const balance = calculateBalancePoints(players);
  const conditions = calculateConditionPoints(
    players,
    pitch,
    batting,
    bowling
  );

  const breakdown: ScoreBreakdown = {
    batting,
    bowling,
    balance,
    conditions,
  };

  const score = Math.min(
    SCORE_MAX,
    Math.max(
      0,
      batting + bowling + balance + conditions
    )
  );

  const teamStrength = score;

  const matches = simulateMatches(
    teamStrength,
    players,
    pitch,
    challengeId
  );

  const wins = matches.filter(
    (match) => match.result === "W"
  ).length;

  return {
    score,
    breakdown,
    teamStrength,
    wins,
    losses: IPL_CHALLENGE_MATCHES - wins,
    matches,
  };
}
