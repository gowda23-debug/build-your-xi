"use client";

import { useState } from "react";

import {
  CalendarDays,
  Dice5,
  RefreshCw,
  RotateCcw,
  Trophy,
  Users,
} from "lucide-react";

import type {
  IPLChallenge,
  IPLPlayer,
  PlayerPoolResponse,
  RandomSeasonResponse,
  RandomTeamResponse,
} from "@/types/ipl";

type ChallengeRandomizerProps = {
  onChallengeReady: (
    challenge: IPLChallenge,
    players: IPLPlayer[]
  ) => void;
};

type LoadingAction =
  | "challenge"
  | "team"
  | "season"
  | null;

type RollingField =
  | "team"
  | "season";

const ROLLING_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ ";

export default function ChallengeRandomizer({
  onChallengeReady,
}: ChallengeRandomizerProps) {
  const [challenge, setChallenge] =
    useState<IPLChallenge | null>(
      null
    );

  const [loadingAction, setLoadingAction] =
    useState<LoadingAction>(
      null
    );

  const [displayTeam, setDisplayTeam] =
    useState("?");

  const [displaySeason, setDisplaySeason] =
    useState("?");

  const [rollingField, setRollingField] =
    useState<RollingField | null>(
      null
    );

  const [error, setError] =
    useState("");

  async function loadPlayers(
    teamSeasonId: string
  ): Promise<IPLPlayer[]> {
    const response =
      await fetch(
        `/api/ipl/team-season/${teamSeasonId}/players`
      );

    const data =
      (await response.json()) as
        | PlayerPoolResponse
        | { error: string };

    if (!response.ok) {
      throw new Error(
        "error" in data
          ? data.error
          : "Unable to load players."
      );
    }

    if (!("players" in data)) {
      throw new Error(
        "Invalid player pool response."
      );
    }

    return data.players;
  }

  function createRollingText(
    target: string,
    progress: number
  ) {
    const revealCount =
      Math.floor(
        target.length *
          Math.min(
            progress * 1.35,
            1
          )
      );

    return target
      .split("")
      .map((character, index) => {
        if (character === " ") {
          return " ";
        }

        if (index < revealCount) {
          return character;
        }

        const randomIndex =
          Math.floor(
            Math.random() *
              ROLLING_CHARACTERS.length
          );

        return ROLLING_CHARACTERS[
          randomIndex
        ];
      })
      .join("");
  }

  function animateValue(
    field: RollingField,
    target: string
  ): Promise<void> {
    return new Promise((resolve) => {
      const duration = 700;
      const intervalTime = 50;

      const totalFrames =
        Math.ceil(
          duration / intervalTime
        );

      let currentFrame = 0;

      setRollingField(field);

      const interval =
        window.setInterval(() => {
          currentFrame += 1;

          const progress =
            currentFrame /
            totalFrames;

          const rollingText =
            createRollingText(
              target,
              progress
            );

          if (field === "team") {
            setDisplayTeam(
              rollingText
            );
          } else {
            setDisplaySeason(
              rollingText
            );
          }

          if (
            currentFrame >=
            totalFrames
          ) {
            window.clearInterval(
              interval
            );

            if (field === "team") {
              setDisplayTeam(
                target
              );
            } else {
              setDisplaySeason(
                target
              );
            }

            setRollingField(
              null
            );

            resolve();
          }
        }, intervalTime);
    });
  }

  async function publishChallenge(
    nextChallenge: IPLChallenge,
    options?: {
      animateTeam?: boolean;
      animateSeason?: boolean;
    }
  ) {
    const players =
      await loadPlayers(
        nextChallenge.teamSeasonId
      );

    const animateTeam =
      options?.animateTeam ?? true;

    const animateSeason =
      options?.animateSeason ?? true;

    const animations: Promise<void>[] =
      [];

    if (animateTeam) {
      animations.push(
        animateValue(
          "team",
          nextChallenge.team.name
        )
      );
    } else {
      setDisplayTeam(
        nextChallenge.team.name
      );
    }

    if (animateSeason) {
      animations.push(
        animateValue(
          "season",
          nextChallenge.season.season
        )
      );
    } else {
      setDisplaySeason(
        nextChallenge.season.season
      );
    }

    await Promise.all(
      animations
    );

    setChallenge(
      nextChallenge
    );

    onChallengeReady(
      nextChallenge,
      players
    );
  }

  async function handleSpinChallenge() {
    try {
      setLoadingAction(
        "challenge"
      );

      setError("");

      const response =
        await fetch(
          "/api/ipl/random/challenge"
        );

      const data =
        (await response.json()) as
          | IPLChallenge
          | { error: string };

      if (!response.ok) {
        throw new Error(
          "error" in data
            ? data.error
            : "Unable to generate challenge."
        );
      }

      if (
        !("teamSeasonId" in data)
      ) {
        throw new Error(
          "Invalid challenge response."
        );
      }

      await publishChallenge(
        data,
        {
          animateTeam: true,
          animateSeason: true,
        }
      );
    } catch (error) {
      console.error(
        "Challenge spin error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to generate challenge."
      );
    } finally {
      setLoadingAction(
        null
      );
    }
  }

  async function handleRespinTeam() {
    if (!challenge) {
      return;
    }

    try {
      setLoadingAction(
        "team"
      );

      setError("");

      const response =
        await fetch(
          `/api/ipl/random/team?seasonId=${challenge.season.id}`
        );

      const data =
        (await response.json()) as
          | RandomTeamResponse
          | { error: string };

      if (!response.ok) {
        throw new Error(
          "error" in data
            ? data.error
            : "Unable to respin team."
        );
      }

      if (
        !("team" in data) ||
        !data.teamSeasonId
      ) {
        throw new Error(
          "Invalid team respin response."
        );
      }

      const nextChallenge: IPLChallenge =
        {
          teamSeasonId:
            data.teamSeasonId,

          team:
            data.team,

          season:
            challenge.season,
        };

      await publishChallenge(
        nextChallenge,
        {
          animateTeam: true,
          animateSeason: false,
        }
      );
    } catch (error) {
      console.error(
        "Team respin error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to respin team."
      );
    } finally {
      setLoadingAction(
        null
      );
    }
  }

  async function handleRespinSeason() {
    if (!challenge) {
      return;
    }

    try {
      setLoadingAction(
        "season"
      );

      setError("");

      const response =
        await fetch(
          `/api/ipl/random/season?teamId=${challenge.team.id}`
        );

      const data =
        (await response.json()) as
          | RandomSeasonResponse
          | { error: string };

      if (!response.ok) {
        throw new Error(
          "error" in data
            ? data.error
            : "Unable to respin season."
        );
      }

      if (
        !("season" in data)
      ) {
        throw new Error(
          "Invalid season respin response."
        );
      }

      const nextSeason =
        data.season;

      const nextChallenge: IPLChallenge =
        {
          teamSeasonId:
            nextSeason.teamSeasonId,

          team:
            challenge.team,

          season: {
            id:
              nextSeason.id,

            season:
              nextSeason.season,

            startYear:
              nextSeason.startYear,
          },
        };

      await publishChallenge(
        nextChallenge,
        {
          animateTeam: false,
          animateSeason: true,
        }
      );
    } catch (error) {
      console.error(
        "Season respin error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to respin season."
      );
    } finally {
      setLoadingAction(
        null
      );
    }
  }

  const isLoading =
    loadingAction !== null;

  const isTeamRolling =
    rollingField === "team";

  const isSeasonRolling =
    rollingField === "season";

  return (
    <section className="w-full">
      {/* =========================
          COMPACT HEADER
      ========================= */}

      <div className="mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Trophy size={20} />
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              Build Your XI
            </p>

            <h1 className="mt-0.5 text-2xl font-black tracking-tight">
              IPL Challenge
            </h1>
          </div>
        </div>

        <p className="mt-3 text-sm text-[var(--muted)]">
          Spin a team and season to
          generate your player pool.
        </p>
      </div>

      {/* =========================
          RANDOMIZER
      ========================= */}

      <section className="card overflow-hidden">
        {/* HEADER */}

        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              Challenge Randomizer
            </p>

            <p className="mt-1 text-xs text-[var(--muted)]">
              Team and season determine
              your available players.
            </p>
          </div>

          <Dice5
            size={20}
            className="text-[var(--accent)]"
          />
        </div>

        {/* TEAM */}

        <div className="border-b border-[var(--line)] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
              <Users size={16} />
            </div>

            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              IPL Team
            </p>
          </div>

          <div className="mt-4 min-h-[42px] overflow-hidden">
            <p
              className={[
                "text-2xl font-black leading-tight transition-all duration-150",
                isTeamRolling
                  ? "text-[var(--accent)]"
                  : "",
              ].join(" ")}
            >
              {displayTeam}
            </p>
          </div>

          {challenge && (
            <button
              type="button"
              onClick={
                handleRespinTeam
              }
              disabled={isLoading}
              className="btn btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2 text-sm"
            >
              {loadingAction ===
              "team" ? (
                <>
                  <RefreshCw
                    size={15}
                    className="animate-spin"
                  />

                  Rolling...
                </>
              ) : (
                <>
                  <RotateCcw
                    size={15}
                  />

                  Respin Team
                </>
              )}
            </button>
          )}
        </div>

        {/* SEASON */}

        <div className="px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
              <CalendarDays
                size={16}
              />
            </div>

            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              IPL Season
            </p>
          </div>

          <div className="mt-4 min-h-[42px] overflow-hidden">
            <p
              className={[
                "text-2xl font-black leading-tight transition-all duration-150",
                isSeasonRolling
                  ? "text-[var(--accent)]"
                  : "",
              ].join(" ")}
            >
              {displaySeason}
            </p>
          </div>

          {challenge && (
            <button
              type="button"
              onClick={
                handleRespinSeason
              }
              disabled={isLoading}
              className="btn btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2 text-sm"
            >
              {loadingAction ===
              "season" ? (
                <>
                  <RefreshCw
                    size={15}
                    className="animate-spin"
                  />

                  Rolling...
                </>
              ) : (
                <>
                  <RotateCcw
                    size={15}
                  />

                  Respin Season
                </>
              )}
            </button>
          )}
        </div>

        {/* INITIAL SPIN */}

        {!challenge && (
          <div className="border-t border-[var(--line)] px-4 py-4">
            <button
              type="button"
              onClick={
                handleSpinChallenge
              }
              disabled={isLoading}
              className="btn btn-primary inline-flex w-full items-center justify-center gap-2 text-sm"
            >
              {loadingAction ===
              "challenge" ? (
                <>
                  <RefreshCw
                    size={16}
                    className="animate-spin"
                  />

                  Rolling Challenge...
                </>
              ) : (
                <>
                  <Dice5 size={16} />

                  Spin Challenge
                </>
              )}
            </button>
          </div>
        )}
      </section>

      {/* CHALLENGE READY */}

      {challenge &&
        !isLoading && (
          <div className="mt-4 rounded-xl border border-[var(--line)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              Challenge Ready
            </p>

            <p className="mt-1.5 text-sm font-bold">
              {challenge.team.name}

              <span className="mx-1 text-[var(--muted)]">
                —
              </span>

              {
                challenge.season
                  .season
              }
            </p>
          </div>
        )}

      {/* ERROR */}

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </section>
  );
}