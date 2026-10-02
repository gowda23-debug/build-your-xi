"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Edit3,
  Gamepad2,
  Medal,
  Trophy,
  TrendingUp,
} from "lucide-react";

type Player = {
  id: string;
  label: string;
  gamerTag: string;
  isGuest: boolean;
};

type GameType =
  | "IPL Challenge"
  | "World Domination";

type RecentGame = {
  id: string;

  gameType: GameType;

  score: number;

  record: string;

  date: string;

  details?: string[];

  isChallenge: boolean;

  challengeTitle:
  string | null;
};

type StatsResponse = {
  player: {
    id: string;
    displayName: string;
    gamerTag: string;
    isGuest: boolean;
  };

  stats: {
    gamesPlayed: number;
    bestScore: number | null;
    bestRecord: string | null;
  };

  recentGames: RecentGame[];
};

function formatScore(
  score: number | null
) {
  if (score === null) {
    return "—";
  }

  return Number.isInteger(score)
    ? score.toString()
    : score.toFixed(1);
}

function formatDate(
  value: string
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}

export default function StatsPage() {
  const [
    player,
    setPlayer,
  ] =
    useState<Player | null>(
      null
    );

  const [
    gamesPlayed,
    setGamesPlayed,
  ] =
    useState(0);

  const [
    bestScore,
    setBestScore,
  ] =
    useState<number | null>(
      null
    );

  const [
    bestRecord,
    setBestRecord,
  ] =
    useState<string | null>(
      null
    );

  const [
    recentGames,
    setRecentGames,
  ] =
    useState<RecentGame[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    expandedGame,
    setExpandedGame,
  ] =
    useState<string | null>(
      null
    );

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      setError("");

      try {
        const response =
          await fetch(
            "/api/stats",
            {
              method: "GET",
              cache: "no-store",
            }
          );

        const data =
          await response
            .json()
            .catch(
              () => null
            );

        if (!response.ok) {
          throw new Error(
            data?.error ??
            "Unable to load your statistics."
          );
        }

        if (
          cancelled
        ) {
          return;
        }

        const result =
          data as StatsResponse;

        setPlayer({
          id:
            result.player.id,

          label:
            result.player
              .displayName,

          gamerTag:
            result.player
              .gamerTag,

          isGuest:
            result.player
              .isGuest,
        });

        setGamesPlayed(
          result.stats
            .gamesPlayed
        );

        setBestScore(
          result.stats
            .bestScore
        );

        setBestRecord(
          result.stats
            .bestRecord
        );

        setRecentGames(
          result.recentGames
        );
      } catch (err) {
        if (
          cancelled
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load your statistics."
        );
      } finally {
        if (
          !cancelled
        ) {
          setLoading(false);
        }
      }
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[var(--muted)]">
          Loading your stats...
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-xl font-black">
            Unable to load your stats
          </h1>

          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {error}
          </p>

          <Link
            href="/home"
            className="btn btn-primary mt-6 inline-flex"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  if (!player) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-xl font-black">
            Unable to load your stats
          </h1>

          <p className="mt-3 text-sm text-[var(--muted)]">
            Please log in to view your Build Your XI statistics.
          </p>

          <Link
            href="/"
            className="btn btn-primary mt-6 inline-flex"
          >
            Go to Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex flex-1 overflow-hidden">
      {/* BACKGROUND */}

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-52 left-1/2 h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-[var(--accent)]/[0.04] blur-3xl" />

        <div className="absolute top-1/3 -left-64 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.02] blur-3xl" />

        <div className="absolute -bottom-64 -right-64 h-[560px] w-[560px] rounded-full bg-[var(--accent)]/[0.025] blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-4xl px-5 py-6 sm:px-6 md:py-8 lg:px-8">
        {/* BACK */}

        <Link
          href="/home"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent)]/30 hover:text-white"
        >
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        {/* HEADER */}

        <section className="mt-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent)]">
            Your Progress
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            My Stats
          </h1>

          <p className="mt-3 text-sm leading-6 text-[var(--muted)] sm:text-base">
            Track your Build Your XI journey and review your latest games.
          </p>
        </section>

        {/* PROFILE */}

        <section className="card mt-8 overflow-hidden">
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-black">
                  {player.gamerTag ||
                    player.label}
                </h2>

                {!player.isGuest && (
                  <Link
                    href="/profile"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-white/5 hover:text-[var(--accent)]"
                    aria-label="Edit profile"
                  >
                    <Edit3
                      size={15}
                    />
                  </Link>
                )}
              </div>

              <p className="mt-1 text-sm text-[var(--muted)]">
                {player.label}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  {player.isGuest
                    ? "Guest"
                    : "Registered Player"}
                </span>

                {!player.isGuest && (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-bold text-[var(--muted)]">
                    ID: {player.id}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* STAT CARDS */}

          <div className="grid border-t border-white/10 sm:grid-cols-3">
            <StatCard
              icon={
                <Trophy size={20} />
              }
              value={gamesPlayed.toString()}
              label="Games Played"
              className="border-b sm:border-b-0 sm:border-r"
            />

            <StatCard
              icon={
                <TrendingUp
                  size={20}
                />
              }
              value={formatScore(
                bestScore
              )}
              label="Best Score"
              className="border-b sm:border-b-0 sm:border-r"
            />

            <StatCard
              icon={
                <Medal size={20} />
              }
              value={
                bestRecord ??
                "—"
              }
              label="Best Record All Time"
            />
          </div>
        </section>

        {/* RECENT GAMES */}

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent)]">
                Game History
              </p>

              <h2 className="mt-2 text-2xl font-black">
                Recent Games
              </h2>

              <p className="mt-2 text-xs text-[var(--muted)]">
                Showing your 10 most recent completed games.
              </p>
            </div>

            <Gamepad2
              size={22}
              className="text-[var(--accent)]/60"
            />
          </div>

          {recentGames.length ===
            0 ? (
            <div className="card mt-5 flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-[var(--muted)]">
                <Gamepad2 size={24} />
              </div>

              <h3 className="mt-5 text-lg font-bold">
                No games played yet
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                Your completed IPL Challenge and World Domination games will appear here.
              </p>

              <Link
                href="/home"
                className="btn btn-primary mt-6 inline-flex items-center gap-2"
              >
                Start Playing

                <ArrowLeft
                  size={17}
                  className="rotate-180"
                />
              </Link>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {recentGames.map(
                (game) => {
                  const isExpanded =
                    expandedGame ===
                    game.id;

                  return (
                    <article
                      key={
                        game.id
                      }
                      className="card overflow-hidden"
                    >
                      {/* ROW */}

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGame(
                            isExpanded
                              ? null
                              : game.id
                          )
                        }
                        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 p-5 text-left transition hover:bg-white/[0.02]"
                      >
                        {/* ICON */}

                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/[0.07] text-[var(--accent)]">
                          <Trophy
                            size={19}
                          />
                        </div>

                        {/* GAME */}

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold">
                              {
                                game.gameType
                              }
                            </p>

                            {game.isChallenge && (
                              <div className="mt-1 flex min-w-0 items-center gap-2">
                                <span className="shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
                                  Played in Challenge{" "}

                                  {game.challengeTitle && (
                                    <>
                                      <span className="shrink-0 text-[var(--muted)]">
                                        •{" "}
                                      </span>

                                      <span className="min-w-0 truncate text-[10px] font-semibold text-[var(--muted)]">
                                        {game.challengeTitle}
                                      </span>
                                    </>
                                  )}
                                </span>


                              </div>
                            )}
                          </div>

                          {game.isChallenge &&
                            game.challengeTitle && (
                              <p className="mt-1 truncate text-[10px] font-semibold text-[var(--muted)]">
                                Challenge:{" "}
                                {
                                  game.challengeTitle
                                }
                              </p>
                            )}

                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-xs font-black text-[var(--accent)]">
                              {
                                game.record
                              }
                            </span>

                            <span className="text-[var(--muted)]">
                              •
                            </span>

                            <span className="text-xs text-[var(--muted)]">
                              {formatDate(
                                game.date
                              )}
                            </span>
                          </div>
                        </div>

                        {/* SCORE */}

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-black text-[var(--accent)]">
                              {formatScore(
                                game.score
                              )}
                            </p>

                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                              points
                            </p>
                          </div>

                          {isExpanded ? (
                            <ChevronUp
                              size={18}
                              className="text-[var(--muted)]"
                            />
                          ) : (
                            <ChevronDown
                              size={18}
                              className="text-[var(--muted)]"
                            />
                          )}
                        </div>
                      </button>

                      {/* DETAILS */}

                      {isExpanded && (
                        <div className="border-t border-white/10 px-5 py-5">
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                            Game Details
                          </p>

                          {game.details &&
                            game.details.length >
                            0 ? (
                            <div className="mt-4 space-y-2">
                              {game.details.map(
                                (
                                  detail,
                                  index
                                ) => (
                                  <div
                                    key={
                                      `${game.id}-${index}`
                                    }
                                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-[var(--muted)]"
                                  >
                                    {
                                      detail
                                    }
                                  </div>
                                )
                              )}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-[var(--muted)]">
                              No additional game details are available.
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                }
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({
  icon,
  value,
  label,
  className = "",
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`border-white/10 p-6 text-center ${className}`}
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/[0.08] text-[var(--accent)]">
        {icon}
      </div>

      <p className="mt-4 text-2xl font-black sm:text-3xl">
        {value}
      </p>

      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
    </div>
  );
}