"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  WorldPlayer,
  WorldTeam,
  WorldSeason,
} from "@/types/world";

import {
  canAddWorldPlayer,
  validateWorldXI,
} from "@/lib/world/validate-xi"

type ChallengeResponse = {
  gameSessionId:
    | string
    | null;

  teamSeasonId:
    string;

  team: WorldTeam;

  season: WorldSeason;
};

type ResultResponse = {
  result: {
    score: number;
    teamStrength: number;
    wins: number;
    losses: number;
    matches: Array<{
      match: number;
      opponentStrength: number;
      winProbability: number;
      result:
        | "W"
        | "L";
    }>;
    breakdown: {
      batting: number;
      bowling: number;
      balance: number;
      experience: number;
    };
  };

  gameScoreId:
    string | null;

  completedAt:
    string | null;
};

const MAX_PLAYERS = 11;

export default function WorldDominationGame() {
  const [
    challenge,
    setChallenge,
  ] =
    useState<ChallengeResponse | null>(
      null
    );

  const [
    players,
    setPlayers,
  ] =
    useState<WorldPlayer[]>(
      []
    );

  const [
    selectedPlayers,
    setSelectedPlayers,
  ] =
    useState<WorldPlayer[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    selecting,
    setSelecting,
  ] =
    useState(false);

  const [
    completing,
    setCompleting,
  ] =
    useState(false);

  const [
    result,
    setResult,
  ] =
    useState<ResultResponse | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    role,
    setRole,
  ] =
    useState<
      "ALL" |
      "WK" |
      "BAT" |
      "AR" |
      "BOWL"
    >("ALL");

  const loadChallenge =
    useCallback(
      async () => {
        setLoading(true);
        setError(null);

        try {
          const response =
            await fetch(
              "/api/world/random/challenge",
              {
                cache:
                  "no-store",
              }
            );

          const data =
            await response
              .json()
              .catch(
                () => null
              );

          if (
            !response.ok
          ) {
            throw new Error(
              data?.error ??
                "Unable to start World Domination."
            );
          }

          setChallenge(
            data
          );

          const playerResponse =
            await fetch(
              `/api/world/team-season/${encodeURIComponent(
                data.teamSeasonId
              )}/players`,
              {
                cache:
                  "no-store",
              }
            );

          const playerData =
            await playerResponse
              .json()
              .catch(
                () => null
              );

          if (
            !playerResponse.ok
          ) {
            throw new Error(
              playerData?.error ??
                "Unable to load World players."
            );
          }

          setPlayers(
            playerData.players ??
              []
          );

          setSelectedPlayers(
            []
          );

          setResult(
            null
          );
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Unable to start World Domination."
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(
    () => {
      void loadChallenge();
    },
    [
      loadChallenge,
    ]
  );

  const validation =
    useMemo(
      () =>
        validateWorldXI(
          selectedPlayers
        ),
      [
        selectedPlayers,
      ]
    );

  const filteredPlayers =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return players.filter(
          (player) => {
            const matchesSearch =
              !query ||
              player.name
                .toLowerCase()
                .includes(
                  query
                );

            const matchesRole =
              role ===
                "ALL" ||
              player.role ===
                role;

            return (
              matchesSearch &&
              matchesRole
            );
          }
        );
      },
      [
        players,
        search,
        role,
      ]
    );

  async function selectPlayer(
    player: WorldPlayer
  ) {
    if (
      selecting ||
      result ||
      selectedPlayers.length >=
        MAX_PLAYERS
    ) {
      return;
    }

    if (
      !canAddWorldPlayer(
        selectedPlayers,
        player
      )
    ) {
      return;
    }

    setSelecting(true);
    setError(null);

    try {
      if (
        challenge?.gameSessionId
      ) {
        const response =
          await fetch(
            "/api/world/game/select-player",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  gameSessionId:
                    challenge.gameSessionId,

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

        if (
          !response.ok
        ) {
          throw new Error(
            data?.error ??
              "Unable to save player selection."
          );
        }
      }

      setSelectedPlayers(
        (current) => [
          ...current,
          player,
        ]
      );
    } catch (
      selectionError
    ) {
      setError(
        selectionError instanceof
          Error
          ? selectionError.message
          : "Unable to select player."
      );
    } finally {
      setSelecting(false);
    }
  }

  async function completeGame() {
    if (
      !challenge?.gameSessionId
    ) {
      setError(
        "Guest World scoring is not yet persisted."
      );
      return;
    }

    if (
      !validation.valid
    ) {
      setError(
        validation.errors.join(
          " "
        )
      );
      return;
    }

    setCompleting(true);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/world/game/complete",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                gameSessionId:
                  challenge.gameSessionId,
              }),
          }
        );

      const data =
        await response
          .json()
          .catch(
            () => null
          );

      if (
        !response.ok
      ) {
        throw new Error(
          data?.error ??
            "Unable to complete World game."
        );
      }

      setResult(
        data
      );
    } catch (
      completionError
    ) {
      setError(
        completionError instanceof
          Error
          ? completionError.message
          : "Unable to complete World game."
      );
    } finally {
      setCompleting(false);
    }
  }

  if (
    loading
  ) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <p className="text-sm font-bold text-[var(--muted)]">
          Loading World Domination…
        </p>
      </div>
    );
  }

  if (
    error &&
    !challenge
  ) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/5 p-6 text-center">
        <div>
          <p className="font-black">
            World Domination unavailable
          </p>

          <p className="mt-2 text-sm text-[var(--muted)]">
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadChallenge()
            }
            className="mt-4 rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-black"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (
    result
  ) {
    return (
      <div className="flex h-full w-full flex-col overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--muted)]">
            World Domination
          </p>

          <h1 className="text-3xl font-black">
            {result.result.score}
            <span className="ml-2 text-sm text-[var(--muted)]">
              / 100
            </span>
          </h1>

          <p className="text-sm font-bold">
            Record:{" "}
            {result.result.wins}-
            {result.result.losses}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(
            result.result.breakdown
          ).map(
            ([
              label,
              value,
            ]) => (
              <div
                key={
                  label
                }
                className="rounded-xl border border-[var(--line)] p-4"
              >
                <p className="text-[10px] font-black uppercase text-[var(--muted)]">
                  {label}
                </p>

                <p className="mt-1 text-xl font-black">
                  {value}
                </p>
              </div>
            )
          )}
        </div>

        <div className="mt-6">
          <p className="mb-3 text-sm font-black">
            Match Record
          </p>

          <div className="space-y-2">
            {result.result.matches.map(
              (match) => (
                <div
                  key={
                    match.match
                  }
                  className="flex items-center justify-between rounded-xl border border-[var(--line)] px-4 py-3"
                >
                  <span>
                    Match{" "}
                    {
                      match.match
                    }
                  </span>

                  <span className="font-black">
                    {match.result}
                  </span>
                </div>
              )
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            void loadChallenge()
          }
          className="mt-6 rounded-xl border border-[var(--line)] px-4 py-3 font-black"
        >
          Build Another XI
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="shrink-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[9px] font-black uppercase text-[var(--muted)]">
              Team
            </p>

            <p className="truncate text-sm font-black">
              {
                challenge?.team
                  .name
              }
            </p>
          </div>

          <div>
            <p className="text-[9px] font-black uppercase text-[var(--muted)]">
              World Cup
            </p>

            <p className="text-sm font-black">
              {
                challenge?.season
                  .year
              }
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          <div className="shrink-0 border-b border-[var(--line)] p-3">
            <div className="flex gap-2">
              <input
                value={
                  search
                }
                onChange={(
                  event
                ) =>
                  setSearch(
                    event.target
                      .value
                  )
                }
                placeholder="Search player"
                className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm outline-none"
              />

              <select
                value={
                  role
                }
                onChange={(
                  event
                ) =>
                  setRole(
                    event.target
                      .value as typeof role
                  )
                }
                className="rounded-lg border border-[var(--line)] bg-transparent px-2 text-sm"
              >
                <option value="ALL">
                  All
                </option>

                <option value="WK">
                  WK
                </option>

                <option value="BAT">
                  BAT
                </option>

                <option value="AR">
                  AR
                </option>

                <option value="BOWL">
                  BOWL
                </option>
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredPlayers.map(
                (player) => {
                  const alreadySelected =
                    selectedPlayers.some(
                      (selected) =>
                        selected.id ===
                        player.id
                    );

                  const allowed =
                    canAddWorldPlayer(
                      selectedPlayers,
                      player
                    );

                  return (
                    <button
                      key={
                        player.id
                      }
                      type="button"
                      disabled={
                        selecting ||
                        alreadySelected ||
                        !allowed
                      }
                      onClick={() =>
                        void selectPlayer(
                          player
                        )
                      }
                      className="rounded-xl border border-[var(--line)] p-3 text-left transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-black">
                          {
                            player.name
                          }
                        </span>

                        <span className="shrink-0 text-[10px] font-black text-[var(--muted)]">
                          {
                            player.role
                          }
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-[var(--muted)]">
                        <span>
                          R{" "}
                          {
                            player
                              .stats
                              .runs
                          }
                        </span>

                        <span>
                          W{" "}
                          {
                            player
                              .stats
                              .wickets
                          }
                        </span>

                        <span>
                          M{" "}
                          {
                            player
                              .stats
                              .matches
                          }
                        </span>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="flex items-center justify-between">
            <p className="font-black">
              Playing XI
            </p>

            <p className="text-sm font-black text-[var(--muted)]">
              {
                selectedPlayers.length
              }
              /11
            </p>
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-2">
              {selectedPlayers.map(
                (
                  player,
                  index
                ) => (
                  <div
                    key={
                      player.id
                    }
                    className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2"
                  >
                    <span className="truncate text-sm font-bold">
                      {index +
                        1}
                      .{" "}
                      {
                        player.name
                      }
                    </span>

                    <span className="ml-2 text-[10px] font-black text-[var(--muted)]">
                      {
                        player.role
                      }
                    </span>
                  </div>
                )
              )}
            </div>
          </div>

          {selectedPlayers.length ===
            MAX_PLAYERS && (
            <div className="mt-3 shrink-0">
              {!validation.valid && (
                <div className="mb-3 rounded-lg border border-red-400/20 bg-red-400/5 p-3">
                  {validation.errors.map(
                    (
                      message
                    ) => (
                      <p
                        key={
                          message
                        }
                        className="text-xs text-red-400"
                      >
                        {
                          message
                        }
                      </p>
                    )
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={
                  completing ||
                  !validation.valid
                }
                onClick={() =>
                  void completeGame()
                }
                className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {completing
                  ? "Calculating…"
                  : "Get Score"}
              </button>
            </div>
          )}
        </aside>
      </div>

      {error && (
        <div className="mt-3 shrink-0 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}