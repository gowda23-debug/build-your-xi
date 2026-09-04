import type {
  PitchProfile,
} from "@/types/ipl";

export const PITCHES: PitchProfile[] = [
  {
    id: "batting-paradise",

    title:
      "Batting Paradise",

    type:
      "BAT",

    summary:
      "A hard surface with true bounce and quick value for shots.",

    batting:
      95,

    pace:
      60,

    spin:
      35,

    dew:
      70,

    strategy:
      "Prioritise aggressive top-order batting and players with strong strike rates.",
  },

  {
    id: "pace-and-bounce",

    title:
      "Pace & Bounce",

    type:
      "PACE",

    summary:
      "Extra carry and pace make timing difficult early in the innings.",

    batting:
      65,

    pace:
      90,

    spin:
      45,

    dew:
      50,

    strategy:
      "Fast bowlers and high-quality batters capable of handling bounce become more valuable.",
  },

  {
    id: "slow-turner",

    title:
      "Slow Turner",

    type:
      "SPIN",

    summary:
      "A dry surface that slows down and increasingly rewards spin.",

    batting:
      55,

    pace:
      45,

    spin:
      95,

    dew:
      30,

    strategy:
      "Prioritise quality spin options and batters capable of rotating the strike.",
  },

  {
    id: "balanced",

    title:
      "Balanced Surface",

    type:
      "BALANCED",

    summary:
      "A fair surface offering opportunities to both batters and bowlers.",

    batting:
      75,

    pace:
      70,

    spin:
      65,

    dew:
      50,

    strategy:
      "Build a balanced XI without overloading one particular skill set.",
  },
];

export function getRandomPitch() {
  const index =
    Math.floor(
      Math.random() *
        PITCHES.length
    );

  return PITCHES[index];
}