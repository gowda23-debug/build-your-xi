"use client";

import { useState } from "react";
import type {
  IPLChallenge,
  IPLSeason,
  IPLTeam,
  RandomSeasonResponse,
  RandomTeamResponse,
} from "@/types/ipl";

interface ChallengeRandomizerProps {
  challenge: IPLChallenge | null;
  onChallengeReady: (challenge: IPLChallenge) => void;
  onTeamChange?: (team: IPLTeam) => void;
  onSeasonChange?: (season: IPLSeason) => void;
}

export default function ChallengeRandomizer({
  challenge,
  onChallengeReady,
  onTeamChange,
  onSeasonChange,
}: ChallengeRandomizerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spinInitialChallenge = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ipl/random", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to generate a challenge.");
      }

      const data = (await response.json()) as IPLChallenge;

      if (!data?.team?.id || !data?.season?.id || !data?.teamSeasonId) {
        throw new Error("Invalid challenge data received.");
      }

      onChallengeReady(data);
    } catch (err) {
      console.error("Initial IPL challenge randomization failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate a challenge. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const respinTeam = async () => {
    if (!challenge || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/ipl/random/team?seasonId=${encodeURIComponent(
          challenge.season.id,
        )}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error("Unable to respin the team.");
      }

      const data = (await response.json()) as RandomTeamResponse;

      if (!data?.team?.id) {
        throw new Error("Invalid team data received.");
      }

      onTeamChange?.(data.team);

      if (data.teamSeasonId) {
        onChallengeReady({
          teamSeasonId: data.teamSeasonId,
          team: data.team,
          season: challenge.season,
        });
      }
    } catch (err) {
      console.error("IPL team respin failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to respin the team. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const respinSeason = async () => {
    if (!challenge || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/ipl/random/season?teamId=${encodeURIComponent(
          challenge.team.id,
        )}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error("Unable to respin the season.");
      }

      const data = (await response.json()) as RandomSeasonResponse;

      if (!data?.season?.id || !data.season.teamSeasonId) {
        throw new Error("Invalid season data received.");
      }

      const nextSeason: IPLSeason = {
        id: data.season.id,
        season: data.season.season,
        startYear: data.season.startYear,
      };

      onSeasonChange?.(nextSeason);

      onChallengeReady({
        teamSeasonId: data.season.teamSeasonId,
        team: challenge.team,
        season: nextSeason,
      });
    } catch (err) {
      console.error("IPL season respin failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to respin the season. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * Before the first spin:
   * Keep the randomizer intentionally compact.
   */
  if (!challenge) {
    return (
      <section className="w-full">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 shadow-lg backdrop-blur">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-emerald-400/15 bg-slate-900/80 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Team
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-200">
                  Random
                </p>
              </div>

              <div className="rounded-xl border border-emerald-400/15 bg-slate-900/80 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Season
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-200">
                  Random
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={spinInitialChallenge}
              disabled={loading}
              className="mt-2.5 flex h-9 w-full items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-xs font-bold tracking-[0.14em] text-emerald-300 transition-all duration-200 hover:border-emerald-400/40 hover:bg-emerald-400/15 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "SPINNING..." : "SPIN"}
            </button>

            {error && (
              <p
                role="alert"
                className="mt-2 text-center text-xs text-red-300"
              >
                {error}
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  /*
   * After the first spin:
   * Display the current Team + Season and provide independent respins.
   */
  return (
    <section className="w-full">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 shadow-lg backdrop-blur">
          <div className="grid grid-cols-2 gap-2">
            {/* Team */}
            <div className="min-w-0 rounded-xl border border-emerald-400/15 bg-slate-900/80 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Team
                </p>

                <button
                  type="button"
                  onClick={respinTeam}
                  disabled={loading}
                  aria-label="Respin team"
                  className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:border-emerald-400/30 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Respin
                </button>
              </div>

              <p className="mt-1 truncate text-sm font-semibold text-slate-100">
                {challenge.team.name}
              </p>
            </div>

            {/* Season */}
            <div className="min-w-0 rounded-xl border border-emerald-400/15 bg-slate-900/80 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Season
                </p>

                <button
                  type="button"
                  onClick={respinSeason}
                  disabled={loading}
                  aria-label="Respin season"
                  className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:border-emerald-400/30 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Respin
                </button>
              </div>

              <p className="mt-1 truncate text-sm font-semibold text-slate-100">
                {challenge.season.season}
              </p>
            </div>
          </div>

          {loading && (
            <div className="mt-2 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
              Spinning...
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-2 text-center text-xs text-red-300"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}