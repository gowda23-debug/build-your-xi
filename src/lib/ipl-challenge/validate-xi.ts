import type {
  IPLPlayer,
  RoleCounts,
  XIValidation,
} from "@/types/ipl";

const XI_SIZE = 11;

const MIN_WK = 1;
const MIN_BAT = 4;
const MIN_AR = 1;
const MIN_BOWL = 3;
const MIN_BOWLING_OPTIONS = 5;

/**
 * Count players by role.
 */
export function getRoleCounts(
  players: IPLPlayer[]
): RoleCounts {
  return players.reduce<RoleCounts>(
    (counts, player) => {
      counts[player.role] += 1;
      return counts;
    },
    {
      BAT: 0,
      WK: 0,
      AR: 0,
      BOWL: 0,
    }
  );
}

/**
 * Validate the completed Playing XI.
 *
 * Rules:
 * - Exactly 11 players
 * - At least 1 wicketkeeper
 * - At least 4 batters
 * - At least 1 all-rounder
 * - At least 3 bowlers
 * - At least 5 all-rounders + bowlers combined
 *
 * There is intentionally no artificial maximum for:
 * - wicketkeepers
 * - all-rounders
 *
 * The total XI size of 11 naturally limits every role.
 */
export function validateXI(
  players: IPLPlayer[]
): XIValidation {
  const errors: string[] = [];
  const counts = getRoleCounts(players);

  if (players.length !== XI_SIZE) {
    errors.push(
      "Your XI must contain exactly 11 players."
    );
  }

  if (counts.WK < MIN_WK) {
    errors.push(
      "Your XI must contain at least 1 wicketkeeper."
    );
  }

  if (counts.BAT < MIN_BAT) {
    errors.push(
      "Your XI must contain at least 4 batters."
    );
  }

  if (counts.AR < MIN_AR) {
    errors.push(
      "Your XI must contain at least 1 all-rounder."
    );
  }

  if (counts.BOWL < MIN_BOWL) {
    errors.push(
      "Your XI must contain at least 3 bowlers."
    );
  }

  const bowlingOptions =
    counts.AR + counts.BOWL;

  if (bowlingOptions < MIN_BOWLING_OPTIONS) {
    errors.push(
      "Your XI must contain at least 5 all-rounders and bowlers combined."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    counts,
  };
}

/**
 * Check whether a player can be added without making
 * it impossible to complete a valid 11-player XI.
 *
 * This deliberately does NOT impose arbitrary maximums
 * on wicketkeepers or all-rounders.
 */
export function canAddPlayer(
  players: IPLPlayer[],
  player: IPLPlayer
): boolean {
  // XI is already full.
  if (players.length >= XI_SIZE) {
    return false;
  }

  // Prevent duplicate players.
  if (
    players.some(
      (selectedPlayer) =>
        selectedPlayer.id === player.id
    )
  ) {
    return false;
  }

  const nextPlayers = [
    ...players,
    player,
  ];

  const counts = getRoleCounts(nextPlayers);

  const remainingSlots =
    XI_SIZE - nextPlayers.length;

  /*
   * Work out the minimum number of additional
   * players required for each mandatory role.
   */
  const wicketkeeperDeficit = Math.max(
    0,
    MIN_WK - counts.WK
  );

  const batterDeficit = Math.max(
    0,
    MIN_BAT - counts.BAT
  );

  const allRounderDeficit = Math.max(
    0,
    MIN_AR - counts.AR
  );

  const bowlerDeficit = Math.max(
    0,
    MIN_BOWL - counts.BOWL
  );

  /*
   * AR and BOWL are separate roles, but together
   * they must also provide at least five bowling options.
   *
   * Therefore we need enough players to satisfy:
   *
   *   AR minimum
   *   BOWL minimum
   *   AR + BOWL minimum
   */
  const bowlingOptionsDeficit = Math.max(
    0,
    MIN_BOWLING_OPTIONS -
      (counts.AR + counts.BOWL)
  );

  const minimumARAndBowlPlayers =
    Math.max(
      allRounderDeficit +
        bowlerDeficit,
      bowlingOptionsDeficit
    );

  const minimumPlayersRequired =
    wicketkeeperDeficit +
    batterDeficit +
    minimumARAndBowlPlayers;

  /*
   * If the remaining slots cannot satisfy the
   * mandatory requirements, reject this selection.
   */
  if (
    minimumPlayersRequired >
    remainingSlots
  ) {
    return false;
  }

  return true;
}