import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic =
  "force-dynamic";

type LeaderboardMode =
  | "ipl"
  | "world";

type LeaderboardPeriod =
  | "all"
  | "weekly"
  | "daily";

type GameScoreRow = {
  user_id: string;
  game_mode: string;
  score: number | string;
  created_at: string;
  result: StoredResult | null;
};

type ProfileRow = {
  id: string;
  display_name:
    | string
    | null;
  gamer_tag:
    | string
    | null;
};

type AggregatePlayer = {
  userId: string;
  totalScore: number;
  gamesPlayed: number;
  latestGameAt: string;
};

type RankedPlayer =
  AggregatePlayer & {
    name: string;
    rank: number;
  };

type StoredResult = {
  version?: number;
  score?: number;
  wins?: number;
  losses?: number;
  [key: string]: unknown;
};

function isLeaderboardMode(
  value: string | null
): value is LeaderboardMode {
  return (
    value === "ipl" ||
    value === "world"
  );
}

function isLeaderboardPeriod(
  value: string | null
): value is LeaderboardPeriod {
  return (
    value === "all" ||
    value === "weekly" ||
    value === "daily"
  );
}

/*
 * UTC boundaries keep Daily/Weekly rankings
 * deterministic for every player.
 */
function getPeriodStart(
  period: LeaderboardPeriod
): string | null {
  if (
    period === "all"
  ) {
    return null;
  }

  const now =
    new Date();

  const start =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      )
    );

  if (
    period ===
    "weekly"
  ) {
    const day =
      start.getUTCDay();

    const daysSinceMonday =
      day === 0
        ? 6
        : day - 1;

    start.setUTCDate(
      start.getUTCDate() -
        daysSinceMonday
    );
  }

  return start.toISOString();
}

async function loadGameScores(
  mode: LeaderboardMode,
  period: LeaderboardPeriod
): Promise<GameScoreRow[]> {
  const rows:
    GameScoreRow[] = [];

  const PAGE_SIZE =
    1000;

  const periodStart =
    getPeriodStart(
      period
    );

  let from = 0;

  while (true) {
    let query =
      supabaseAdmin
        .from(
          "game_scores"
        )
        .select(
          `
          user_id,
          game_mode,
          score,
          created_at,
          result
          `
        )
        .eq(
          "game_mode",
          mode
        )
        .order(
          "created_at",
          {
            ascending:
              true,
          }
        )
        .range(
          from,
          from +
            PAGE_SIZE -
            1
        );

    if (
      periodStart
    ) {
      query =
        query.gte(
          "created_at",
          periodStart
        );
    }

    const {
      data,
      error,
    } =
      await query;

    if (error) {
      throw error;
    }

    const page =
      (data ??
        []) as GameScoreRow[];

    rows.push(
      ...page
    );

    if (
      page.length <
      PAGE_SIZE
    ) {
      break;
    }

    from +=
      PAGE_SIZE;
  }

  return rows;
}

