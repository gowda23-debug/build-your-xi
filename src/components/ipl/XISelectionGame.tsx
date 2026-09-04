"use client";

import { useMemo, useState } from "react";

import ChallengeRandomizer from "./ChallengeRandomizer";
import IPLGame from "./IPLGame";

import type {
  IPLChallenge,
  IPLGameState,
  IPLPlayer,
} from "@/types/ipl";

const MAX_PLAYERS = 11;

export default function XISelectionGame() {
  /*
   * The currently spun challenge.
   *
   * This exists only while the user is
   * choosing one player from that challenge.
   */
  const [challenge, setChallenge] =
    useState<IPLChallenge | null>(
      null
    );

  /*
   * Player pool belonging to the current
   * team-season challenge.
   */
  const [players, setPlayers] =
    useState<IPLPlayer[]>([]);

  /*
   * Selected players are stored as complete
   * player objects.
   *
   * This is important because every new spin
   * can replace the available player pool.
   * Previously selected players must remain
   * available in the Playing XI.
   */
  const [selectedPlayers, setSelectedPlayers] =
    useState<IPLPlayer[]>([]);

  const [searchQuery, setSearchQuery] =
    useState("");

  const [gameState, setGameState] =
    useState<IPLGameState>(
      "challenge"
    );

  /*
   * Used to remount the randomizer after
   * every completed player selection.
   *
   * This resets its internal challenge state
   * and brings the Spin button back.
   */
  const [randomizerKey, setRandomizerKey] =
    useState(0);

  /*
   * Receive a freshly generated challenge
   * and its valid player pool.
   *
   * At this point the player list becomes
   * visible and the user can choose exactly
   * one player.
   */
  function handleChallengeReady(
    nextChallenge: IPLChallenge,
    nextPlayers: IPLPlayer[]
  ) {
    if (
      selectedPlayers.length >=
      MAX_PLAYERS
    ) {
      return;
    }

    setChallenge(
      nextChallenge
    );

    setPlayers(
      nextPlayers
    );

    setSearchQuery("");

    setGameState(
      "selection"
    );
  }

  /*
   * Select exactly one player from the
   * current spin.
   *
   * Once selected:
   *
   * 1. Player is added to the XI.
   * 2. Current player pool disappears.
   * 3. Current challenge disappears.
   * 4. Randomizer is reset.
   * 5. User can spin again.
   */
  function handleSelectPlayer(
    player: IPLPlayer
  ) {
    if (
      selectedPlayers.length >=
      MAX_PLAYERS
    ) {
      return;
    }

    const alreadySelected =
      selectedPlayers.some(
        (selectedPlayer) =>
          selectedPlayer.id ===
          player.id
      );

    /*
     * Safety protection against duplicate
     * player selection.
     */
    if (alreadySelected) {
      return;
    }

    setSelectedPlayers(
      (currentPlayers) => [
        ...currentPlayers,
        player,
      ]
    );

    /*
     * Remove the current challenge and pool.
     *
     * This makes the player list disappear
     * immediately after selecting one player.
     */
    setChallenge(
      null
    );

    setPlayers([]);

    setSearchQuery("");

    /*
     * Reset the randomizer so the user gets
     * a fresh Spin button.
     */
    setRandomizerKey(
      (currentKey) =>
        currentKey + 1
    );

    setGameState(
      "challenge"
    );
  }

  /*
   * Remove a player from the XI.
   *
   * We keep this for now because the user
   * should be able to correct a selection.
   */
  function handleRemovePlayer(
    playerId: string
  ) {
    setSelectedPlayers(
      (currentPlayers) =>
        currentPlayers.filter(
          (player) =>
            player.id !== playerId
        )
    );
  }

  /*
   * Filter only the current challenge pool.
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
   * The XI can continue only when all
   * 11 players have been selected.
   *
   * Role validation will be added after
   * we finalize the player-role system.
   */
  const canContinue =
    selectedPlayers.length ===
    MAX_PLAYERS;

  function handleContinue() {
    if (!canContinue) {
      return;
    }

    setGameState(
      "ready"
    );
  }

  function handleStartGame() {
    if (!canContinue) {
      return;
    }

    setGameState(
      "playing"
    );
  }

  /*
   * =========================
   * PLAYING STATE
   * =========================
   */

  if (
    gameState === "playing" &&
    challenge
  ) {
    return (
      <IPLGame
        challenge={challenge}
        selectedPlayers={
          selectedPlayers
        }
        onBackToSelection={() =>
          setGameState(
            "challenge"
          )
        }
      />
    );
  }

  /*
   * =========================
   * READY STATE
   * =========================
   */

  if (
    gameState === "ready"
  ) {
    return (
      <main className="w-full">
        <section className="card mx-auto max-w-3xl p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Playing XI Ready
          </p>

          <h1 className="mt-2 text-2xl font-black">
            Your XI is locked in
          </h1>

          <p className="mt-2 text-sm text-[var(--muted)]">
            You have selected{" "}
            {selectedPlayers.length} players.
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
                  "challenge"
                )
              }
              className="btn btn-secondary"
            >
              Edit XI
            </button>

            <button
              type="button"
              onClick={
                handleStartGame
              }
              className="btn btn-primary"
            >
              Start Game
            </button>
          </div>
        </section>
      </main>
    );
  }

  /*
   * =========================
   * SELECTION / SPIN STATE
   * =========================
   */

  return (
    <main className="w-full">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* =====================
            LEFT SIDE
        ===================== */}

        <section className="min-w-0">
          {/* =====================
              RANDOMIZER
          ===================== */}

          {!challenge &&
            selectedPlayers.length <
              MAX_PLAYERS && (
              <ChallengeRandomizer
                key={
                  randomizerKey
                }
                onChallengeReady={
                  handleChallengeReady
                }
              />
            )}

          {/* =====================
              PLAYER POOL
          ===================== */}

          {challenge && (
            <section className="card overflow-hidden">
              {/* HEADER */}

              <div className="border-b border-[var(--line)] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                      Available Players
                    </p>

                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {
                        challenge.team
                          .name
                      }

                      {" · "}

                      {
                        challenge.season
                          .season
                      }
                    </p>
                  </div>

                  <span className="rounded-lg bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-bold text-[var(--accent)]">
                    Select 1 Player
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

              {/* SCROLLABLE PLAYER LIST */}

              <div className="max-h-[calc(100vh-280px)] overflow-y-auto divide-y divide-[var(--line)]">
                {filteredPlayers.map(
                  (player) => {
                    const alreadySelected =
                      selectedPlayers.some(
                        (
                          selectedPlayer
                        ) =>
                          selectedPlayer.id ===
                          player.id
                      );

                    return (
                      <button
                        key={player.id}
                        type="button"
                        disabled={
                          alreadySelected
                        }
                        onClick={() =>
                          handleSelectPlayer(
                            player
                          )
                        }
                        className={[
                          "flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition",
                          alreadySelected
                            ? "cursor-not-allowed opacity-40"
                            : "hover:bg-[var(--surface-hover)]",
                        ].join(" ")}
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

                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-sm font-black text-[var(--accent)]">
                          +
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
                      Try a different search.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* =====================
              XI COMPLETE
          ===================== */}

          {selectedPlayers.length ===
            MAX_PLAYERS && (
            <section className="card p-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                Selection Complete
              </p>

              <h2 className="mt-2 text-2xl font-black">
                Your XI is ready
              </h2>

              <p className="mt-2 text-sm text-[var(--muted)]">
                You have selected all
                {MAX_PLAYERS} players.
              </p>

              <button
                type="button"
                onClick={
                  handleContinue
                }
                className="btn btn-primary mt-5"
              >
                Continue
              </button>
            </section>
          )}
        </section>

        {/* =====================
            RIGHT SIDE
        ===================== */}

        <aside className="card h-fit overflow-hidden lg:sticky lg:top-6">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              Your Playing XI
            </p>

            <div className="mt-2 flex items-end justify-between">
              <p className="text-sm text-[var(--muted)]">
                One player per spin
              </p>

              <p className="text-lg font-black">
                {
                  selectedPlayers.length
                }
                /{MAX_PLAYERS}
              </p>
            </div>
          </div>

          <div className="max-h-[calc(100vh-260px)] overflow-y-auto p-3">
            {selectedPlayers.length ===
            0 ? (
              <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center">
                <p className="text-sm font-semibold">
                  Your XI is empty
                </p>

                <p className="mt-1 text-xs text-[var(--muted)]">
                  Spin a challenge and
                  choose your first player.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
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

                      <button
                        type="button"
                        onClick={() =>
                          handleRemovePlayer(
                            player.id
                          )
                        }
                        className="text-xs font-semibold text-[var(--muted)] transition hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}