import type {
  IPLPlayer,
  RoleCounts,
  XIValidation,
} from "@/types/ipl";

export function getRoleCounts(
  players: IPLPlayer[]
): RoleCounts {
  return players.reduce(
    (
      counts,
      player
    ) => {
      counts[
        player.role
      ] += 1;

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

export function validateXI(
  players: IPLPlayer[]
): XIValidation {
  const errors: string[] =
    [];

  const counts =
    getRoleCounts(
      players
    );

  if (
    players.length !== 11
  ) {
    errors.push(
      "Your XI must contain exactly 11 players."
    );
  }

  if (
    counts.WK !== 1
  ) {
    errors.push(
      "Your XI must contain exactly 1 wicketkeeper."
    );
  }

  if (
    counts.AR < 1
  ) {
    errors.push(
      "Your XI must contain at least 1 all-rounder."
    );
  }

  if (
    counts.BAT < 4 ||
    counts.BAT > 6
  ) {
    errors.push(
      "Your XI must contain between 4 and 6 batters."
    );
  }

  if (
    counts.BOWL < 3 ||
    counts.BOWL > 5
  ) {
    errors.push(
      "Your XI must contain between 3 and 5 bowlers."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,

    counts,
  };
}

export function canAddPlayer(
  players: IPLPlayer[],
  player: IPLPlayer
) {
  if (
    players.length >= 11
  ) {
    return false;
  }

  if (
    players.some(
      (
        selectedPlayer
      ) =>
        selectedPlayer.id ===
        player.id
    )
  ) {
    return false;
  }

  const counts =
    getRoleCounts(
      players
    );

  if (
    player.role === "WK" &&
    counts.WK >= 1
  ) {
    return false;
  }

  if (
    player.role === "BAT" &&
    counts.BAT >= 6
  ) {
    return false;
  }

  if (
    player.role === "BOWL" &&
    counts.BOWL >= 5
  ) {
    return false;
  }

  return true;
}