"use client";

import { useState } from "react";

import type {
  IPLChallenge,
  IPLPlayer,
} from "@/types/ipl";

interface ChallengeRandomizerProps {
  onChallengeReady: (
    challenge: IPLChallenge,
    players: IPLPlayer[],
  ) => void;
}

export default function ChallengeRandomizer({
  onChallengeReady,
}: ChallengeRandomizerProps) {
  const [loading, setLoading] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function fetchPlayers(
    teamSeasonId: string,
  ): Promise<IPLPlayer[]> {
    const response = await fetch(
      `/api/ipl/team-season/${encodeURIComponent(
        teamSeasonId,
      )}/players`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        "Unable to load available players.",
      );
    }

    const data = await response.json();

    if (!Array.isArray(data?.players)) {
      throw new Error(
        "Invalid player data received.",
      );
    }

    return data.players;
  }

  async function spin() {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/ipl/random/challenge",
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(
          "Unable to generate a challenge.",
        );
      }

      const challenge =
        (await response.json()) as IPLChallenge;

      if (
        !challenge?.team?.id ||
        !challenge?.season?.id ||
        !challenge?.teamSeasonId
      ) {
        throw new Error(
          "Invalid challenge data received.",
        );
      }

      const players =
        await fetchPlayers(
          challenge.teamSeasonId,
        );

      onChallengeReady(
        challenge,
        players,
      );
    } catch (err) {
      console.error(
        "Initial IPL challenge randomization failed:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate a challenge. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex w-full items-center justify-center">
      <div className="w-full max-w-md">
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
            onClick={spin}
            disabled={loading}
            className="mt-2.5 flex h-9 w-full items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-xs font-bold tracking-[0.14em] text-emerald-300 transition-all duration-200 hover:border-emerald-400/40 hover:bg-emerald-400/15 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "SPINNING..."
              : "SPIN"}
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