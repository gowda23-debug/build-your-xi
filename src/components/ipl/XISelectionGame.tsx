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
  const [gameChallenge, setGameChallenge] =
    useState<IPLChallenge | null>(null);

  const [currentChallenge, setCurrentChallenge] =
    useState<IPLChallenge | null>(null);

  const [currentPlayers, setCurrentPlayers] =
    useState<IPLPlayer[]>([]);

  const [selectedPlayers, setSelectedPlayers] =
    useState<IPLPlayer[]>([]);

  const [pitch, setPitch] =
    useState<PitchProfile | null>(null);

  const [gameState, setGameState] =
    useState<IPLGameState>("challenge");

  const [searchQuery, setSearchQuery] =
    useState("");

  const [roleFilter, setRoleFilter] =
    useState<"ALL" | PlayerRole>("ALL");

  const [randomizerKey, setRandomizerKey] =
    useState(0);

  const [respinLoading, setRespinLoading] =
    useState<"team" | "season" | null>(null);

  function handleChallengeReady(
    challenge: IPLChallenge,
    players: IPLPlayer[],
  ) {
    setCurrentChallenge(challenge);
    setCurrentPlayers(players);

    if (!gameChallenge) {
      setGameChallenge(challenge);
      setPitch(getRandomPitch());
    }

    setSearchQuery("");
    setRoleFilter("ALL");
    setGameState("selection");
  }

  async function handleRespinTeam() {
    if (!gameChallenge || respinLoading) {
      return;
    }

    setRespinLoading("team");

    try {
      const response = await fetch(
        `/api/ipl/random/team?seasonId=${encodeURIComponent(
          gameChallenge.season.id,
        )}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error("Unable to respin the team.");
      }

      const data = await response.json();

      if (
        !data?.team?.id ||
        !data?.teamSeasonId
      ) {
        throw new Error("Invalid team data received.");
      }

      const nextChallenge: IPLChallenge = {
        teamSeasonId: data.teamSeasonId,
        team: data.team,
        season: gameChallenge.season,
      };

      const players = await fetchPlayers(
        data.teamSeasonId,
      );

      setCurrentChallenge(nextChallenge);
      setCurrentPlayers(players);
      setSearchQuery("");
      setRoleFilter("ALL");
      setGameState("selection");
    } catch (error) {
      console.error(
        "IPL team respin failed:",
        error,
      );
    } finally {
      setRespinLoading(null);
    }
  }

  async function handleRespinSeason() {
    if (!gameChallenge || respinLoading) {
      return;
    }

    setRespinLoading("season");

    try {
      const response = await fetch(
        `/api/ipl/random/season?teamId=${encodeURIComponent(
          gameChallenge.team.id,
        )}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error("Unable to respin the season.");
      }

      const data = await response.json();

      if (
        !data?.season?.id ||
        !data.season.teamSeasonId
      ) {
        throw new Error(
          "Invalid season data received.",
        );
      }

      const nextChallenge: IPLChallenge = {
        teamSeasonId: data.season.teamSeasonId,
        team: gameChallenge.team,
        season: {
          id: data.season.id,
          season: data.season.season,
          startYear: data.season.startYear,
        },
      };

      const players = await fetchPlayers(
        data.season.teamSeasonId,
      );

      setCurrentChallenge(nextChallenge);
      setCurrentPlayers(players);
      setSearchQuery("");
      setRoleFilter("ALL");
      setGameState("selection");
    } catch (error) {
      console.error(
        "IPL season respin failed:",
        error,
      );
    } finally {
      setRespinLoading(null);
    }
  }

  async function fetchPlayers(
    teamSeasonId: string,
  ): Promise<IPLPlayer[]> {
    const response = await fetch(
      `/api/ipl/team-season/${encodeURIComponent(
        teamSeasonId,
      )}/players`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        "Unable to load available players.",
      );
    }

    const data = await response.json();

    if (!Array.isArray(data?.players)) {
      throw new Error(
        "Invalid player data received.",
      );
    }

    return data.players;
  }

  function handleSelectPlayer(
    player: IPLPlayer,
  ) {
    if (
      !canAddPlayer(
        selectedPlayers,
        player,
      )
    ) {
      return;
    }

    const nextPlayers = [
      ...selectedPlayers,
      player,
    ];

    setSelectedPlayers(nextPlayers);

    setCurrentChallenge(null);
    setCurrentPlayers([]);

    setSearchQuery("");
    setRoleFilter("ALL");

    setRandomizerKey(
      (current) => current + 1,
    );

    if (
      nextPlayers.length === MAX_PLAYERS &&
      validateXI(nextPlayers).valid
    ) {
      setGameState("playing");
      return;
    }

    setGameState("challenge");
  }

  function handleRemovePlayer(
    playerId: string,
  ) {
    setSelectedPlayers(
      (current) =>
        current.filter(
          (player) =>
            player.id !== playerId,
        ),
    );

    setCurrentChallenge(null);
    setCurrentPlayers([]);

    setSearchQuery("");
    setRoleFilter("ALL");

    setRandomizerKey(
      (current) => current + 1,
    );

    setGameState("challenge");
  }

  const validation = useMemo(
    () =>
      validateXI(selectedPlayers),
    [selectedPlayers],
  );

  /*
   * The game starts automatically after
   * the 11th valid player.
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
          setGameState("challenge")
        }
      />
    );
  }

  return (
    <main className="flex min-h-0 w-full flex-1">
      <section className="grid min-h-0 w-full gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <section className="flex min-h-0 flex-col">
          {selectedPlayers.length < MAX_PLAYERS && (
            <>
              {!currentChallenge && (
                <ChallengeRandomizer
                  key={randomizerKey}
                  onChallengeReady={
                    handleChallengeReady
                  }
                />
              )}

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
                    canSelectPlayer={
                      (player) =>
                        canAddPlayer(
                          selectedPlayers,
                          player,
                        )
                    }
                  />
                )}
            </>
          )}

          {selectedPlayers.length === MAX_PLAYERS &&
            !validation.valid && (
              <section className="card p-4">
                {validation.errors.map(
                  (error) => (
                    <p
                      key={error}
                      className="text-sm text-red-400"
                    >
                      {error}
                    </p>
                  ),
                )}
              </section>
            )}
        </section>

        <div className="min-h-0">
          <PlayingXI
            players={selectedPlayers}
            pitch={pitch}
            onRemovePlayer={
              handleRemovePlayer
            }
            onRespinTeam={
              handleRespinTeam
            }
            onRespinSeason={
              handleRespinSeason
            }
            respinLoading={
              respinLoading
            }
            hasChallenge={
              Boolean(gameChallenge) &&
              selectedPlayers.length <
                MAX_PLAYERS
            }
          />
        </div>
      </section>
    </main>
  );
}