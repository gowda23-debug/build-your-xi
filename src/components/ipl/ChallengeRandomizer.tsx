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

    if (!response.ok) throw new Error("Unable to load available players.");
    const data = await response.json();
    if (!Array.isArray(data?.players)) throw new Error("Invalid player data received.");
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

      if (!response.ok) throw new Error("Unable to generate a challenge.");

      const challenge = (await response.json()) as IPLChallenge;
      if (!challenge?.team?.id || !challenge?.season?.id || !challenge?.teamSeasonId) {
        throw new Error("Invalid challenge data received.");
      }

      const players = await fetchPlayers(challenge.teamSeasonId);
      onChallengeReady(challenge, players);
    } catch (err) {
      console.error("Initial IPL challenge randomization failed:", err);
      setError(err instanceof Error ? err.message : "Unable to generate a challenge. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-[var(--line)] bg-[var(--surface)]/80 px-2.5 py-2 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            <RandomValue label="Team" />
            <RandomValue label="Season" />
          </div>
          <button
            type="button"
            onClick={spin}
            disabled={loading}
            className="h-9 shrink-0 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent)] transition hover:bg-[var(--accent)]/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Rolling…" : "Spin"}
          </button>
        </div>
        {error && <p className="mt-1.5 text-center text-[10px] text-red-300" role="alert">{error}</p>}
      </div>
    </section>
  );
}

function RandomValue({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-black/10 px-2.5 py-1.5">
      <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-xs font-black">Random</p>
    </div>
  );
}
