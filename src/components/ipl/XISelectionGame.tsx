"use client";

import { useEffect, useMemo, useState } from "react";

import ChallengeRandomizer from "./ChallengeRandomizer";
import IPLGame from "./IPLGame";
import type {
  IPLChallenge,
  IPLGameState,
  IPLPlayer,
} from "@/types/ipl";

const MAX_PLAYERS = 11;

export default function XISelectionGame() {
  const [challenge, setChallenge] =
    useState<IPLChallenge | null>(
      null
    );

  const [players, setPlayers] =
    useState<IPLPlayer[]>([]);

  const [selectedPlayerIds, setSelectedPlayerIds] =
    useState<string[]>([]);

  const [searchQuery, setSearchQuery] =
    useState("");

    const [gameState, setGameState] =
  useState<IPLGameState>(
    "challenge"
  );

  /*
   * Receive a new challenge and its
   * valid player pool from the randomizer.
   */
function handleChallengeReady(
  nextChallenge: IPLChallenge,
  nextPlayers: IPLPlayer[]
) {
  setChallenge(
    nextChallenge
  );

  setPlayers(
    nextPlayers
  );

  /*
   * A new challenge invalidates
   * the previously selected XI.
   */
  setSelectedPlayerIds([]);

  setSearchQuery("");

  setGameState(
    "selection"
  );
}
function handleContinue() {
  if (
    selectedPlayers.length !==
    MAX_PLAYERS
  ) {
    return;
  }

  /*
   * The XI is complete and valid.
   *
   * We move into the ready state
   * before implementing the actual
   * gameplay engine.
   */
  setGameState(
    "ready"
  );
}
  /*
   * Filter players locally.
   *
   * The player pool is already limited
   * to the selected team-season.
   */
  const filteredPlayers =
    useMemo(() => {
      const normalizedQuery =
        searchQuery
          .trim()
          .toLowerCase();

      if (!normalizedQuery) {
        return players;
      }

      return players.filter(
        (player) =>
          player.name
            .toLowerCase()
            .includes(
              normalizedQuery
            )
      );
    }, [
      players,
      searchQuery,
    ]);

  /*
   * Resolve selected players while
   * preserving selection order.
   */
  const selectedPlayers =
    useMemo(() => {
      const playerMap =
        new Map(
          players.map(
            (player) => [
              player.id,
              player,
            ]
          )
        );

      return selectedPlayerIds
        .map(
          (playerId) =>
            playerMap.get(
              playerId
            )
        )
        .filter(
          (
            player
          ): player is IPLPlayer =>
            Boolean(player)
        );
    }, [
      players,
      selectedPlayerIds,
    ]);

  /*
   * Toggle a player in/out of the XI.
   */
  function handleTogglePlayer(
    playerId: string
  ) {
    setSelectedPlayerIds(
      (currentSelection) => {
        const alreadySelected =
          currentSelection.includes(
            playerId
          );

        /*
         * Remove an already selected
         * player.
         */
        if (alreadySelected) {
          return currentSelection.filter(
            (id) =>
              id !== playerId
          );
        }

        /*
         * Never allow more than 11
         * players in the XI.
         */
        if (
          currentSelection.length >=
          MAX_PLAYERS
        ) {
          return currentSelection;
        }

        /*
         * Add the player.
         */
        return [
          ...currentSelection,
          playerId,
        ];
      }
    );
  }

  /*
   * Safety check:
   *
   * If the available player pool changes,
   * remove any selected IDs that no longer
   * belong to it.
   */
  useEffect(() => {
    const validPlayerIds =
      new Set(
        players.map(
          (player) =>
            player.id
        )
      );

    setSelectedPlayerIds(
      (currentSelection) =>
        currentSelection.filter(
          (playerId) =>
            validPlayerIds.has(
              playerId
            )
        )
    );
  }, [players]);
{gameState === "playing" &&
  challenge && (
    <IPLGame
      challenge={challenge}
      selectedPlayers={selectedPlayers}
      onBackToSelection={() =>
        setGameState(
          "selection"
        )
      }
    />
  )}
  return (
    <main className="w-full">
        {gameState === "ready" &&
  challenge && (
    <section className="card mx-auto max-w-3xl p-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
        Playing XI Ready
      </p>

      <h1 className="mt-2 text-2xl font-black">
        Your XI is locked in
      </h1>

      <p className="mt-2 text-sm text-[var(--muted)]">
        You selected 11 players from{" "}
        {challenge.team.name} in the{" "}
        {challenge.season.season} IPL season.
      </p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {selectedPlayers.map(
          (
            player,
            index
          ) => (
            <div
              key={player.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-xs font-black text-[var(--accent)]">
                {index + 1}
              </span>

              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  {player.name}
                </p>

                <p className="text-xs text-[var(--muted)]">
                  {player.stats.runs} runs
                  {" · "}
                  {player.stats.wickets} wickets
                </p>
              </div>
            </div>
          )
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() =>
            setGameState(
              "selection"
            )
          }
          className="btn btn-secondary"
        >
          Edit XI
        </button>

        <button
          type="button"
          onClick={() =>
            setGameState(
              "playing"
            )
          }
          className="btn btn-primary"
        >
          Start Game
        </button>
      </div>
    </section>
  )}
      {gameState !== "ready" &&
  gameState !== "playing" && (
    <>
      <ChallengeRandomizer
        onChallengeReady={
          handleChallengeReady
        }
      />

      {challenge && (
        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* =====================
              AVAILABLE PLAYERS
          ===================== */}

          <section className="card overflow-hidden">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                    Available Players
                  </p>

                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {challenge.team.name}
                    {" · "}
                    {
                      challenge.season
                        .season
                    }
                  </p>
                </div>

                <span className="text-sm font-semibold text-[var(--muted)]">
                  {
                    filteredPlayers.length
                  }{" "}
                  players
                </span>
              </div>

              <input
                type="search"
                value={
                  searchQuery
                }
                onChange={(event) =>
                  setSearchQuery(
                    event.target.value
                  )
                }
                placeholder="Search players..."
                className="mt-4 w-full rounded-xl border border-[var(--line)] bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]"
              />
            </div>

            <div className="divide-y divide-[var(--line)]">
              {filteredPlayers.map(
                (player) => {
                  const isSelected =
                    selectedPlayerIds.includes(
                      player.id
                    );

                  return (
                    <button
                      key={
                        player.id
                      }
                      type="button"
                      onClick={() =>
                        handleTogglePlayer(
                          player.id
                        )
                      }
                      className={`flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition ${
                        isSelected
                          ? "bg-[var(--accent)]/10"
                          : "hover:bg-[var(--surface-hover)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {
                            player.name
                          }
                        </p>

                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {
                            player.stats
                              .matches
                          }{" "}
                          matches
                          {" · "}
                          {
                            player.stats
                              .runs
                          }{" "}
                          runs
                          {" · "}
                          {
                            player.stats
                              .wickets
                          }{" "}
                          wickets
                        </p>
                      </div>

                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                          isSelected
                            ? "bg-[var(--accent)] text-white"
                            : "border border-[var(--line)] text-[var(--muted)]"
                        }`}
                      >
                        {isSelected
                          ? "✓"
                          : "+"}
                      </span>
                    </button>
                  );
                }
              )}

              {filteredPlayers.length ===
                0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-semibold">
                    No players found
                  </p>

                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Try a different
                    search.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* =====================
              SELECTED XI
          ===================== */}

          <aside className="card h-fit overflow-hidden lg:sticky lg:top-6">
            <div className="border-b border-[var(--line)] px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                Your Playing XI
              </p>

              <div className="mt-2 flex items-end justify-between">
                <p className="text-sm text-[var(--muted)]">
                  Select your best
                  combination
                </p>

                <p className="text-lg font-black">
                  {
                    selectedPlayers.length
                  }
                  /{MAX_PLAYERS}
                </p>
              </div>
            </div>

            <div className="p-3">
              {selectedPlayers.length ===
              0 ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center">
                  <p className="text-sm font-semibold">
                    Your XI is empty
                  </p>

                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Select players from
                    the list.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedPlayers.map(
                    (
                      player,
                      index
                    ) => (
                      <button
                        key={
                          player.id
                        }
                        type="button"
                        onClick={() =>
                          handleTogglePlayer(
                            player.id
                          )
                        }
                        className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 text-left transition hover:bg-[var(--surface-hover)]"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-xs font-black text-[var(--accent)]">
                          {
                            index + 1
                          }
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">
                            {
                              player.name
                            }
                          </p>

                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {
                              player.stats
                                .runs
                            }{" "}
                            runs
                            {" · "}
                            {
                              player.stats
                                .wickets
                            }{" "}
                            wickets
                          </p>
                        </div>

                        <span className="text-xs text-[var(--muted)]">
                          Remove
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--line)] p-4">
<button
  type="button"
  onClick={
    handleContinue
  }
  disabled={
    selectedPlayers.length !==
    MAX_PLAYERS
  }
  className="btn btn-primary w-full"
>
  Continue
</button>

              {selectedPlayers.length !==
                MAX_PLAYERS && (
                <p className="mt-2 text-center text-xs text-[var(--muted)]">
                  Select{" "}
                  {MAX_PLAYERS -
                    selectedPlayers.length}{" "}
                  more{" "}
                  {MAX_PLAYERS -
                    selectedPlayers.length ===
                  1
                    ? "player"
                    : "players"}
                </p>
              )}
            </div>
          </aside>
        </section>
            )}
    </>
  )}
    </main>
  );
  
}