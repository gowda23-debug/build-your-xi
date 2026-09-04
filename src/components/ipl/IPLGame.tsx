"use client";

import type {
  IPLChallenge,
  IPLPlayer,
} from "@/types/ipl";

type IPLGameProps = {
  challenge: IPLChallenge;

  selectedPlayers: IPLPlayer[];

  onBackToSelection: () => void;
};

export default function IPLGame({
  challenge,
  selectedPlayers,
  onBackToSelection,
}: IPLGameProps) {
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* =========================
          MAIN GAME AREA
      ========================= */}

      <section className="card overflow-hidden">
        {/* =====================
            GAME HEADER
        ===================== */}

        <div className="border-b border-[var(--line)] px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            IPL Challenge
          </p>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black">
                {challenge.team.name}
              </h1>

              <p className="mt-1 text-sm text-[var(--muted)]">
                {challenge.season.season} Season
              </p>
            </div>

            <span className="rounded-lg bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-bold text-[var(--accent)]">
              Game Started
            </span>
          </div>
        </div>

        {/* =====================
            GAME PLACEHOLDER
        ===================== */}

        <div className="flex min-h-[420px] flex-col items-center justify-center px-5 py-10 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Build Your XI
          </p>

          <h2 className="mt-3 text-2xl font-black">
            Game starting...
          </h2>

          <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
            Your playing XI has been locked.
            The challenge mechanics will appear
            here.
          </p>
        </div>
      </section>

      {/* =========================
          PLAYING XI
      ========================= */}

      <aside className="card h-fit overflow-hidden lg:sticky lg:top-6">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Your Playing XI
          </p>

          <p className="mt-1 text-sm text-[var(--muted)]">
            {selectedPlayers.length} players selected
          </p>
        </div>

        <div className="divide-y divide-[var(--line)]">
          {selectedPlayers.map(
            (
              player,
              index
            ) => (
              <div
                key={player.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-xs font-black text-[var(--accent)]">
                  {index + 1}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {player.name}
                  </p>

                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {player.stats.runs} runs
                    {" · "}
                    {player.stats.wickets} wickets
                  </p>
                </div>
              </div>
            )
          )}
        </div>

        <div className="border-t border-[var(--line)] p-4">
          <button
            type="button"
            onClick={onBackToSelection}
            className="btn btn-secondary w-full"
          >
            Back to XI Selection
          </button>
        </div>
      </aside>
    </section>
  );
}