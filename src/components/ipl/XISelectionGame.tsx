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
  canAddPlayer,
  validateXI,
} from "@/lib/ipl-challenge/validate-xi";

import type {
  IPLChallenge,
  IPLGameState,
  IPLPlayer,
  PlayerRole,
} from "@/types/ipl";

const MAX_PLAYERS = 11;

type RespinType =
  | "team"
  | "season";

type DraftSelection = {
  playerId: string;
  teamSeasonId: string;
};

type XISelectionGameProps = {
  challengeId?: string | null;
};

export default function XISelectionGame({
  challengeId = null,
}: XISelectionGameProps) {
  const [gameChallenge, setGameChallenge] =
    useState<IPLChallenge | null>(
      null
    );

  const [lockedVenue, setLockedVenue] =
    useState<
      IPLChallenge["venue"] | null
    >(null);

  /*
   * This is the team-season from the ORIGINAL
   * random challenge that produced lockedVenue.
   *
   * It must not change when team/season is respun.
   */
  const [
    lockedVenueTeamSeasonId,
    setLockedVenueTeamSeasonId,
  ] = useState<string | null>(
    null
  );

  const [currentChallenge, setCurrentChallenge] =
    useState<IPLChallenge | null>(
      null
    );

  const [currentPlayers, setCurrentPlayers] =
    useState<IPLPlayer[]>([]);

  const [selectedPlayers, setSelectedPlayers] =
    useState<IPLPlayer[]>([]);

  /*
   * Guest games keep their authoritative identifiers
   * locally instead of writing them to game_sessions.
   */
  const [draftSelections, setDraftSelections] =
    useState<DraftSelection[]>([]);

  const [gameState, setGameState] =
    useState<IPLGameState>(
      "challenge"
    );

  const [searchQuery, setSearchQuery] =
    useState("");

  const [roleFilter, setRoleFilter] =
    useState<
      "ALL" | PlayerRole
    >("ALL");

  const [randomizerKey, setRandomizerKey] =
    useState(0);

  const [respinLoading, setRespinLoading] =
    useState<
      RespinType | null
    >(null);

  const [teamRespinUsed, setTeamRespinUsed] =
    useState(false);

  const [seasonRespinUsed, setSeasonRespinUsed] =
    useState(false);

  function resetPlayerPool(
    challenge: IPLChallenge,
    players: IPLPlayer[]
  ) {
    setCurrentChallenge(
      challenge
    );

    setCurrentPlayers(
      players
    );

    setSearchQuery("");
    setRoleFilter("ALL");
    setGameState("selection");
  }

  function handleChallengeReady(
    challenge: IPLChallenge,
    players: IPLPlayer[]
  ) {
    const startingNewXI =
      selectedPlayers.length ===
      0;

    setGameChallenge(
      challenge
    );

    if (startingNewXI) {
      setTeamRespinUsed(false);
      setSeasonRespinUsed(false);

      /*
       * Lock the ORIGINAL venue and the
       * team-season that produced it.
       */
      setLockedVenue(
        challenge.venue
      );

      setLockedVenueTeamSeasonId(
        challenge.teamSeasonId
      );
    }

    resetPlayerPool(
      challenge,
      players
    );
  }

  async function handleSelectPlayer(
    player: IPLPlayer
  ) {
    if (
      selectedPlayers.length >=
      MAX_PLAYERS
    ) {
      return;
    }

    if (
      !canAddPlayer(
        selectedPlayers,
        player
      )
    ) {
      return;
    }

    try {
      /*
       * REGISTERED PLAYER
       *
       * Persist selection to the authoritative
       * game session.
       */
      if (
        gameChallenge?.gameSessionId
      ) {
        const response =
          await fetch(
            "/api/ipl/game/select-player",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              cache: "no-store",

              body:
                JSON.stringify({
                  gameSessionId:
                    gameChallenge.gameSessionId,

                  playerId:
                    player.id,
                }),
            }
          );

        const data =
          await response
            .json()
            .catch(
              () => null
            );

        if (!response.ok) {
          throw new Error(
            data?.error ??
              "Unable to save the selected player."
          );
        }
      }

      /*
       * Add player locally for BOTH registered
       * and guest gameplay.
       */
      const nextPlayers = [
        ...selectedPlayers,
        player,
      ];

      setSelectedPlayers(
        nextPlayers
      );

      /*
       * Store the exact team-season from which
       * this player was selected.
       */
      if (
        gameChallenge?.teamSeasonId
      ) {
        setDraftSelections(
          (current) => [
            ...current,
            {
              playerId:
                player.id,

              teamSeasonId:
                gameChallenge.teamSeasonId,
            },
          ]
        );
      }

      /*
       * Close the current player pool.
       */
      setCurrentChallenge(
        null
      );

      setCurrentPlayers(
        []
      );

      setSearchQuery("");
      setRoleFilter("ALL");

      setRandomizerKey(
        (current) =>
          current + 1
      );

      /*
       * Once 11 valid players are selected,
       * move directly to the result calculation.
       */
      if (
        nextPlayers.length ===
          MAX_PLAYERS &&
        validateXI(
          nextPlayers
        ).valid
      ) {
        setGameState(
          "playing"
        );

        return;
      }

      setGameState(
        "challenge"
      );
    } catch (error) {
      console.error(
        "IPL player selection failed:",
        error
      );
    }
  }

  async function fetchPlayers(
    teamSeasonId: string
  ): Promise<IPLPlayer[]> {
    const response =
      await fetch(
        `/api/ipl/team-season/${encodeURIComponent(
          teamSeasonId
        )}/players`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

    const data =
      await response
        .json()
        .catch(
          () => null
        );

    if (!response.ok) {
      throw new Error(
        data?.error ??
          "Unable to load available players."
      );
    }

    if (
      !Array.isArray(
        data?.players
      )
    ) {
      throw new Error(
        "Invalid player data received."
      );
    }

    return data.players;
  }

  async function respin(
    type: RespinType
  ) {
    if (
      !gameChallenge ||
      respinLoading
    ) {
      return;
    }

    if (
      type === "team" &&
      teamRespinUsed
    ) {
      return;
    }

    if (
      type === "season" &&
      seasonRespinUsed
    ) {
      return;
    }

    setRespinLoading(
      type
    );

    try {
      const endpoint =
        type === "team"
          ? "/api/ipl/random/team"
          : "/api/ipl/random/season";

      const response =
        await fetch(
          endpoint,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            cache: "no-store",

            body:
              JSON.stringify(
                type === "team"
                  ? {
                      gameSessionId:
                        gameChallenge.gameSessionId,

                      seasonId:
                        gameChallenge
                          .season
                          .id,
                    }
                  : {
                      gameSessionId:
                        gameChallenge.gameSessionId,

                      teamId:
                        gameChallenge
                          .team
                          .id,
                    }
              ),
          }
        );

      const data =
        await response
          .json()
          .catch(
            () => null
          );

      if (!response.ok) {
        throw new Error(
          data?.error ??
            `Unable to respin the ${type}.`
        );
      }

      let nextChallenge:
        IPLChallenge;

      /*
       * Team respin.
       *
       * IMPORTANT:
       * venue remains the ORIGINAL locked venue.
       */
      if (
        type === "team"
      ) {
        if (
          !data?.team?.id ||
          !data?.teamSeasonId
        ) {
          throw new Error(
            "Invalid team data received."
          );
        }

        nextChallenge = {
          teamSeasonId:
            data.teamSeasonId,

          team:
            data.team,

          season:
            gameChallenge.season,

          venue:
            gameChallenge.venue,

          gameSessionId:
            gameChallenge.gameSessionId,
        };
      } else {
        /*
         * Season respin.
         *
         * IMPORTANT:
         * venue remains the ORIGINAL locked venue.
         */
        if (
          !data?.season?.id ||
          !data?.season
            ?.teamSeasonId
        ) {
          throw new Error(
            "Invalid season data received."
          );
        }

        nextChallenge = {
          teamSeasonId:
            data.season
              .teamSeasonId,

          team:
            gameChallenge.team,

          season: {
            id:
              data.season.id,

            season:
              data.season
                .season,

            startYear:
              data.season
                .startYear,
          },

          venue:
            gameChallenge.venue,

          gameSessionId:
            gameChallenge.gameSessionId,
        };
      }

      const players =
        await fetchPlayers(
          nextChallenge.teamSeasonId
        );

      if (
        players.length ===
        0
      ) {
        throw new Error(
          "No eligible players are available for this team and season."
        );
      }

      setGameChallenge(
        nextChallenge
      );

      if (
        type === "team"
      ) {
        setTeamRespinUsed(
          true
        );
      }

      if (
        type === "season"
      ) {
        setSeasonRespinUsed(
          true
        );
      }

      resetPlayerPool(
        nextChallenge,
        players
      );
    } catch (error) {
      console.error(
        `IPL ${type} respin failed:`,
        error
      );
    } finally {
      setRespinLoading(
        null
      );
    }
  }

  const validation =
    useMemo(
      () =>
        validateXI(
          selectedPlayers
        ),
      [selectedPlayers]
    );

  function handleBuildAnother() {
    setGameChallenge(
      null
    );

    setCurrentChallenge(
      null
    );

    setCurrentPlayers(
      []
    );

    setSelectedPlayers(
      []
    );

    setDraftSelections(
      []
    );

    setLockedVenue(
      null
    );

    setLockedVenueTeamSeasonId(
      null
    );

    setGameState(
      "challenge"
    );

    setSearchQuery("");
    setRoleFilter("ALL");

    setRandomizerKey(
      (current) =>
        current + 1
    );

    setRespinLoading(
      null
    );

    setTeamRespinUsed(
      false
    );

    setSeasonRespinUsed(
      false
    );
  }

  /*
   * ============================================================
   * GAME RESULT
   * ============================================================
   */

  if (
    gameState ===
    "playing"
  ) {
    if (!gameChallenge) {
      return null;
    }

    return (
      <IPLGame
        challenge={
          gameChallenge
        }

        selectedPlayers={
          selectedPlayers
        }

        draftSelections={
          draftSelections
        }

        venueOriginTeamSeasonId={
          lockedVenueTeamSeasonId
        }

        pitch={
          gameChallenge
            .venue
            .pitch
        }

        onBuildAnother={
          handleBuildAnother
        }
      />
    );
  }

  const building =
    selectedPlayers.length <
    MAX_PLAYERS;

  const hasChallenge =
    Boolean(
      currentChallenge &&
        gameState ===
          "selection"
    );

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto lg:h-full lg:overflow-hidden">
      <section
        className="
          flex
          min-h-0
          w-full
          flex-1
          flex-col
          gap-3
          overflow-visible

          lg:grid
          lg:h-full
          lg:grid-cols-[minmax(0,1fr)_minmax(390px,0.82fr)]
          lg:overflow-hidden
        "
      >
        <section
          className="
            flex
            min-h-0
            min-w-0
            shrink-0
            flex-col
            overflow-visible

            lg:h-full
            lg:shrink
            lg:overflow-hidden
          "
        >
          {currentChallenge &&
          building ? (
            <div
              className="
                flex
                min-h-0
                flex-col
                gap-3
                overflow-visible

                lg:h-full
                lg:overflow-hidden
              "
            >
              <div className="shrink-0">
                <ChallengeBar
                  challenge={
                    currentChallenge
                  }
                  teamRespinUsed={
                    teamRespinUsed
                  }
                  seasonRespinUsed={
                    seasonRespinUsed
                  }
                  respinLoading={
                    respinLoading
                  }
                  onRespinTeam={() =>
                    respin(
                      "team"
                    )
                  }
                  onRespinSeason={() =>
                    respin(
                      "season"
                    )
                  }
                />
              </div>

              <div
                className="
                  h-[520px]
                  min-h-[520px]
                  shrink-0

                  lg:h-full
                  lg:min-h-0
                  lg:shrink
                "
              >
                {hasChallenge && (
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
              </div>
            </div>
          ) : (
            <div className="h-full min-h-0">
              {building ? (
                <ChallengeRandomizer
                  key={
                    randomizerKey
                  }
                  gameSessionId={
                    gameChallenge?.gameSessionId
                  }
                  challengeId={
                    challengeId
                  }
                  lockedVenue={
                    lockedVenue
                  }
                  onChallengeReady={
                    handleChallengeReady
                  }
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-[var(--line)] bg-black/5 px-6 text-center">
                  <p className="text-sm font-bold text-[var(--muted)]">
                    XI complete
                  </p>
                </div>
              )}
            </div>
          )}

          {selectedPlayers.length ===
            MAX_PLAYERS &&
            !validation.valid && (
              <section className="card mt-3 p-4">
                {validation.errors.map(
                  (
                    error
                  ) => (
                    <p
                      key={error}
                      className="text-sm text-red-400"
                    >
                      {
                        error
                      }
                    </p>
                  )
                )}
              </section>
            )}
        </section>

        <div
          className="
            w-full
            min-w-0
            shrink-0

            lg:h-full
            lg:min-h-0
            lg:shrink
          "
        >
          <PlayingXI
            players={
              selectedPlayers
            }
            pitch={
              gameChallenge?.venue
                ?.pitch ??
              null
            }
            venue={
              gameChallenge?.venue ??
              null
            }
          />
        </div>
      </section>
    </main>
  );
}