export async function GET(
  request: Request
) {
  try {
    /*
     * ============================================================
     * OPTIONAL AUTHENTICATION
     * ============================================================
     *
     * The leaderboard itself is public.
     *
     * We only try to determine the current player
     * when an authenticated session exists.
     *
     * Anonymous users are deliberately treated as
     * guests and do not get a current-player row.
     */

    const supabase =
      await createClient();

    const {
      data: {
        user,
      },
    } =
      await supabase.auth.getUser();

    const currentUserId =
      user &&
      !user.is_anonymous
        ? user.id
        : null;

    /*
     * ============================================================
     * QUERY PARAMETERS
     * ============================================================
     */

    const url =
      new URL(
        request.url
      );

    const requestedMode =
      url.searchParams.get(
        "mode"
      );

    const requestedPeriod =
      url.searchParams.get(
        "period"
      );

    const mode:
      LeaderboardMode =
      isLeaderboardMode(
        requestedMode
      )
        ? requestedMode
        : "ipl";

    const period:
      LeaderboardPeriod =
      isLeaderboardPeriod(
        requestedPeriod
      )
        ? requestedPeriod
        : "all";

    /*
     * ============================================================
     * LOAD SCORES
     * ============================================================
     */

    const scoreRows =
      await loadGameScores(
        mode,
        period
      );

    /*
     * ============================================================
     * AGGREGATE PLAYER TOTALS
     * ============================================================
     */

    const aggregateMap =
      new Map<
        string,
        AggregatePlayer
      >();

    for (
      const row of
        scoreRows
    ) {
      const resultScore =
        Number(
          row.result?.score
        );

      const storedScore =
        Number(
          row.score
        );

      const score =
        Number.isFinite(
          resultScore
        )
          ? resultScore
          : storedScore;

      if (
        !Number.isFinite(
          score
        )
      ) {
        continue;
      }

      const existing =
        aggregateMap.get(
          row.user_id
        );

      if (!existing) {
        aggregateMap.set(
          row.user_id,
          {
            userId:
              row.user_id,

            totalScore:
              score,

            gamesPlayed:
              1,

            latestGameAt:
              row.created_at,
          }
        );

        continue;
      }

      existing.totalScore +=
        score;

      existing.gamesPlayed +=
        1;

      if (
        new Date(
          row.created_at
        ).getTime() >
        new Date(
          existing.latestGameAt
        ).getTime()
      ) {
        existing.latestGameAt =
          row.created_at;
      }
    }

    /*
     * ============================================================
     * SORT
     * ============================================================
     */

    const sortedPlayers =
      Array.from(
        aggregateMap.values()
      ).sort(
        (
          a,
          b
        ) => {
          if (
            b.totalScore !==
            a.totalScore
          ) {
            return (
              b.totalScore -
              a.totalScore
            );
          }

          if (
            b.gamesPlayed !==
            a.gamesPlayed
          ) {
            return (
              b.gamesPlayed -
              a.gamesPlayed
            );
          }

          const latestDifference =
            new Date(
              b.latestGameAt
            ).getTime() -
            new Date(
              a.latestGameAt
            ).getTime();

          if (
            latestDifference !==
            0
          ) {
            return latestDifference;
          }

          return a.userId.localeCompare(
            b.userId
          );
        }
      );

    const rankedPlayers =
      sortedPlayers.map(
        (
          player,
          index
        ) => ({
          ...player,
          rank:
            index + 1,
        })
      );

    const totalPlayers =
      rankedPlayers.length;

    /*
     * ============================================================
     * TOP 20
     * ============================================================
     */

    const top20 =
      rankedPlayers.slice(
        0,
        20
      );

    /*
     * ============================================================
     * LOAD PUBLIC PROFILE DATA
     * ============================================================
     */

    const profileUserIds =
      Array.from(
        new Set([
          ...top20.map(
            (player) =>
              player.userId
          ),

          ...(currentUserId
            ? [currentUserId]
            : []),
        ])
      );

    let profiles:
      ProfileRow[] = [];

    if (
      profileUserIds.length >
      0
    ) {
      const {
        data,
        error,
      } =
        await supabaseAdmin
          .from(
            "profiles"
          )
          .select(
            `
            id,
            display_name,
            gamer_tag
            `
          )
          .in(
            "id",
            profileUserIds
          );

      if (error) {
        throw error;
      }

      profiles =
        (data ??
          []) as ProfileRow[];
    }

    const profileMap =
      new Map<
        string,
        ProfileRow
      >();

    for (
      const profile of
        profiles
    ) {
      profileMap.set(
        profile.id,
        profile
      );
    }

    function getPlayerName(
      userId: string
    ) {
      const profile =
        profileMap.get(
          userId
        );

      return (
        profile?.gamer_tag ||
        profile?.display_name ||
        "Player"
      );
    }

    const leaderboard =
      top20.map(
        (player) => ({
          userId:
            player.userId,

          name:
            getPlayerName(
              player.userId
            ),

          totalScore:
            player.totalScore,

          gamesPlayed:
            player.gamesPlayed,

          latestGameAt:
            player.latestGameAt,

          rank:
            player.rank,
        })
      );

    /*
     * ============================================================
     * CURRENT PLAYER
     * ============================================================
     */

    let currentPlayer:
      | {
          userId: string;
          name: string;
          totalScore: number;
          gamesPlayed: number;
          latestGameAt: string;
          rank: number;
          percentage: number;
        }
      | null = null;

    if (
      currentUserId
    ) {
      const current =
        rankedPlayers.find(
          (player) =>
            player.userId ===
            currentUserId
        );

      if (current) {
        currentPlayer = {
          userId:
            current.userId,

          name:
            getPlayerName(
              current.userId
            ),

          totalScore:
            current.totalScore,

          gamesPlayed:
            current.gamesPlayed,

          latestGameAt:
            current.latestGameAt,

          rank:
            current.rank,

          percentage:
            totalPlayers >
            0
              ? Math.ceil(
                  (current.rank /
                    totalPlayers) *
                    100
                )
              : 0,
        };
      }
    }

    return NextResponse.json(
      {
        mode,
        period,

        totalPlayers,

        leaderboard,

        currentPlayer,
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store",
        },
      }
    );
  } catch (
    error
  ) {
    console.error(
      "Leaderboard API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load the leaderboard.",
      },
      {
        status: 500,
      }
    );
  }
}