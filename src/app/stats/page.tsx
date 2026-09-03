"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Edit3,
  Gamepad2,
  Medal,
  Swords,
  Trophy,
  TrendingUp,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Player = {
  label: string;
  gamerTag: string;
  isGuest: boolean;
};

type GameType =
  | "IPL Challenge"
  | "World Domination"
  | "1v1 Online";

type RecentGame = {
  id: string;
  gameType: GameType;
  mode: string;
  score: number | null;
  result: string;
  date: string;
  details?: string[];
};

export default function StatsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(
    null
  );

  /*
   * This will later be populated from real gameplay data.
   *
   * The UI is intentionally ready now so IPL, World Domination,
   * and 1v1 games can all appear in one combined list.
   */
  const recentGames: RecentGame[] = [];

  useEffect(() => {
    async function loadPlayer() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const isGuest = Boolean(user.is_anonymous);

      /*
       * Guest users do not use the profiles table.
       */
      if (isGuest) {
        setPlayer({
          label: "Guest Player",
          gamerTag: `GUEST-${user.id
            .slice(0, 6)
            .toUpperCase()}`,
          isGuest: true,
        });

        setLoading(false);
        return;
      }

      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("display_name, gamer_tag")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Error loading player profile:", error);
      }

      setPlayer({
        label:
          profileData?.display_name ||
          user.user_metadata?.display_name ||
          "Player",

        gamerTag:
          profileData?.gamer_tag ||
          user.user_metadata?.gamer_tag ||
          "",

        isGuest: false,
      });

      setLoading(false);
    }

    loadPlayer();
  }, [supabase]);

  function getInitials(name?: string) {
    if (!name) return "P";

    return name
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  /*
   * These values will later be calculated from real game data.
   */
  const gamesPlayed = recentGames.length;

  const bestScore =
    recentGames.length > 0
      ? Math.max(
          ...recentGames
            .map((game) => game.score)
            .filter(
              (score): score is number => score !== null
            )
        )
      : null;

  /*
   * Best Record will later support the relevant
   * record format from the gameplay data.
   */
  const bestRecord = null;

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[var(--muted)]">
          Loading your stats...
        </p>
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
      {/* =========================
          BACKGROUND ATMOSPHERE
      ========================= */}

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-52 left-1/2 h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-[var(--accent)]/[0.04] blur-3xl" />

        <div className="absolute top-1/3 -left-64 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.02] blur-3xl" />

        <div className="absolute -bottom-64 -right-64 h-[560px] w-[560px] rounded-full bg-[var(--accent)]/[0.025] blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-4xl px-5 py-6 sm:px-6 md:py-8 lg:px-8">
        {/* =========================
            BACK
        ========================= */}

        <Link
          href="/home"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-[var(--muted)] transition hover:border-[var(--accent)]/30 hover:text-white"
        >
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        {/* =========================
            PAGE HEADER
        ========================= */}

        <section className="mt-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent)]">
            Your Progress
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            My Stats
          </h1>

          <p className="mt-3 text-sm leading-6 text-[var(--muted)] sm:text-base">
            Track your Build Your XI journey and review your
            recent games.
          </p>
        </section>

        {/* =========================
            PROFILE CARD
        ========================= */}

        <section className="card mt-8 overflow-hidden">
          {/* Profile */}

          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/[0.08] text-lg font-black">
                {getInitials(player.label)}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-xl font-black">
                    {player.gamerTag || player.label}
                  </h2>

                  {!player.isGuest && (
                    <Link
                      href="/profile"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-white/5 hover:text-[var(--accent)]"
                      aria-label="Edit profile"
                    >
                      <Edit3 size={15} />
                    </Link>
                  )}
                </div>

                <p className="mt-1 text-sm text-[var(--muted)]">
                  {player.isGuest
                    ? "Guest Player"
                    : player.label}
                </p>

                <span className="mt-3 inline-flex rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  {player.isGuest
                    ? "Guest"
                    : "Registered Player"}
                </span>
              </div>
            </div>
          </div>

          {/* Statistics */}

          <div className="grid border-t border-white/10 sm:grid-cols-3">
            {/* Games Played */}

            <StatCard
              icon={<Trophy size={20} />}
              value={gamesPlayed.toString()}
              label="Games Played"
              className="border-b sm:border-b-0 sm:border-r"
            />

            {/* Best Score */}

            <StatCard
              icon={<TrendingUp size={20} />}
              value={
                bestScore !== null
                  ? bestScore.toFixed(1)
                  : "—"
              }
              label="Best Score"
              className="border-b sm:border-b-0 sm:border-r"
            />

            {/* Best Record */}

            <StatCard
              icon={<Medal size={20} />}
              value={bestRecord ?? "—"}
              label="Best Record"
            />
          </div>
        </section>

        {/* =========================
            RECENT GAMES
        ========================= */}

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent)]">
                Game History
              </p>

              <h2 className="mt-2 text-2xl font-black">
                Recent Games
              </h2>
            </div>

            <Gamepad2
              size={22}
              className="text-[var(--accent)]/60"
            />
          </div>

          {recentGames.length === 0 ? (
            <div className="card mt-5 flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-[var(--muted)]">
                <Gamepad2 size={24} />
              </div>

              <h3 className="mt-5 text-lg font-bold">
                No games played yet
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                Your completed IPL Challenge, World Domination,
                and 1v1 Online games will appear here.
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
              {recentGames.map((game) => {
                const isExpanded =
                  expandedGame === game.id;

                return (
                  <article
                    key={game.id}
                    className="card overflow-hidden"
                  >
                    {/* Collapsed row */}

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
                      {/* Game icon */}

                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/[0.07] text-[var(--accent)]">
                        {game.gameType ===
                        "1v1 Online" ? (
                          <Swords size={19} />
                        ) : (
                          <Trophy size={19} />
                        )}
                      </div>

                      {/* Game information */}

                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {game.gameType}
                        </p>

                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {game.mode}
                        </p>
                      </div>

                      {/* Score + expand */}

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-black text-[var(--accent)]">
                            {game.score !== null
                              ? game.score.toFixed(1)
                              : game.result}
                          </p>

                          <p className="mt-1 text-[10px] text-[var(--muted)]">
                            {game.date}
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

                    {/* Expanded content */}

                    {isExpanded && (
                      <div className="border-t border-white/10 px-5 py-5">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                          Game Details
                        </p>

                        {game.details &&
                        game.details.length > 0 ? (
                          <div className="mt-4 space-y-2">
                            {game.details.map(
                              (detail, index) => (
                                <div
                                  key={index}
                                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-[var(--muted)]"
                                >
                                  {detail}
                                </div>
                              )
                            )}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-[var(--muted)]">
                            Detailed game information will
                            appear here.
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
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