function ChallengeBar({
  challenge,
  teamRespinUsed,
  seasonRespinUsed,
  respinLoading,
  onRespinTeam,
  onRespinSeason,
}: {
  challenge: IPLChallenge;

  teamRespinUsed: boolean;

  seasonRespinUsed: boolean;

  respinLoading:
    | RespinType
    | null;

  onRespinTeam: () => void;

  onRespinSeason: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)]/80 px-2.5 py-2 shadow-sm backdrop-blur">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <ChallengeValue
            label="Team"
            value={
              challenge.team.name
            }
          />

          <ChallengeValue
            label="Season"
            value={
              challenge.season.season
            }
          />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 border-t border-[var(--line)] pt-2 sm:border-l sm:border-t-0 sm:pl-2 sm:pt-0">
          <button
            type="button"
            onClick={
              onRespinTeam
            }
            disabled={
              respinLoading !==
                null ||
              teamRespinUsed
            }
            className="h-8 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 text-[10px] font-black uppercase tracking-wide text-amber-300 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {respinLoading ===
            "team"
              ? "Rolling…"
              : teamRespinUsed
              ? "Team used"
              : "↻ Team"}
          </button>

          <button
            type="button"
            onClick={
              onRespinSeason
            }
            disabled={
              respinLoading !==
                null ||
              seasonRespinUsed
            }
            className="h-8 rounded-lg border border-fuchsia-400/30 bg-fuchsia-400/10 px-2.5 text-[10px] font-black uppercase tracking-wide text-fuchsia-300 transition hover:bg-fuchsia-400/15 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {respinLoading ===
            "season"
              ? "Rolling…"
              : seasonRespinUsed
              ? "Season used"
              : "↻ Season"}
          </button>
        </div>
      </div>

      <div className="mt-2 border-t border-[var(--line)] pt-2">
        <ChallengeValue
          label="Venue"
          value={`${challenge.venue.name}${
            challenge.venue.city
              ? ` • ${challenge.venue.city}`
              : ""
          }`}
        />
      </div>
    </div>
  );
}

function ChallengeValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--line)] bg-black/10 px-2.5 py-1.5">
      <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-0.5 truncate text-xs font-black">
        {value}
      </p>
    </div>
  );
}