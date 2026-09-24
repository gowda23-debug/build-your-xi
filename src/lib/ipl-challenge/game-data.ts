/**
 * The IPL Challenge is a 14-match league run.
 *
 * These are deliberately abstract opponent strengths for the first
 * client-side simulation version. They are not historical team ratings.
 *
 * The next engine phase can replace these with real opponent/team-season
 * strength data from Supabase without changing the result UI.
 */
export const IPL_CHALLENGE_MATCHES = 14;

export const CHALLENGE_OPPONENT_STRENGTHS = [
  72, 78, 70, 84, 76, 68, 82,
  74, 79, 71, 86, 73, 80, 75,
] as const;

export const SCORE_MAX = 100;

export const BATTING_MAX = 35;
export const BOWLING_MAX = 35;
export const BALANCE_MAX = 15;
export const CONDITIONS_MAX = 15;
