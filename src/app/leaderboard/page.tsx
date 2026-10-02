"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  Medal,
  Trophy,
  Users,
} from "lucide-react";

type LeaderboardMode =
  | "ipl"
  | "world";

type LeaderboardPeriod =
  | "all"
  | "weekly"
  | "daily";

type LeaderboardPlayer = {
  userId: string;
  name: string;
  totalScore: number;
  gamesPlayed: number;
  latestGameAt: string;
  rank: number;
};

type CurrentPlayer = LeaderboardPlayer & {
  percentage: number;
};

type LeaderboardResponse = {
  mode: LeaderboardMode;
  period: LeaderboardPeriod;
  totalPlayers: number;
  leaderboard: LeaderboardPlayer[];
  currentPlayer: CurrentPlayer | null;
};

const MODE_OPTIONS: {
  value: LeaderboardMode;
  label: string;
}[] = [
  {
    value: "ipl",
    label: "IPL Challenge",
  },
  {
    value: "world",
    label: "International World Domination",
  },
];

const PERIOD_OPTIONS: {
  value: LeaderboardPeriod;
  label: string;
}[] = [
  {
    value: "all",
    label: "All Time",
  },
  {
    value: "weekly",
    label: "Weekly",
  },
  {
    value: "daily",
    label: "Daily",
  },
];

function formatPoints(value: number) {
  return value.toLocaleString("en-IN");
}

