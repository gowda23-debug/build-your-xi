"use client";

import { Search, Plus } from "lucide-react";

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
  roleFilter: "ALL" | PlayerRole;

  onSearchChange: (value: string) => void;

  onRoleFilterChange: (
    role: "ALL" | PlayerRole
  ) => void;

  onSelectPlayer: (player: IPLPlayer) => void;

  canSelectPlayer: (player: IPLPlayer) => boolean;
};

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "BAT", label: "BAT" },
  { value: "WK", label: "WK" },
  { value: "AR", label: "AR" },
  { value: "BOWL", label: "BOWL" },
] as const;

function getRoleLabel(role: PlayerRole) {
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

function formatStat(value: number | null) {
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
  const normalizedSearch =
    searchQuery.toLowerCase().trim();

  const filteredPlayers = players.filter(
    (player) => {
      const matchesSearch =
        player.name
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesRole =
        roleFilter === "ALL" ||
        player.role === roleFilter;

      return (
        matchesSearch &&
        matchesRole
      );
    }
  );

  return (
    <section className="card flex min-h-0 flex-1 flex-col overflow-hidden">

      {/* HEADER */}
      <div className="shrink-0 border-b border-[var(--line)] px-3 py-2.5">

        <div className="flex items-center justify-between gap-3">

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
              Available Players
            </p>

            <p className="mt-0.5 text-[10px] text-[var(--muted)]">
              Select one player
            </p>
          </div>

          <span className="text-xs font-black">
            {filteredPlayers.length}
          </span>
        </div>

        {/* SEARCH */}
        <div className="relative mt-2">

          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />

          <input
            type="search"
            value={searchQuery}
            onChange={(event) =>
              onSearchChange(
                event.target.value
              )
            }
            placeholder="Search..."
            className="h-8 w-full rounded-lg border border-[var(--line)] bg-black/10 pl-8 pr-2.5 text-xs outline-none transition focus:border-[var(--accent)]"
          />
        </div>

        {/* FILTERS */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() =>
                onRoleFilterChange(
                  filter.value
                )
              }
              className={[
                "shrink-0 rounded-md px-2.5 py-1 text-[10px] font-bold transition",
                roleFilter === filter.value
                  ? "bg-[var(--accent)] text-[#112016]"
                  : "border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
              ].join(" ")}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* ONLY SCROLLABLE AREA */}
      <div className="min-h-0 flex-1 overflow-y-auto">

        {filteredPlayers.map((player) => {
          const canSelect =
            canSelectPlayer(player);

          const battingAverage =
            getBattingAverage(player);

          const strikeRate =
            getStrikeRate(player);

          const bowlingAverage =
            getBowlingAverage(player);

          const economyRate =
            getEconomyRate(player);

          return (
            <button
              key={player.id}
              type="button"
              disabled={!canSelect}
              onClick={() =>
                onSelectPlayer(player)
              }
              className={[
                "group w-full border-b border-[var(--line)] px-3 py-2.5 text-left transition-all duration-150",
                canSelect
                  ? "hover:bg-[var(--surface-hover)] hover:border-l-2 hover:border-l-[var(--accent)] hover:pl-[10px]"
                  : "cursor-not-allowed opacity-35",
              ].join(" ")}
            >

              {/* PLAYER HEADER */}
              <div className="flex items-start justify-between gap-3">

                <div className="min-w-0">

                  <div className="flex items-center gap-1.5">

                    <p className="truncate text-xs font-bold transition group-hover:text-[var(--accent)]">
                      {player.name}
                    </p>

                    <span className="shrink-0 rounded-md bg-[var(--accent)]/10 px-1.5 py-0.5 text-[9px] font-black text-[var(--accent)]">
                      {player.role}
                    </span>
                  </div>

                  <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                    {getRoleLabel(player.role)}
                  </p>
                </div>

                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--line)] transition group-hover:border-[var(--accent)] group-hover:bg-[var(--accent)]/10">
                  <Plus
                    size={13}
                    className="text-[var(--accent)]"
                  />
                </span>
              </div>

              {/* EXACTLY THE REQUESTED STATS */}
              <div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1.5">

                <Stat
                  label="Matches"
                  value={String(
                    player.stats.matches
                  )}
                />

                <Stat
                  label="Bat Avg"
                  value={formatStat(
                    battingAverage
                  )}
                />

                <Stat
                  label="Strike Rate"
                  value={formatStat(
                    strikeRate
                  )}
                />

                <Stat
                  label="Highest"
                  value={String(
                    player.stats.highestScore
                  )}
                />

                <Stat
                  label="Wickets"
                  value={String(
                    player.stats.wickets
                  )}
                />

                <Stat
                  label="Bowl Avg"
                  value={formatStat(
                    bowlingAverage
                  )}
                />

                <Stat
                  label="Economy"
                  value={formatStat(
                    economyRate
                  )}
                />

                <Stat
                  label="Role"
                  value={getRoleLabel(
                    player.role
                  )}
                />
              </div>
            </button>
          );
        })}

        {filteredPlayers.length === 0 && (
          <div className="p-6 text-center">
            <p className="text-xs font-bold">
              No players found
            </p>

            <p className="mt-1 text-[10px] text-[var(--muted)]">
              Try another search or role.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[8px] uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-0.5 truncate text-[10px] font-bold">
        {value}
      </p>
    </div>
  );
}