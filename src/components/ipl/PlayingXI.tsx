"use client";

import type {
  IPLPlayer,
  PitchProfile,
  PlayerRole,
} from "@/types/ipl";

interface PlayingXIProps {
  players: IPLPlayer[];
  pitch: PitchProfile | null;
  onRemovePlayer: (playerId: string) => void;

  onRespinTeam: () => void;
  onRespinSeason: () => void;

  respinLoading: "team" | "season" | null;
  hasChallenge: boolean;
}

const ROLE_LABELS: Record<PlayerRole, string> = {
  WK: "Wicket Keepers",
  BAT: "Batters",
  AR: "All-Rounders",
  BOWL: "Bowlers",
};

export default function PlayingXI({
  players,
  pitch,
  onRemovePlayer,
  onRespinTeam,
  onRespinSeason,
  respinLoading,
  hasChallenge,
}: PlayingXIProps) {
  const groupedPlayers: Record<
    PlayerRole,
    IPLPlayer[]
  > = {
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
    <div className="flex h-full min-h-0 flex-col gap-2">

      {/* RESPIN CONTROLS */}
      {hasChallenge && players.length < 11 && (
        <div className="flex shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={onRespinTeam}
            disabled={respinLoading !== null}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            {respinLoading === "team"
              ? "Spinning..."
              : "↻ Team"}
          </button>

          <button
            type="button"
            onClick={onRespinSeason}
            disabled={respinLoading !== null}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
          >
            {respinLoading === "season"
              ? "Spinning..."
              : "↻ Season"}
          </button>
        </div>
      )}

      {/* MAIN XI CARD */}
      <section className="card flex min-h-0 flex-1 flex-col overflow-hidden">

        {/* HEADER */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Your Playing XI
            </p>

            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              {players.length} / 11 players
            </p>
          </div>

          <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
            {players.length === 11
              ? "XI Complete"
              : "Building XI"}
          </span>
        </div>

        {/* GROUND + PITCH */}
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(190px,.7fr)]">

          {/* GROUND */}
          <div className="relative min-h-0 overflow-hidden p-3">

            <div className="relative h-full min-h-[560px] overflow-hidden rounded-[48%] border border-emerald-300/15 bg-emerald-950/50">

              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.14),transparent_60%)]" />

              <div className="absolute inset-[5%] rounded-[48%] border border-emerald-200/10" />

              <div className="absolute inset-[11%] rounded-[48%] border border-emerald-200/10" />

              <div className="absolute left-1/2 top-1/2 h-[40%] w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-[30%] border border-amber-200/20 bg-amber-100/[0.07]" />

              <div className="absolute left-1/2 top-1/2 h-[27%] w-[7%] -translate-x-1/2 -translate-y-1/2 rounded border border-amber-100/10 bg-amber-100/[0.04]" />

              <div className="relative z-10 flex h-full min-h-[560px] flex-col items-center justify-center gap-2 px-4 py-8">

                <RoleGroup
                  label={ROLE_LABELS.WK}
                  players={groupedPlayers.WK}
                  onRemovePlayer={onRemovePlayer}
                />

                <RoleGroup
                  label={ROLE_LABELS.BAT}
                  players={groupedPlayers.BAT}
                  onRemovePlayer={onRemovePlayer}
                />

                <RoleGroup
                  label={ROLE_LABELS.AR}
                  players={groupedPlayers.AR}
                  onRemovePlayer={onRemovePlayer}
                />

                <RoleGroup
                  label={ROLE_LABELS.BOWL}
                  players={groupedPlayers.BOWL}
                  onRemovePlayer={onRemovePlayer}
                />

                {players.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-5 py-4 text-center backdrop-blur-sm">
                    <p className="text-sm font-semibold text-white/70">
                      Your XI is empty
                    </p>

                    <p className="mt-1 text-xs text-white/40">
                      Spin to select your first player
                    </p>
                  </div>
                )}
              </div>

              <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white/40 backdrop-blur-sm">
                Cricket Stadium
              </div>
            </div>
          </div>

          {/* PITCH DETAILS */}
          <aside className="flex min-h-0 flex-col border-l border-[var(--line)] bg-black/10 p-4">

            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Pitch Details
            </p>

            <h2 className="mt-1 text-base font-black">
              {pitch?.title ?? "Pitch information"}
            </h2>

            <div className="mt-3 rounded-lg border border-[var(--line)] bg-black/10 px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Stadium
              </p>

              <p className="mt-1 text-sm font-bold">
                Stadium information
              </p>
            </div>

            {pitch && (
              <>
                <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
                  {pitch.summary}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <PitchStat
                    label="Batting"
                    value={pitch.batting}
                  />

                  <PitchStat
                    label="Pace"
                    value={pitch.pace}
                  />

                  <PitchStat
                    label="Spin"
                    value={pitch.spin}
                  />

                  <PitchStat
                    label="Dew"
                    value={pitch.dew}
                  />
                </div>

                <div className="mt-3 rounded-lg border border-[var(--line)] bg-black/10 px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Strategy
                  </p>

                  <p className="mt-1 text-[11px] leading-5">
                    {pitch.strategy}
                  </p>
                </div>
              </>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

function RoleGroup({
  label,
  players,
  onRemovePlayer,
}: {
  label: string;
  players: IPLPlayer[];
  onRemovePlayer: (playerId: string) => void;
}) {
  if (players.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-[440px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 backdrop-blur-sm">

      <p className="mb-1.5 text-center text-[9px] font-black uppercase tracking-[0.16em] text-white/50">
        {label}
      </p>

      <div className="flex flex-wrap justify-center gap-1.5">
        {players.map((player) => (
          <div
            key={player.id}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2 py-1"
          >
            <span className="max-w-[150px] truncate text-[11px] font-semibold text-white/90">
              {player.name}
            </span>

            <button
              type="button"
              onClick={() =>
                onRemovePlayer(player.id)
              }
              className="text-sm leading-none text-white/30 transition hover:text-red-400"
              aria-label={`Remove ${player.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PitchStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-0.5 text-sm font-black">
        {value}
      </p>
    </div>
  );
}