"use client";

import { Trophy, Users, X } from "lucide-react";

import type {
  IPLPlayer,
} from "@/types/ipl";

type PlayingXIProps = {
  selectedPlayers: IPLPlayer[];
  onRemovePlayer: (
    playerId: string
  ) => void;
};

const MAX_PLAYERS = 11;

export default function PlayingXI({
  selectedPlayers,
  onRemovePlayer,
}: PlayingXIProps) {
  const emptySlots =
    Array.from({
      length:
        MAX_PLAYERS -
        selectedPlayers.length,
    });

  return (
    <section className="card flex min-h-[650px] flex-col overflow-hidden">
      {/* =========================
          HEADER
      ========================= */}

      <div className="border-b border-[var(--line)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <Trophy size={20} />

              <p className="text-xs font-bold uppercase tracking-[0.25em]">
                Your Team
              </p>
            </div>

            <h2 className="mt-3 text-3xl font-black">
              Playing XI
            </h2>

            <p className="mt-2 text-sm text-[var(--muted)]">
              Select exactly 11 players.
            </p>
          </div>

          <div className="flex h-12 min-w-12 items-center justify-center rounded-xl bg-[var(--accent)]/10 px-3 font-black text-[var(--accent)]">
            {selectedPlayers.length}
            <span className="text-[var(--muted)]">
              /11
            </span>
          </div>
        </div>
      </div>

      {/* =========================
          PLAYER LIST
      ========================= */}

      <div className="flex-1 p-5">
        {selectedPlayers.length ===
        0 ? (
          <div className="flex h-full min-h-[500px] flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-[var(--muted)]">
              <Users size={28} />
            </div>

            <h3 className="mt-5 text-xl font-black">
              Build Your XI
            </h3>

            <p className="mt-2 max-w-xs text-sm leading-6 text-[var(--muted)]">
              Search the available squad and
              select the players you believe
              make the strongest team.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedPlayers.map(
              (
                player,
                index
              ) => (
                <div
                  key={player.id}
                  className="group flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/[0.02] p-3"
                >
                  {/* Number */}

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-sm font-black text-[var(--accent)]">
                    {index + 1}
                  </div>

                  {/* Player */}

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {player.name}
                    </p>

                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {player.stats.matches} matches
                    </p>
                  </div>

                  {/* Remove */}

                  <button
                    type="button"
                    onClick={() =>
                      onRemovePlayer(
                        player.id
                      )
                    }
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-400"
                    aria-label={`Remove ${player.name}`}
                  >
                    <X size={17} />
                  </button>
                </div>
              )
            )}

            {/* Empty slots */}

            {emptySlots.map(
              (_, index) => (
                <div
                  key={`empty-${index}`}
                  className="flex h-[60px] items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] px-3 text-sm text-[var(--muted)]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.03] text-xs font-bold">
                    {selectedPlayers.length +
                      index +
                      1}
                  </div>

                  Empty Slot
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* =========================
          FOOTER
      ========================= */}

      <div className="border-t border-[var(--line)] p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">
            Team progress
          </span>

          <span className="font-bold">
            {selectedPlayers.length} of{" "}
            {MAX_PLAYERS} selected
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
            style={{
              width: `${
                (selectedPlayers.length /
                  MAX_PLAYERS) *
                100
              }%`,
            }}
          />
        </div>
      </div>
    </section>
  );
}