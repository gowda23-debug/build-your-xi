"use client";

import { useMemo, useState } from "react";

import ChallengeRandomizer from "./ChallengeRandomizer";
import IPLGame from "./IPLGame";
import PlayerPool from "./PlayerPool";
import PlayingXI from "./PlayingXI";

import { getRandomPitch } from "@/lib/ipl-challenge/pitches";

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
   * ==================================================
   * PERSISTENT GAME CHALLENGE
   * ==================================================
   *
   * The first successful spin establishes the
   * Team + Season for the game.
   *
   * This remains unchanged throughout XI building.
   */
  const [
    gameChallenge,
    setGameChallenge,
  ] = useState<IPLChallenge | null>(null);

  /*
   * ==================================================
   * CURRENT SPIN
   * ==================================================
   *
   * currentChallenge/currentPlayers represent
   * the Team + Season and player pool generated
   * by the current spin.
   *
   * After one player is selected these are cleared,
   * causing the randomizer to appear again.
   */
  const [
    currentChallenge,
    setCurrentChallenge,
  ] = useState<IPLChallenge | null>(null);

  const [
    currentPlayers,
    setCurrentPlayers,
  ] = useState<IPLPlayer[]>([]);

  /*
   * ==================================================
   * SELECTED PLAYING XI
   * ==================================================
   */
  const [
    selectedPlayers,
    setSelectedPlayers,
  ] = useState<IPLPlayer[]>([]);

  /*
   * ==================================================
   * PITCH
   * ==================================================
   *
   * For now the pitch is selected when the first
   * challenge is generated.
   */
  const [
    pitch,
    setPitch,
  ] = useState<PitchProfile | null>(null);

  /*
   * ==================================================
   * GAME STATE
   * ==================================================
   *
   * challenge -> show randomizer
   * selection -> show player pool
   * ready     -> XI confirmation
   * playing   -> actual game
   */
  const [
    gameState,
    setGameState,
  ] = useState<IPLGameState>("challenge");

  /*
   * ==================================================
   * PLAYER SEARCH / FILTER
   * ==================================================
   */
  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    roleFilter,
    setRoleFilter,
  ] = useState<
    "ALL" | PlayerRole
  >("ALL");

  /*
   * ==================================================
   * RANDOMIZER RESET KEY
   * ==================================================
   *
   * Changing this key forces the randomizer to
   * start fresh after a player is selected.
   */
  const [
    randomizerKey,
    setRandomizerKey,
  ] = useState(0);

  /*
   * ==================================================
   * CHALLENGE READY
   * ==================================================
   *
   * Called by ChallengeRandomizer after a successful
   * Team + Season spin and player pool load.
   */
  function handleChallengeReady(
    challenge: IPLChallenge,
    players: IPLPlayer[]
  ) {
    /*
     * Save the current spin.
     */
    setCurrentChallenge(challenge);
    setCurrentPlayers(players);

    /*
     * The first spin establishes the persistent
     * game challenge and pitch.
     */
    if (!gameChallenge) {
      setGameChallenge(challenge);
      setPitch(getRandomPitch());
    }

    /*
     * Reset player search/filter.
     */
    setSearchQuery("");
    setRoleFilter("ALL");

    /*
     * Show the player pool.
     */
    setGameState("selection");
  }

  /*
   * ==================================================
   * PLAYER SELECTED
   * ==================================================
   *
   * One player is selected from each spin.
   *
   * There is deliberately NO field-position selection.
   */
  function handleSelectPlayer(
    player: IPLPlayer
  ) {
    /*
     * Ask the XI rules whether this player can
     * currently be added.
     */
    const canSelect = canAddPlayer(
      selectedPlayers,
      player
    );

    if (!canSelect) {
      return;
    }

    /*
     * Add player to the persistent XI.
     */
    setSelectedPlayers((current) => [
      ...current,
      player,
    ]);

    /*
     * Clear the current spin.
     *
     * This causes the next render to show
     * the Team + Season randomizer again.
     */
    setCurrentChallenge(null);
    setCurrentPlayers([]);

    /*
     * Reset search/filter.
     */
    setSearchQuery("");
    setRoleFilter("ALL");

    /*
     * Reset the randomizer animation/component.
     */
    setRandomizerKey(
      (current) => current + 1
    );

    /*
     * Return to the challenge state.
     *
     * If this was player #11, the validation
     * section will automatically appear because
     * selectedPlayers.length has now reached 11.
     */
    setGameState("challenge");
  }

  /*
   * ==================================================
   * REMOVE PLAYER
   * ==================================================
   *
   * Used from the Playing XI panel.
   */
  function handleRemovePlayer(
    playerId: string
  ) {
    setSelectedPlayers(
      (current) =>
        current.filter(
          (player) =>
            player.id !== playerId
        )
    );

    /*
     * Return to the next spin.
     */
    setCurrentChallenge(null);
    setCurrentPlayers([]);

    setSearchQuery("");
    setRoleFilter("ALL");

    setRandomizerKey(
      (current) => current + 1
    );

    setGameState("challenge");
  }

  /*
   * ==================================================
   * XI VALIDATION
   * ==================================================
   */
  const validation = useMemo(
    () =>
      validateXI(
        selectedPlayers
      ),
    [selectedPlayers]
  );

  /*
   * ==================================================
   * CONTINUE TO READY SCREEN
   * ==================================================
   */
  function handleContinue() {
    if (!validation.valid) {
      return;
    }

    setGameState("ready");
  }

  /*
   * ==================================================
   * START GAME
   * ==================================================
   */
  function handleStartGame() {
    if (
      !validation.valid ||
      !gameChallenge
    ) {
      return;
    }

    setGameState("playing");
  }

  /*
   * ==================================================
   * PLAYING GAME
   * ==================================================
   */
  if (
    gameState === "playing" &&
    gameChallenge
  ) {
    return (
      <IPLGame
        challenge={gameChallenge}
        selectedPlayers={selectedPlayers}
        onBackToSelection={() =>
          setGameState("ready")
        }
      />
    );
  }

  /*
   * ==================================================
   * READY SCREEN
   * ==================================================
   */
  if (gameState === "ready") {
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
            {validation.counts.BAT} BAT ·{" "}
            {validation.counts.WK} WK ·{" "}
            {validation.counts.AR} AR ·{" "}
            {validation.counts.BOWL} BOWL
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {selectedPlayers.map(
              (player, index) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-xs font-black text-[var(--accent)]">
                    {index + 1}
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {player.name}
                    </p>

                    <p className="text-xs text-[var(--muted)]">
                      {player.role}
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
                setGameState("challenge")
              }
              className="btn btn-secondary"
            >
              Edit XI
            </button>

            <button
              type="button"
              onClick={handleStartGame}
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
   * ==================================================
   * MAIN XI BUILDING FLOW
   * ==================================================
   */
  return (
    <main className="flex min-h-0 w-full flex-1">
      <section className="grid min-h-0 w-full gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">

        {/* ============================================
            LEFT SIDE
        ============================================= */}
        <section className="flex min-h-0 flex-col">

          {/*
           * Keep showing the randomizer while we
           * still need players.
           */}
          {selectedPlayers.length <
            MAX_PLAYERS && (
            <>
              {/*
               * No current spin:
               * show Team + Season randomizer.
               */}
              {!currentChallenge && (
                <ChallengeRandomizer
                  key={randomizerKey}
                  onChallengeReady={
                    handleChallengeReady
                  }
                />
              )}

              {/*
               * Current spin exists:
               * show the player pool.
               */}
              {currentChallenge &&
                gameState === "selection" && (
                  <PlayerPool
                    players={currentPlayers}
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

          {/* =========================================
              XI COMPLETE
          ========================================== */}
          {selectedPlayers.length ===
            MAX_PLAYERS && (
            <section className="card p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                XI Complete
              </p>

              <h2 className="mt-2 text-xl font-black">
                Validate your team
              </h2>

              <div className="mt-3 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                <span>
                  {validation.counts.BAT} BAT
                </span>

                <span>·</span>

                <span>
                  {validation.counts.WK} WK
                </span>

                <span>·</span>

                <span>
                  {validation.counts.AR} AR
                </span>

                <span>·</span>

                <span>
                  {validation.counts.BOWL} BOWL
                </span>
              </div>

              {!validation.valid && (
                <div className="mt-4 space-y-2">
                  {validation.errors.map(
                    (error) => (
                      <p
                        key={error}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                      >
                        {error}
                      </p>
                    )
                  )}
                </div>
              )}

              {validation.valid && (
                <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
                  Your XI satisfies all team
                  composition rules.
                </p>
              )}

              <button
                type="button"
                disabled={!validation.valid}
                onClick={handleContinue}
                className="btn btn-primary mt-5"
              >
                Continue
              </button>
            </section>
          )}
        </section>

        {/* ============================================
            RIGHT SIDE — PLAYING XI
        ============================================= */}
        <div className="min-h-0">
          <PlayingXI
            players={selectedPlayers}
            pitch={pitch}
            onRemovePlayer={
              handleRemovePlayer
            }
          />
        </div>
      </section>
    </main>
  );
}