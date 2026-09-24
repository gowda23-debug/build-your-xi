"use client";

import type { IPLChallenge, IPLPlayer } from "@/types/ipl";

type IPLGameProps = {
  challenge: IPLChallenge;
  selectedPlayers: IPLPlayer[];
  onBackToSelection: () => void;
};

function calculateScore(players: IPLPlayer[]) {
  if (players.length !== 11) return 0;

  const battingScore = players.reduce((total, player) => {
    const runs = Number(player.stats.runs ?? 0);

    return total + Math.min(5, runs / 100);
  }, 0);

  const bowlingScore = players.reduce((total, player) => {
    const wickets = Number(player.stats.wickets ?? 0);

    return total + Math.min(5, wickets / 5);
  }, 0);

  const roleCounts = {
    WK: players.filter((player) => player.role === "WK").length,
    BAT: players.filter((player) => player.role === "BAT").length,
    AR: players.filter((player) => player.role === "AR").length,
    BOWL: players.filter((player) => player.role === "BOWL").length,
  };

  let balanceBonus = 0;

  if (roleCounts.WK >= 1) balanceBonus += 5;
  if (roleCounts.BAT >= 4) balanceBonus += 5;
  if (roleCounts.AR >= 1) balanceBonus += 5;
  if (roleCounts.BOWL >= 3) balanceBonus += 5;
  if (roleCounts.AR + roleCounts.BOWL >= 5) balanceBonus += 5;

  const rawScore = battingScore + bowlingScore + balanceBonus;

  return Math.round(Math.min(100, Math.max(0, rawScore)));
}

export default function IPLGame({
  challenge,
  selectedPlayers,
  onBackToSelection,
}: IPLGameProps) {
  const score = calculateScore(selectedPlayers);

  const roleCounts = {
    WK: selectedPlayers.filter((player) => player.role === "WK").length,
    BAT: selectedPlayers.filter((player) => player.role === "BAT").length,
    AR: selectedPlayers.filter((player) => player.role === "AR").length,
    BOWL: selectedPlayers.filter((player) => player.role === "BOWL").length,
  };

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <section className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4">
        {/* Score */}
        <section className="card shrink-0 overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              IPL Challenge
            </p>

            <p className="mt-1 text-xs text-[var(--muted)]">
              {challenge.team.name} · {challenge.season.season}
            </p>

            <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              Your Score
            </p>

            <div className="mt-1">
              <span className="text-6xl font-black tracking-tight text-[var(--accent)]">
                {score}
              </span>

              <span className="ml-1 text-2xl font-bold text-[var(--muted)]">
                / 100
              </span>
            </div>

            <p className="mt-2 text-sm text-[var(--muted)]">
              Your Playing XI is complete.
            </p>
          </div>

          {/* Team / Season / XI summary */}
          <div className="grid grid-cols-2 divide-x divide-[var(--line)] sm:grid-cols-4">
            <SummaryItem label="Team" value={challenge.team.name} />
            <SummaryItem label="Season" value={challenge.season.season} />
            <SummaryItem label="Players" value="11 / 11" />
            <SummaryItem label="Record" value={`${score}-0`} />
          </div>
        </section>

        {/* Playing XI */}
        <section className="card min-h-0 flex-1 overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Your Playing XI
            </p>
          </div>

          <div className="grid min-h-0 grid-cols-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
            <RoleColumn
              label="Wicket Keepers"
              players={selectedPlayers.filter(
                (player) => player.role === "WK"
              )}
            />

            <RoleColumn
              label="Batters"
              players={selectedPlayers.filter(
                (player) => player.role === "BAT"
              )}
            />

            <RoleColumn
              label="All-Rounders"
              players={selectedPlayers.filter(
                (player) => player.role === "AR"
              )}
            />

            <RoleColumn
              label="Bowlers"
              players={selectedPlayers.filter(
                (player) => player.role === "BOWL"
              )}
            />
          </div>
        </section>

        {/* Score breakdown */}
        <section className="card shrink-0 overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-[var(--line)] sm:grid-cols-4">
            <SummaryItem label="WK" value={String(roleCounts.WK)} />
            <SummaryItem label="BAT" value={String(roleCounts.BAT)} />
            <SummaryItem label="AR" value={String(roleCounts.AR)} />
            <SummaryItem label="BOWL" value={String(roleCounts.BOWL)} />
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
        </section>
      </section>
    </main>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-black">{value}</p>
    </div>
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
    <div className="border-b border-[var(--line)] p-3 sm:border-r lg:border-b-0">
      <p className="mb-2 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </p>

      <div className="space-y-1.5">
        {players.map((player) => (
          <div
            key={player.id}
            className="rounded-lg border border-[var(--line)] bg-black/10 px-3 py-2"
          >
            <p className="truncate text-xs font-bold">{player.name}</p>

            <p className="mt-0.5 text-[10px] text-[var(--muted)]">
              {player.stats.runs} runs
              {" · "}
              {player.stats.wickets} wickets
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}