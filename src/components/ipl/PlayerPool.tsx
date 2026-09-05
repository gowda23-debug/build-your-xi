"use client";

import {
  Search,
  Plus,
} from "lucide-react";

import type {
  IPLPlayer,
  PlayerRole,
} from "@/types/ipl";

import {
  getBattingAverage,
  getBowlingAverage,
  getEconomyRate,
  getStrikeRate,
} from "@/lib/ipl-challenge/player-stats";

type PlayerPoolProps = {
  players: IPLPlayer[];

  selectedPlayers: IPLPlayer[];

  searchQuery: string;

  roleFilter:
    | "ALL"
    | PlayerRole;

  onSearchChange: (
    value: string
  ) => void;

  onRoleFilterChange: (
    role:
      | "ALL"
      | PlayerRole
  ) => void;

  onSelectPlayer: (
    player: IPLPlayer
  ) => void;

  canSelectPlayer: (
    player: IPLPlayer
  ) => boolean;
};

const FILTERS = [
  {
    value: "ALL",
    label: "All",
  },
  {
    value: "BAT",
    label: "Bat",
  },
  {
    value: "WK",
    label: "WK",
  },
  {
    value: "AR",
    label: "AR",
  },
  {
    value: "BOWL",
    label: "Bowl",
  },
] as const;

function getRoleLabel(
  role: PlayerRole
) {
  switch (role) {
    case "BAT":
      return "Batter";

    case "WK":
      return "Wicketkeeper";

    case "AR":
      return "All-Rounder";

    case "BOWL":
      return "Bowler";
  }
}

function formatStat(
  value: number | null
) {
  return value === null
    ? "—"
    : value.toFixed(2);
}

export default function PlayerPool({
  players,
  searchQuery,
  roleFilter,
  onSearchChange,
  onRoleFilterChange,
  onSelectPlayer,
  canSelectPlayer,
}: PlayerPoolProps) {
  const filteredPlayers =
    players.filter(
      (player) => {
        const normalizedSearch =
          searchQuery
            .toLowerCase()
            .trim();

        const matchesSearch =
          player.name
            .toLowerCase()
            .includes(
              normalizedSearch
            );

        const matchesRole =
          roleFilter === "ALL" ||
          player.role ===
            roleFilter;

        return (
          matchesSearch &&
          matchesRole
        );
      }
    );

  return (
    <section className="card flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* =====================================
          HEADER
      ====================================== */}

      <div className="border-b border-[var(--line)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Available Players
            </p>

            <p className="mt-1 text-xs text-[var(--muted)]">
              Select exactly one player
            </p>
          </div>

          <span className="text-sm font-black">
            {filteredPlayers.length}
          </span>
        </div>

        {/* Search */}

        <div className="relative mt-3">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />

          <input
            type="search"
            value={searchQuery}
            onChange={(event) =>
              onSearchChange(
                event.target.value
              )
            }
            placeholder="Search players..."
            className="w-full rounded-lg border border-[var(--line)] bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Role filters */}

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(
            (filter) => (
              <button
                key={
                  filter.value
                }
                type="button"
                onClick={() =>
                  onRoleFilterChange(
                    filter.value
                  )
                }
                className={[
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition",
                  roleFilter ===
                  filter.value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)]",
                ].join(" ")}
              >
                {
                  filter.label
                }
              </button>
            )
          )}
        </div>
      </div>

      {/* =====================================
          PLAYER LIST
      ====================================== */}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredPlayers.map(
          (player) => {
            const canSelect =
              canSelectPlayer(
                player
              );

            const battingAverage =
              getBattingAverage(
                player
              );

            const strikeRate =
              getStrikeRate(
                player
              );

            const bowlingAverage =
              getBowlingAverage(
                player
              );

            const economyRate =
              getEconomyRate(
                player
              );

            return (
              <button
                key={player.id}
                type="button"
                disabled={
                  !canSelect
                }
                onClick={() =>
                  onSelectPlayer(
                    player
                  )
                }
                className={[
                  "w-full border-b border-[var(--line)] px-4 py-3 text-left transition",
                  canSelect
                    ? "hover:bg-[var(--surface-hover)]"
                    : "cursor-not-allowed opacity-40",
                ].join(" ")}
              >
                {/* Player identity */}

                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">
                        {
                          player.name
                        }
                      </p>

                      <span className="rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-black text-[var(--accent)]">
                        {
                          player.role
                        }
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {
                        getRoleLabel(
                          player.role
                        )
                      }
                    </p>
                  </div>

                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)]">
                    <Plus
                      size={16}
                      className="text-[var(--accent)]"
                    />
                  </span>
                </div>

                {/* =================================
                    REQUIRED PLAYER STATS
                ================================== */}

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      Matches
                    </p>

                    <p className="mt-0.5 text-xs font-bold">
                      {
                        player.stats
                          .matches
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      Batting Avg
                    </p>

                    <p className="mt-0.5 text-xs font-bold">
                      {formatStat(
                        battingAverage
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      Strike Rate
                    </p>

                    <p className="mt-0.5 text-xs font-bold">
                      {formatStat(
                        strikeRate
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      Highest Score
                    </p>

                    <p className="mt-0.5 text-xs font-bold">
                      {
                        player.stats
                          .highestScore
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      Wickets
                    </p>

                    <p className="mt-0.5 text-xs font-bold">
                      {
                        player.stats
                          .wickets
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      Bowling Avg
                    </p>

                    <p className="mt-0.5 text-xs font-bold">
                      {formatStat(
                        bowlingAverage
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      Economy Rate
                    </p>

                    <p className="mt-0.5 text-xs font-bold">
                      {formatStat(
                        economyRate
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      Role
                    </p>

                    <p className="mt-0.5 text-xs font-bold">
                      {
                        getRoleLabel(
                          player.role
                        )
                      }
                    </p>
                  </div>
                </div>
              </button>
            );
          }
        )}

        {filteredPlayers.length ===
          0 && (
          <div className="p-8 text-center">
            <p className="text-sm font-bold">
              No players found
            </p>

            <p className="mt-1 text-xs text-[var(--muted)]">
              Try another search or role filter.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}