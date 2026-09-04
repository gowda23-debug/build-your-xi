"use client";

import type {
  IPLPlayer,
  PitchProfile,
} from "@/types/ipl";

interface PlayingXIProps {
  players: IPLPlayer[];
  pitch: PitchProfile | null;
  onRemovePlayer: (playerId: string) => void;
}

const ROLE_LABELS = {
  WK: "Wicket Keepers",
  BAT: "Batters",
  AR: "All-Rounders",
  BOWL: "Bowlers",
} as const;

export default function PlayingXI({
  players,
  pitch,
  onRemovePlayer,
}: PlayingXIProps) {
  const groupedPlayers = {
    WK: players.filter(
      (player) => player.role === "WK"
    ),
    BAT: players.filter(
      (player) => player.role === "BAT"
    ),
    AR: players.filter(
      (player) => player.role === "AR"
    ),
    BOWL: players.filter(
      (player) => player.role === "BOWL"
    ),
  };

  return (
    <div className="flex min-h-0 h-full flex-col gap-3">
      {/* ------------------------------------------
          PLAYING XI STADIUM
      ------------------------------------------- */}
      <section className="card flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Your Playing XI
            </p>

            <p className="mt-1 text-xs text-[var(--muted)]">
              {players.length} / 11 players
            </p>
          </div>

          <div className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-bold">
            {players.length === 11
              ? "XI Complete"
              : "Building XI"}
          </div>
        </div>

        {/* Stadium / Pitch */}
        <div className="relative min-h-0 flex-1 overflow-hidden p-4">
          <div className="relative flex h-full min-h-[420px] flex-col items-center justify-center overflow-hidden rounded-[45%] border border-emerald-300/20 bg-emerald-950/40">
            {/* Stadium atmosphere */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.12),transparent_55%)]" />

            {/* Outer field markings */}
            <div className="absolute inset-[7%] rounded-[45%] border border-emerald-300/10" />

            <div className="absolute inset-[14%] rounded-[45%] border border-emerald-300/10" />

            {/* Pitch */}
            <div className="absolute left-1/2 top-1/2 h-[38%] w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-[45%] border border-amber-200/20 bg-amber-100/10" />

            {/* Centre pitch */}
            <div className="absolute left-1/2 top-1/2 h-[24%] w-[8%] -translate-x-1/2 -translate-y-1/2 rounded-md border border-amber-200/15 bg-amber-100/5" />

            {/* Selected players */}
            <div className="relative z-10 flex w-[78%] flex-col items-center gap-3">
              {players.length === 0 ? (
                <div className="rounded-xl border border-dashed border-emerald-200/20 bg-black/10 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-white/70">
                    Your XI is empty
                  </p>

                  <p className="mt-1 text-xs text-white/40">
                    Spin to select your first player
                  </p>
                </div>
              ) : (
                <>
                  <RoleGroup
                    label={ROLE_LABELS.WK}
                    players={groupedPlayers.WK}
                    onRemovePlayer={
                      onRemovePlayer
                    }
                  />

                  <RoleGroup
                    label={ROLE_LABELS.BAT}
                    players={groupedPlayers.BAT}
                    onRemovePlayer={
                      onRemovePlayer
                    }
                  />

                  <RoleGroup
                    label={ROLE_LABELS.AR}
                    players={groupedPlayers.AR}
                    onRemovePlayer={
                      onRemovePlayer
                    }
                  />

                  <RoleGroup
                    label={ROLE_LABELS.BOWL}
                    players={groupedPlayers.BOWL}
                    onRemovePlayer={
                      onRemovePlayer
                    }
                  />
                </>
              )}
            </div>

            {/* Stadium label */}
            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
              Cricket Stadium
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------
          PITCH DETAILS
      ------------------------------------------- */}
      <section className="card shrink-0 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Pitch Details
            </p>

            <h2 className="mt-1 text-sm font-black">
              {pitch?.name ??
                "Pitch information"}
            </h2>
          </div>
        </div>

        {pitch ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <PitchStat
              label="Surface"
              value={pitch.surface}
            />

            <PitchStat
              label="Pace"
              value={pitch.pace}
            />

            <PitchStat
              label="Bounce"
              value={pitch.bounce}
            />

            <PitchStat
              label="Spin"
              value={pitch.spin}
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Pitch details will appear after
            the first spin.
          </p>
        )}
      </section>
    </div>
  );
}

/*
 * ------------------------------------------
 * ROLE GROUP
 * ------------------------------------------
 */

function RoleGroup({
  label,
  players,
  onRemovePlayer,
}: {
  label: string;
  players: IPLPlayer[];
  onRemovePlayer: (
    playerId: string
  ) => void;
}) {
  if (players.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-[310px] rounded-xl border border-white/10 bg-black/15 px-3 py-2 backdrop-blur-sm">
      <p className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/50">
        {label}
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {players.map((player) => (
          <div
            key={player.id}
            className="group flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5"
          >
            <span className="max-w-[130px] truncate text-xs font-semibold text-white/90">
              {player.name}
            </span>

            <button
              type="button"
              onClick={() =>
                onRemovePlayer(player.id)
              }
              className="text-xs text-white/30 transition hover:text-red-400"
              aria-label={`Remove ${player.name}`}
              title={`Remove ${player.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/*
 * ------------------------------------------
 * PITCH STAT
 * ------------------------------------------
 */

function PitchStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-black/10 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-1 text-xs font-bold">
        {value}
      </p>
    </div>
  );
}