function getInitials(name: string) {
  const cleanName = name.trim();

  if (!cleanName) {
    return "P";
  }

  const parts = cleanName
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getPodiumPlayer(
  players: LeaderboardPlayer[],
  rank: number
) {
  return (
    players.find(
      (player) => player.rank === rank
    ) ?? null
  );
}

function PodiumPlayer({
  player,
  position,
}: {
  player: LeaderboardPlayer;
  position: 1 | 2 | 3;
}) {
  const initials = getInitials(
    player.name
  );

  const isFirst = position === 1;

  return (
    <div
      className={`flex min-w-0 flex-col items-center text-center ${
        isFirst
          ? "order-2"
          : position === 2
            ? "order-1"
            : "order-3"
      }`}
    >
      <div
        className={`flex items-center justify-center rounded-full border-2 ${
          isFirst
            ? "h-20 w-20 border-[var(--accent)] bg-[var(--accent)]/15 text-xl"
            : "h-14 w-14 border-white/15 bg-white/[0.04] text-sm"
        } font-black`}
      >
        {initials}
      </div>

      <p
        className={`mt-2 max-w-[120px] truncate font-black ${
          isFirst
            ? "text-sm"
            : "text-xs"
        }`}
      >
        {player.name}
      </p>

      <p
        className={`mt-1 font-bold text-[var(--accent)] ${
          isFirst
            ? "text-xs"
            : "text-[10px]"
        }`}
      >
        {formatPoints(
          player.totalScore
        )}{" "}
        pts
      </p>

      <div
        className={`mt-2 flex items-center justify-center font-black ${
          isFirst
            ? "h-10 w-20 bg-[var(--accent)]/20 text-lg text-[var(--accent)]"
            : "h-8 w-14 bg-white/[0.05] text-sm text-[var(--muted)]"
        } rounded-t-lg`}
      >
        {position}
      </div>
    </div>
  );
}

function RankedPlayer({
  player,
}: {
  player: LeaderboardPlayer;
}) {
  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/[0.07] px-4 py-3 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:px-5">
      <div className="text-center text-xs font-black text-[var(--muted)]">
        {player.rank}
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/[0.08] text-[10px] font-black text-[var(--accent)]">
          {getInitials(player.name)}
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-black">
            {player.name}
          </p>

          <p className="mt-0.5 text-[10px] text-[var(--muted)]">
            {player.gamesPlayed}{" "}
            {player.gamesPlayed === 1
              ? "game"
              : "games"}
          </p>
        </div>
      </div>

      <div className="text-right">
        <p className="text-sm font-black text-[var(--accent)]">
          {formatPoints(
            player.totalScore
          )}
        </p>

        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
          pts
        </p>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const [mode, setMode] =
    useState<LeaderboardMode>(
      "ipl"
    );

  const [period, setPeriod] =
    useState<LeaderboardPeriod>(
      "all"
    );

  const [data, setData] =
    useState<LeaderboardResponse | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      setLoading(true);
      setError("");

      try {
        const response =
          await fetch(
            `/api/leaderboard?mode=${mode}&period=${period}`,
            {
              method: "GET",
              cache: "no-store",
            }
          );

        const body =
          await response
            .json()
            .catch(() => null);

        if (!response.ok) {
          throw new Error(
            body?.error ??
              "Unable to load the leaderboard."
          );
        }

        if (cancelled) {
          return;
        }

        setData(
          body as LeaderboardResponse
        );
      } catch (err) {
        if (cancelled) {
          return;
        }

        setData(null);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load the leaderboard."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, [mode, period]);

  const topThree = useMemo(() => {
    if (!data) {
      return {
        first: null,
        second: null,
        third: null,
      };
    }

    return {
      first: getPodiumPlayer(
        data.leaderboard,
        1
      ),
      second: getPodiumPlayer(
        data.leaderboard,
        2
      ),
      third: getPodiumPlayer(
        data.leaderboard,
        3
      ),
    };
  }, [data]);

  const rankedPlayers =
    useMemo(() => {
      return (
        data?.leaderboard.filter(
          (player) =>
            player.rank > 3
        ) ?? []
      );
    }, [data]);

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[var(--accent)]/[0.035] blur-3xl" />
      </div>

      <section className="relative mx-auto w-full max-w-3xl px-4 pb-32 pt-8 sm:px-6 sm:pt-10">
        <div className="text-center">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent)]/10">
            <Trophy className="h-5 w-5 text-[var(--accent)]" />
          </div>

          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            Leaderboard
          </h1>

          <p className="mt-2 text-sm text-[var(--muted)]">
            Compete across Build Your XI.
          </p>
        </div>

        {/* MODE */}

        <div className="mt-8 rounded-xl border border-white/10 bg-black/10 p-1">
          <div className="grid grid-cols-2 gap-1">
            {MODE_OPTIONS.map(
              (option) => {
                const active =
                  mode ===
                  option.value;

                return (
                  <button
                    key={
                      option.value
                    }
                    type="button"
                    onClick={() =>
                      setMode(
                        option.value
                      )
                    }
                    className={`rounded-lg px-3 py-3 text-xs font-black transition ${
                      active
                        ? "bg-[var(--accent)] text-black"
                        : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* PERIOD */}

        <div className="mt-3 flex justify-center gap-2">
          {PERIOD_OPTIONS.map(
            (option) => {
              const active =
                period ===
                option.value;

              return (
                <button
                  key={
                    option.value
                  }
                  type="button"
                  onClick={() =>
                    setPeriod(
                      option.value
                    )
                  }
                  className={`rounded-lg border px-4 py-2 text-xs font-black transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                      : "border-white/10 text-[var(--muted)] hover:border-white/20 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              );
            }
          )}
        </div>

        {/* LOADING */}

        {loading && (
          <div className="card mt-8 flex min-h-[320px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[var(--accent)]" />

              <p className="mt-4 text-sm font-bold text-[var(--muted)]">
                Loading leaderboard...
              </p>
            </div>
          </div>
        )}

        {/* ERROR */}

        {!loading && error && (
          <div className="card mt-8 p-8 text-center">
            <Trophy className="mx-auto h-8 w-8 text-red-300" />

            <h2 className="mt-4 text-lg font-black">
              Unable to load leaderboard
            </h2>

            <p className="mt-2 text-sm text-[var(--muted)]">
              {error}
            </p>
          </div>
        )}

        {/* EMPTY */}

        {!loading &&
          !error &&
          data &&
          data.leaderboard.length ===
            0 && (
            <div className="card mt-8 p-10 text-center">
              <Users className="mx-auto h-9 w-9 text-[var(--accent)]" />

              <h2 className="mt-4 text-lg font-black">
                No scores yet
              </h2>

              <p className="mt-2 text-sm text-[var(--muted)]">
                Complete a game to appear on the leaderboard.
              </p>
            </div>
          )}

        {/* LEADERBOARD */}

        {!loading &&
          !error &&
          data &&
          data.leaderboard.length >
            0 && (
            <>
              {/* PODIUM */}

              {topThree.first &&
                topThree.second &&
                topThree.third && (
                  <section className="card mt-8 overflow-hidden">
                    <div className="flex items-end justify-center gap-4 px-4 pb-0 pt-8 sm:gap-8">
                      <PodiumPlayer
                        player={
                          topThree.second
                        }
                        position={2}
                      />

                      <PodiumPlayer
                        player={
                          topThree.first
                        }
                        position={1}
                      />

                      <PodiumPlayer
                        player={
                          topThree.third
                        }
                        position={3}
                      />
                    </div>
                  </section>
                )}

              {/* RANKED LIST */}

              <section className="card mt-4 overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">
                    Top 20
                  </p>

                  <p className="text-[10px] font-bold text-[var(--muted)]">
                    Cumulative Points
                  </p>
                </div>

                {rankedPlayers.length >
                0 ? (
                  rankedPlayers.map(
                    (player) => (
                      <RankedPlayer
                        key={
                          player.userId
                        }
                        player={
                          player
                        }
                      />
                    )
                  )
                ) : (
                  <div className="px-5 py-6 text-center text-xs text-[var(--muted)]">
                    The top three are currently the only ranked players.
                  </div>
                )}
              </section>
            </>
          )}
      </section>

      {/* CURRENT PLAYER */}

      {!loading &&
        !error &&
        data?.currentPlayer && (
          <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2">
            <div className="grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[var(--accent)]/40 bg-[#07130f]/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
              <div className="text-center text-xs font-black text-[var(--muted)]">
                #{data.currentPlayer.rank}
              </div>

              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[10px] font-black text-[var(--accent)]">
                  {getInitials(
                    data.currentPlayer.name
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black">
                    You
                  </p>

                  <p className="text-[10px] text-[var(--muted)]">
                    Top{" "}
                    {
                      data
                        .currentPlayer
                        .percentage
                    }%
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-sm font-black text-[var(--accent)]">
                  {formatPoints(
                    data.currentPlayer
                      .totalScore
                  )}
                </p>

                <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  pts
                </p>
              </div>
            </div>
          </div>
        )}
    </main>
  );
}