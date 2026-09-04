"use client";

import {
  useMemo,
  useState,
} from "react";

import ChallengeRandomizer from "./ChallengeRandomizer";
import IPLGame from "./IPLGame";
import PlayerPool from "./PlayerPool";
import PlayingXI from "./PlayingXI";

import {
  getRandomPitch,
} from "@/lib/ipl-challenge/pitches";

import {
  canAddPlayer,
  validateXI,
} from "@/lib/ipl-challenge/validate-xi";

import type {
  IPLChallenge,
  IPLGameState,
  IPLPlayer,
  PitchProfile,
  PlayerRole,
} from "@/types/ipl";

const MAX_PLAYERS = 11;

export default function XISelectionGame() {
  /*
   * Persistent game context.
   *
   * This is never cleared after a player
   * is selected.
   */
  const [
    gameChallenge,
    setGameChallenge,
  ] =
    useState<IPLChallenge | null>(
      null
    );

  /*
   * Current spin.
   *
   * This is cleared after selecting
   * one player.
   */
  const [
    currentChallenge,
    setCurrentChallenge,
  ] =
    useState<IPLChallenge | null>(
      null
    );

  const [
    currentPlayers,
    setCurrentPlayers,
  ] =
    useState<IPLPlayer[]>([]);

  const [
    selectedPlayers,
    setSelectedPlayers,
  ] =
    useState<IPLPlayer[]>([]);

  const [
    pitch,
    setPitch,
  ] =
    useState<PitchProfile | null>(
      null
    );

  const [
    gameState,
    setGameState,
  ] =
    useState<IPLGameState>(
      "challenge"
    );

  const [
    searchQuery,
    setSearchQuery,
  ] =
    useState("");

  const [
    roleFilter,
    setRoleFilter,
  ] =
    useState<
      "ALL" | PlayerRole
    >("ALL");

  const [
    randomizerKey,
    setRandomizerKey,
  ] =
    useState(0);

  function handleChallengeReady(
    challenge: IPLChallenge,
    players: IPLPlayer[]
  ) {
    setCurrentChallenge(
      challenge
    );

    setCurrentPlayers(
      players
    );

    /*
     * First spin defines the
     * persistent game context.
     */
    if (!gameChallenge) {
      setGameChallenge(
        challenge
      );

      setPitch(
        getRandomPitch()
      );
    }

    setSearchQuery("");
    setRoleFilter("ALL");

    setGameState(
      "selection"
    );
  }

  function handleSelectPlayer(
    player: IPLPlayer
  ) {
    const canSelect =
      canAddPlayer(
        selectedPlayers,
        player
      );

    if (!canSelect) {
      return;
    }

    setSelectedPlayers(
      (
        current
      ) => [
        ...current,
        player,
      ]
    );

    /*
     * Current spin ends.
     */
    setCurrentChallenge(
      null
    );

    setCurrentPlayers([]);

    setSearchQuery("");
    setRoleFilter("ALL");

    setRandomizerKey(
      (
        current
      ) =>
        current + 1
    );

    setGameState(
      "challenge"
    );
  }

  function handleRemovePlayer(
    playerId: string
  ) {
    setSelectedPlayers(
      (
        current
      ) =>
        current.filter(
          (
            player
          ) =>
            player.id !==
            playerId
        )
    );
  }

  const validation =
    useMemo(
      () =>
        validateXI(
          selectedPlayers
        ),
      [
        selectedPlayers,
      ]
    );

  function handleContinue() {
    if (
      !validation.valid
    ) {
      return;
    }

    setGameState(
      "ready"
    );
  }

  function handleStartGame() {
    if (
      !validation.valid ||
      !gameChallenge
    ) {
      return;
    }

    setGameState(
      "playing"
    );
  }

  /*
   * GAME
   */
  if (
    gameState ===
      "playing" &&
    gameChallenge
  ) {
    return (
      <IPLGame
        challenge={
          gameChallenge
        }
        selectedPlayers={
          selectedPlayers
        }
        onBackToSelection={() =>
          setGameState(
            "ready"
          )
        }
      />
    );
  }

  /*
   * READY
   */
  if (
    gameState ===
    "ready"
  ) {
    return (
      <main className="w-full">
        <section className="card mx-auto max-w-4xl p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Playing XI Ready
          </p>

          <h1 className="mt-2 text-2xl font-black">
            Your XI is ready
          </h1>

          <p className="mt-2 text-sm text-[var(--muted)]">
            {
              validation.counts.BAT
            }{" "}
            BAT ·{" "}
            {
              validation.counts.WK
            }{" "}
            WK ·{" "}
            {
              validation.counts.AR
            }{" "}
            AR ·{" "}
            {
              validation.counts.BOWL
            }{" "}
            BOWL
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {selectedPlayers.map(
              (
                player,
                index
              ) => (
                <div
                  key={
                    player.id
                  }
                  className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-xs font-black text-[var(--accent)]">
                    {
                      index + 1
                    }
                  </span>

                  <div>
                    <p className="text-sm font-bold">
                      {
                        player.name
                      }
                    </p>

                    <p className="text-xs text-[var(--muted)]">
                      {
                        player.role
                      }
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
   * MAIN SELECTION FLOW
   */
  return (
    <main className="flex min-h-0 w-full flex-1">
      <section className="grid min-h-0 w-full gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* LEFT */}

        <section className="flex min-h-0 flex-col">
          {selectedPlayers.length <
            MAX_PLAYERS && (
            <>
              {/* No player pool before spin */}

              {!currentChallenge && (
                <ChallengeRandomizer
                  key={
                    randomizerKey
                  }
                  onChallengeReady={
                    handleChallengeReady
                  }
                />
              )}

              {/* Player pool after spin */}

              {currentChallenge && (
                <PlayerPool
                  players={
                    currentPlayers
                  }
                  selectedPlayers={
                    selectedPlayers
                  }
                  searchQuery={
                    searchQuery
                  }
                  roleFilter={
                    roleFilter
                  }
                  onSearchChange={
                    setSearchQuery
                  }
                  onRoleFilterChange={
                    setRoleFilter
                  }
                  onSelectPlayer={
                    handleSelectPlayer
                  }
                  canSelectPlayer={(
                    player
                  ) =>
                    canAddPlayer(
                      selectedPlayers,
                      player
                    )
                  }
                />
              )}
            </>
          )}

          {selectedPlayers.length ===
            MAX_PLAYERS && (
            <section className="card p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                XI Complete
              </p>

              <h2 className="mt-2 text-xl font-black">
                Validate your team
              </h2>

              {!validation.valid && (
                <div className="mt-4 space-y-2">
                  {validation.errors.map(
                    (
                      error
                    ) => (
                      <p
                        key={
                          error
                        }
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                      >
                        {
                          error
                        }
                      </p>
                    )
                  )}
                </div>
              )}

              {validation.valid && (
                <p className="mt-3 text-sm text-emerald-400">
                  Your XI satisfies all team composition rules.
                </p>
              )}

              <button
                type="button"
                disabled={
                  !validation.valid
                }
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

        {/* RIGHT */}

        <div className="min-h-0">
          <PlayingXI
            players={
              selectedPlayers
            }
            pitch={
              pitch
            }
            onRemovePlayer={
              handleRemovePlayer
            }
          />
        </div>
      </section>
    </main>
  );
}