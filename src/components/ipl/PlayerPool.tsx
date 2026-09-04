"use client";

import { useMemo, useState } from "react";

import {
  Check,
  Search,
  UserPlus,
  X,
} from "lucide-react";

import type {
  IPLPlayer,
} from "@/types/ipl";

type PlayerPoolProps = {
  players: IPLPlayer[];

  selectedPlayerIds: string[];

  onSelectPlayer: (
    player: IPLPlayer
  ) => void;

  maxPlayersReached: boolean;
};

export default function PlayerPool({
  players,
  selectedPlayerIds,
  onSelectPlayer,
  maxPlayersReached,
}: PlayerPoolProps) {
  const [searchQuery, setSearchQuery] =
    useState("");

  const filteredPlayers =
    useMemo(() => {
      const query =
        searchQuery
          .trim()
          .toLowerCase();

      if (!query) {
        return players;
      }

      return players.filter(
        (player) =>
          player.name
            .toLowerCase()
            .includes(query)
      );
    }, [
      players,
      searchQuery,
    ]);

  return (
    <section className="card flex min-h-[650px] flex-col overflow-hidden">
      {/* =========================
          HEADER
      ========================= */}

      <div className="border-b border-[var(--line)] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent)]">
          Available Squad
        </p>

        <h2 className="mt-3 text-3xl font-black">
          Player Pool
        </h2>

        <p className="mt-2 text-sm text-[var(--muted)]">
          Search and select players from
          the available squad.
        </p>

        {/* SEARCH */}

        <div className="relative mt-5">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />

          <input
            type="search"
            value={searchQuery}
            onChange={(event) =>
              setSearchQuery(
                event.target.value
              )
            }
            placeholder="Search players..."
            className="w-full rounded-xl border border-[var(--line)] bg-white/[0.03] py-3 pl-11 pr-11 text-sm outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]/60"
          />

          {searchQuery && (
            <button
              type="button"
              onClick={() =>
                setSearchQuery("")
              }
              className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-white/5 hover:text-white"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <p className="mt-3 text-xs text-[var(--muted)]">
          Showing{" "}
          {filteredPlayers.length}{" "}
          of {players.length} players
        </p>
      </div>

      {/* =========================
          PLAYER LIST
      ========================= */}

      <div className="flex-1 divide-y divide-[var(--line)]">
        {filteredPlayers.map(
          (player) => {
            const isSelected =
              selectedPlayerIds.includes(
                player.id
              );

            const isDisabled =
              !isSelected &&
              maxPlayersReached;

            return (
              <article
                key={player.id}
                className="p-5 transition hover:bg-white/[0.02]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="truncate text-lg font-black">
                        {player.name}
                      </h3>

                      {isSelected && (
                        <span className="rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                          Selected
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {player.stats.matches} matches
                    </p>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                      <Stat
                        label="Runs"
                        value={
                          player.stats.runs
                        }
                      />

                      <Stat
                        label="HS"
                        value={
                          player.stats
                            .highestScore
                        }
                      />

                      <Stat
                        label="4s"
                        value={
                          player.stats.fours
                        }
                      />

                      <Stat
                        label="6s"
                        value={
                          player.stats.sixes
                        }
                      />

                      <Stat
                        label="Wkts"
                        value={
                          player.stats.wickets
                        }
                      />

                      <Stat
                        label="Overs"
                        value={
                          formatOvers(
                            player.stats
                              .ballsBowled
                          )
                        }
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={
                      isSelected ||
                      isDisabled
                    }
                    onClick={() =>
                      onSelectPlayer(
                        player
                      )
                    }
                    className={
                      isSelected
                        ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                    }
                    aria-label={
                      isSelected
                        ? `${player.name} selected`
                        : `Select ${player.name}`
                    }
                  >
                    {isSelected ? (
                      <Check size={18} />
                    ) : (
                      <UserPlus size={18} />
                    )}
                  </button>
                </div>
              </article>
            );
          }
        )}

        {filteredPlayers.length ===
          0 && (
          <div className="flex min-h-[400px] flex-col items-center justify-center px-6 text-center">
            <Search
              size={30}
              className="text-[var(--muted)]"
            />

            <h3 className="mt-4 text-xl font-black">
              No players found
            </h3>

            <p className="mt-2 text-sm text-[var(--muted)]">
              Try a different player name.
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
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-1 text-sm font-black">
        {value}
      </p>
    </div>
  );
}

function formatOvers(
  balls: number
) {
  const overs =
    Math.floor(
      balls / 6
    );

  const remainingBalls =
    balls % 6;

  return `${overs}.${remainingBalls}`;
}