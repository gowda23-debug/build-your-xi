"use client";

import { Share2, Swords, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import type { IPLChallenge, IPLPlayer, PitchProfile } from "@/types/ipl";
import { evaluateXI } from "@/lib/ipl-challenge/scoring";

type IPLGameProps = {
  challenge: IPLChallenge;
  selectedPlayers: IPLPlayer[];
  pitch: PitchProfile | null;
  onBuildAnother: () => void;
};

export default function IPLGame({
  challenge,
  selectedPlayers,
  pitch,
  onBuildAnother,
}: IPLGameProps) {
  const [shareStatus, setShareStatus] = useState<
    "idle" | "shared" | "copied"
  >("idle");

  const result = useMemo(
    () =>
      evaluateXI({
        players: selectedPlayers,
        pitch,
        challengeId: challenge.teamSeasonId,
      }),
    [selectedPlayers, pitch, challenge.teamSeasonId]
  );

  async function handleShare() {
    const shareText =
      `I built a ${result.wins}-${result.losses} team on Build Your XI with ${result.score} points. Can you beat it?`;

    const shareUrl =
      typeof window !== "undefined"
        ? window.location.href
        : "";

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Build Your XI",
          text: shareText,
          url: shareUrl,
        });
        setShareStatus("shared");
        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          `${shareText} ${shareUrl}`
        );
        setShareStatus("copied");
      }
    } catch {
      setShareStatus("idle");
    }
  }

  const roleGroups = [
    {
      label: "WK",
      players: selectedPlayers.filter(
        (player) => player.role === "WK"
      ),
    },
    {
      label: "BATTERS",
      players: selectedPlayers.filter(
        (player) => player.role === "BAT"
      ),
    },
    {
      label: "ALL-ROUNDERS",
      players: selectedPlayers.filter(
        (player) => player.role === "AR"
      ),
    },
    {
      label: "BOWLERS",
      players: selectedPlayers.filter(
        (player) => player.role === "BOWL"
      ),
    },
  ];

  return (
    <main className="flex min-h-0 w-full flex-1 items-start justify-center overflow-auto px-2 pb-4 pt-5 sm:px-4 sm:pt-6 lg:overflow-hidden">
      <section className="grid w-full max-w-[980px] grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <div className="flex flex-col items-center px-5 pb-5 pt-5 text-center sm:px-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-black/10 px-3 py-1.5">
              <Trophy
                size={13}
                className="text-[var(--accent)]"
              />
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                IPL Challenge
              </span>
            </div>

            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--muted)]">
              Your Record
            </p>

            <div className="mt-1 flex items-center leading-none">
              <span className="text-7xl font-black tracking-[-0.07em] text-[var(--accent)] sm:text-8xl">
                {result.wins}
              </span>
              <span className="mx-1 text-5xl font-black text-[var(--muted)] sm:text-6xl">
                –
              </span>
              <span className="text-7xl font-black tracking-[-0.07em] text-white sm:text-8xl">
                {result.losses}
              </span>
            </div>

            <div className="mt-3 flex items-baseline justify-center gap-2">
              <span className="text-5xl font-black tracking-tight text-white">
                {result.score}
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                points
              </span>
            </div>

            <div className="mt-5 grid w-full max-w-[360px] grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={onBuildAnother}
                className="btn btn-primary min-h-10 text-xs font-black"
              >
                Build Another
              </button>

              <button
                type="button"
                onClick={handleShare}
                className="btn btn-secondary min-h-10 text-xs font-black"
              >
                <Share2 size={14} />
                {shareStatus === "shared"
                  ? "Shared"
                  : shareStatus === "copied"
                    ? "Copied"
                    : "Share"}
              </button>

              <a
                href="/challenges"
                className="btn btn-secondary col-span-2 min-h-10 text-xs font-black sm:col-span-1"
              >
                <Swords size={14} />
                Create Challenge
              </a>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[8px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
              <span>{result.breakdown.batting} Batting</span>
              <span>•</span>
              <span>{result.breakdown.bowling} Bowling</span>
              <span>•</span>
              <span>{result.breakdown.balance} Balance</span>
              <span>•</span>
              <span>{result.breakdown.conditions} Conditions</span>
            </div>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                Your Playing XI
              </p>
              <p className="mt-1 text-[8px] text-[var(--muted)]">
                The team you built
              </p>
            </div>

            <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[8px] font-black text-[var(--muted)]">
              11 players
            </span>
          </div>

          <div className="grid grid-cols-4 divide-x divide-[var(--line)]">
            {roleGroups.map((group) => (
              <RoleColumn
                key={group.label}
                label={group.label}
                players={group.players}
              />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function RoleColumn({
  label,
  players,
}: {
  label: string;
  players: IPLPlayer[];
}) {
  return (
    <div className="min-w-0 p-2.5 sm:p-3">
      <p className="min-h-5 text-[8px] font-black uppercase leading-3 tracking-[0.1em] text-[var(--accent)]">
        {label}
      </p>

      <div className="mt-2 space-y-1.5">
        {players.map((player) => (
          <div
            key={player.id}
            className="rounded-lg border border-[var(--line)] bg-black/10 px-2.5 py-2"
          >
            <p className="truncate text-[10px] font-bold">
              {player.name}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
