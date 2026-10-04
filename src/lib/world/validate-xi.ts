import type { WorldPlayer } from "@/types/world";

export type WorldXIValidationResult = {
  valid: boolean;
  errors: string[];
};

const MAX_PLAYERS = 11;

const MIN_WK = 1;
const MIN_BAT = 4;
const MIN_AR = 1;
const MIN_BOWL = 3;
const MIN_AR_BOWL = 5;

function getRoleCounts(players: WorldPlayer[]) {
  return {
    WK: players.filter(
      (player) => player.role === "WK"
    ).length,

    BAT: players.filter(
      (player) => player.role === "BAT"
    ).length,

    AR: players.filter(
      (player) => player.role === "AR"
    ).length,

    BOWL: players.filter(
      (player) => player.role === "BOWL"
    ).length,
  };
}

/**
 * Validates the complete World Playing XI.
 *
 * Rules:
 * - Exactly 11 players
 * - Minimum 1 WK
 * - Minimum 4 BAT
 * - Minimum 1 AR
 * - Minimum 3 BOWL
 * - AR + BOWL >= 5
 * - No duplicate players
 */
export function validateWorldXI(
  players: WorldPlayer[]
): WorldXIValidationResult {
  const errors: string[] = [];

  if (players.length !== MAX_PLAYERS) {
    errors.push(
      `The World XI must contain exactly ${MAX_PLAYERS} players.`
    );
  }

  const playerIds = players.map(
    (player) => player.id
  );

  const uniquePlayerIds =
    new Set(playerIds);

  if (
    uniquePlayerIds.size !==
    playerIds.length
  ) {
    errors.push(
      "The World XI cannot contain duplicate players."
    );
  }

  const counts =
    getRoleCounts(players);

  if (counts.WK < MIN_WK) {
    errors.push(
      `The World XI requires at least ${MIN_WK} wicketkeeper.`
    );
  }

  if (counts.BAT < MIN_BAT) {
    errors.push(
      `The World XI requires at least ${MIN_BAT} batters.`
    );
  }

  if (counts.AR < MIN_AR) {
    errors.push(
      `The World XI requires at least ${MIN_AR} all-rounder.`
    );
  }

  if (counts.BOWL < MIN_BOWL) {
    errors.push(
      `The World XI requires at least ${MIN_BOWL} bowlers.`
    );
  }

  if (
    counts.AR + counts.BOWL <
    MIN_AR_BOWL
  ) {
    errors.push(
      `The World XI requires at least ${MIN_AR_BOWL} players from the all-rounder and bowler groups combined.`
    );
  }

  return {
    valid:
      errors.length === 0,
    errors,
  };
}

/**
 * Determines whether a player can be added without making
 * it mathematically impossible to construct a valid XI.
 *
 * This is a UI helper only.
 * The server performs the authoritative validation again.
 */
export function canAddWorldPlayer(
  selectedPlayers: WorldPlayer[],
  player: WorldPlayer
): boolean {
  if (
    selectedPlayers.length >=
    MAX_PLAYERS
  ) {
    return false;
  }

  if (
    selectedPlayers.some(
      (selected) =>
        selected.id === player.id
    )
  ) {
    return false;
  }

  const nextPlayers = [
    ...selectedPlayers,
    player,
  ];

  const counts =
    getRoleCounts(nextPlayers);

  const remainingSlots =
    MAX_PLAYERS -
    nextPlayers.length;

  /*
   * Work out the minimum number of slots
   * still required for each mandatory role.
   */
  const wkDeficit = Math.max(
    0,
    MIN_WK - counts.WK
  );

  const batDeficit = Math.max(
    0,
    MIN_BAT - counts.BAT
  );

  const arDeficit = Math.max(
    0,
    MIN_AR - counts.AR
  );

  const bowlDeficit = Math.max(
    0,
    MIN_BOWL - counts.BOWL
  );

  /*
   * AR/BOWL combined requirement can be
   * satisfied by either an AR or a BOWL.
   *
   * Individual AR/BOWL requirements may
   * already require more slots than the
   * combined requirement, so use whichever
   * requirement is larger.
   */
  const arBowlCombinedDeficit =
    Math.max(
      0,
      MIN_AR_BOWL -
        (counts.AR +
          counts.BOWL)
    );

  const arBowlRoleDeficit =
    arDeficit +
    bowlDeficit;

  const requiredRemainingSlots =
    wkDeficit +
    batDeficit +
    Math.max(
      arBowlRoleDeficit,
      arBowlCombinedDeficit
    );

  /*
   * If there aren't enough remaining slots
   * to satisfy the rules, reject this player.
   */
  if (
    requiredRemainingSlots >
    remainingSlots
  ) {
    return false;
  }

  return true;
}