import type {
  IPLPlayer,
} from "@/types/ipl";

export function getBattingAverage(
  player: IPLPlayer
) {
  const {
    runs,
    dismissals,
  } = player.stats;

  if (
    dismissals <= 0
  ) {
    return null;
  }

  return Number(
    (
      runs /
      dismissals
    ).toFixed(2)
  );
}

export function getStrikeRate(
  player: IPLPlayer
) {
  const {
    runs,
    ballsFaced,
  } = player.stats;

  if (
    ballsFaced <= 0
  ) {
    return null;
  }

  return Number(
    (
      runs /
      ballsFaced *
      100
    ).toFixed(2)
  );
}

export function getBowlingAverage(
  player: IPLPlayer
) {
  const {
    runsConceded,
    wickets,
  } = player.stats;

  if (
    wickets <= 0
  ) {
    return null;
  }

  return Number(
    (
      runsConceded /
      wickets
    ).toFixed(2)
  );
}

export function getEconomyRate(
  player: IPLPlayer
) {
  const {
    runsConceded,
    ballsBowled,
  } = player.stats;

  if (
    ballsBowled <= 0
  ) {
    return null;
  }

  return Number(
    (
      runsConceded /
      (ballsBowled / 6)
    ).toFixed(2)
  );
}