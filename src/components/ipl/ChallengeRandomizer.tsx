"use client";

import { useState } from "react";

import type { IPLChallenge, IPLPlayer } from "@/types/ipl";

interface ChallengeRandomizerProps {
  onChallengeReady: (challenge: IPLChallenge, players: IPLPlayer[]) => void;
}

export default function ChallengeRandomizer({
  onChallengeReady,
}: ChallengeRandomizerProps) {
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
        throw new Error(
          data?.error ?? "Unable to generate a challenge.",
        );
      }

      const challenge = data as IPLChallenge;

      if (
        !challenge?.team?.id ||
        !challenge?.season?.id ||
        !challenge?.teamSeasonId
      ) {
        throw new Error("Invalid challenge data received.");
      }

      const players = await fetchPlayers(challenge.teamSeasonId);

      if (players.length === 0) {
        throw new Error(
          "No eligible players are available for this team and season.",
        );
      }

      onChallengeReady(challenge, players);
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
  }

  return (
    <section className="flex h-full min-h-0 items-center justify-center">
      <div className="w-full max-w-[430px] px-2 py-3 sm:px-4 sm:py-5">

        {/* Team + Season */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <RandomValue
            label="Team"
            value="Random"
          />

          <RandomValue
            label="Season"
            value="Random"
          />
        </div>

        {/* Spin */}
        <button
          type="button"
          onClick={spin}
          disabled={loading}
          className="
            group mx-auto mt-4 flex h-14 w-[72%]
            items-center justify-center
            rounded-2xl
            border border-emerald-300/70
            bg-gradient-to-r
            from-emerald-500
            via-emerald-400
            to-teal-400
            px-6
            text-base
            font-black
            uppercase
            tracking-wide
            text-white
            shadow-[0_10px_32px_rgba(16,185,129,0.22)]
            transition-all duration-200
            hover:-translate-y-0.5
            hover:border-emerald-200
            hover:shadow-[0_12px_38px_rgba(16,185,129,0.32)]
            active:translate-y-0
            active:scale-[0.99]
            disabled:cursor-not-allowed
            disabled:opacity-60
            sm:mt-6
            sm:h-16
            sm:text-lg
          "
        >
          {loading ? "Spinning…" : "Spin"}
        </button>

        {error && (
          <p
            className="mx-auto mt-3 max-w-md text-center text-[10px] leading-4 text-red-300"
            role="alert"
          >
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
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="
        rounded-2xl
        border
        border-emerald-300/55
        bg-emerald-400/[0.035]
        p-2
        shadow-[0_0_22px_rgba(52,211,153,0.08)]
        transition-all
        duration-200
        hover:border-emerald-200/80
        hover:bg-emerald-400/[0.06]
        hover:shadow-[0_0_28px_rgba(52,211,153,0.12)]
      "
    >
      <div
        className="
          flex h-[76px]
          flex-col
          items-center
          justify-center
          rounded-xl
          border
          border-emerald-200/10
          bg-[#171b2a]
          px-2
          sm:h-[82px]
        "
      >
        <p
          className="
            text-[10px]
            font-black
            uppercase
            tracking-wide
            text-emerald-300
          "
        >
          {label}
        </p>

        <p
          className="
            mt-1
            truncate
            text-xl
            font-black
            text-white
            sm:text-2xl
          "
        >
          {value}
        </p>
      </div>
    </div>
  );
}