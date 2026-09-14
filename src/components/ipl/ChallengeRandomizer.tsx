"use client";

import { useState } from "react";

import type { IPLChallenge, IPLPlayer } from "@/types/ipl";

interface ChallengeRandomizerProps {
  onChallengeReady: (challenge: IPLChallenge, players: IPLPlayer[]) => void;
}

export default function ChallengeRandomizer({ onChallengeReady }: ChallengeRandomizerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchPlayers(teamSeasonId: string): Promise<IPLPlayer[]> {
    const response = await fetch(
      `/api/ipl/team-season/${encodeURIComponent(teamSeasonId)}/players`,
      { method: "GET", cache: "no-store" },
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error ?? "Unable to load available players.");
    }

    if (!Array.isArray(data?.players)) {
      throw new Error("Invalid player data received.");
    }

    return data.players;
  }

  async function spin() {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ipl/random/challenge", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to generate a challenge.");
      }

      const challenge = data as IPLChallenge;

      if (!challenge?.team?.id || !challenge?.season?.id || !challenge?.teamSeasonId) {
        throw new Error("Invalid challenge data received.");
      }

      const players = await fetchPlayers(challenge.teamSeasonId);

      if (players.length === 0) {
        throw new Error("No eligible players are available for this team and season.");
      }

      onChallengeReady(challenge, players);
    } catch (err) {
      console.error("Initial IPL challenge randomization failed:", err);
      setError(err instanceof Error ? err.message : "Unable to generate a challenge. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 items-center justify-center">
      <div className="w-full max-w-[430px] px-2 py-3 sm:px-4 sm:py-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <RandomValue label="Team" value="Random" variant="team" />
          <RandomValue label="Season" value="Random" variant="season" />
        </div>

        <button
          type="button"
          onClick={spin}
          disabled={loading}
          className="mx-auto mt-4 flex h-14 w-[72%] items-center justify-center rounded-2xl bg-orange-500 px-6 text-base font-black uppercase tracking-wide text-white shadow-[0_10px_28px_rgba(249,115,22,0.22)] transition hover:bg-orange-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:mt-6 sm:h-16 sm:text-lg"
        >
          {loading ? "Spinning…" : "Spin"}
        </button>

        {error && (
          <p className="mx-auto mt-3 max-w-md text-center text-[10px] leading-4 text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function RandomValue({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "team" | "season";
}) {
  const frame =
    variant === "team"
      ? "border-orange-400 bg-orange-400/10 shadow-[0_0_26px_rgba(249,115,22,0.18)]"
      : "border-fuchsia-500 bg-fuchsia-500/10 shadow-[0_0_26px_rgba(168,85,247,0.18)]";

  return (
    <div className={`rounded-xl border-2 p-2 ${frame}`}>
      <div className="flex h-[76px] flex-col items-center justify-center rounded-lg border border-white/10 bg-[#171b2a] px-2 sm:h-[82px]">
        <p className="text-[10px] font-black uppercase tracking-wide text-orange-400">
          {label}
        </p>
        <p className="mt-1 truncate text-xl font-black text-white sm:text-2xl">
          {value}
        </p>
      </div>
    </div>
  );
}
