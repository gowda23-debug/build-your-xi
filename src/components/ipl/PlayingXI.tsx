"use client";

import {
  X,
} from "lucide-react";

import type {
  IPLPlayer,
  PitchProfile,
} from "@/types/ipl";

type PlayingXIProps = {
  players: IPLPlayer[];

  pitch: PitchProfile | null;

  onRemovePlayer: (
    playerId: string
  ) => void;
};

const POSITIONS = [
  "top-[6%] left-1/2 -translate-x-1/2",
  "top-[19%] left-[20%]",
  "top-[19%] right-[20%]",
  "top-[34%] left-1/2 -translate-x-1/2",
  "top-[48%] left-[15%]",
  "top-[48%] right-[15%]",
  "top-[62%] left-[28%]",
  "top-[62%] right-[28%]",
  "bottom-[16%] left-[20%]",
  "bottom-[16%] right-[20%]",
  "bottom-[4%] left-1/2 -translate-x-1/2",
];

export default function PlayingXI({
  players,
  pitch,
  onRemovePlayer,
}: PlayingXIProps) {
  return (
    <aside className="card flex min-h-0 flex-col overflow-hidden">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
          Your Playing XI
        </p>

        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-[var(--muted)]">
            One player per spin
          </p>

          <p className="text-lg font-black">
            {
              players.length
            }
            /11
          </p>
        </div>
      </div>

      <div className="relative min-h-[440px] flex-1 overflow-hidden bg-emerald-950/30">
        <div className="absolute inset-5 rounded-[50%] border border-emerald-500/20" />

        <div className="absolute left-1/2 top-5 bottom-5 w-[32%] -translate-x-1/2 rounded-[80px] border border-emerald-500/20 bg-emerald-500/5" />

        <div className="absolute left-1/2 top-1/2 h-28 w-20 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5" />

        {players.map(
          (
            player,
            index
          ) => (
            <div
              key={
                player.id
              }
              className={[
                "absolute z-10 w-20 text-center",
                POSITIONS[
                  index
                ],
              ].join(" ")}
            >
              <div className="group relative mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[var(--surface)] text-xs font-black shadow-lg">
                {
                  index + 1
                }

                <button
                  type="button"
                  onClick={() =>
                    onRemovePlayer(
                      player.id
                    )
                  }
                  className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
                  aria-label={`Remove ${player.name}`}
                >
                  <X
                    size={11}
                  />
                </button>
              </div>

              <p className="mt-1 truncate text-[10px] font-bold">
                {
                  player.name
                }
              </p>

              <p className="text-[9px] text-[var(--muted)]">
                {
                  player.role
                }
              </p>
            </div>
          )
        )}

        {players.length ===
          0 && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
            <div>
              <p className="text-sm font-bold">
                Build your XI
              </p>

              <p className="mt-1 text-xs text-[var(--muted)]">
                Spin a challenge and select one player.
              </p>
            </div>
          </div>
        )}
      </div>

      {pitch && (
        <div className="border-t border-[var(--line)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
            Pitch Conditions
          </p>

          <h3 className="mt-1 text-sm font-black">
            {
              pitch.title
            }
          </h3>

          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {
              pitch.summary
            }
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
            <Metric
              label="Batting"
              value={
                pitch.batting
              }
            />

            <Metric
              label="Pace"
              value={
                pitch.pace
              }
            />

            <Metric
              label="Spin"
              value={
                pitch.spin
              }
            />

            <Metric
              label="Dew"
              value={
                pitch.dew
              }
            />
          </div>

          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            {
              pitch.strategy
            }
          </p>
        </div>
      )}
    </aside>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] p-2">
      <p className="text-[var(--muted)]">
        {
          label
        }
      </p>

      <p className="mt-1 font-black">
        {
          value
        }
      </p>
    </div>
  );
}