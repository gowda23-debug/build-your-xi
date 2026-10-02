"use client";

import { useEffect, useState } from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  ArrowLeft,
  Check,
  Copy,
  Globe2,
  Pencil,
  Share2,
  Trophy,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type GameMode =
  | "ipl"
  | "world";

type Challenge = {
  id: string;
  creator_id: string;
  title: string;
  game_mode: GameMode;
  invite_code: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type LeaderboardEntry = {
  user_id: string;
  gamer_tag: string;
  display_name: string;
  score: number;
  created_at: string;
};

function getChallengePath(
  inviteCode: string
) {
  return `/challenges/${encodeURIComponent(
    inviteCode
  )}`;
}

export default function ChallengePage() {
  const params =
    useParams();

  const router =
    useRouter();

  const supabase =
    createClient();

  const inviteCode =
    typeof params.inviteCode ===
    "string"
      ? params.inviteCode
      : "";

  const [challenge, setChallenge] =
    useState<Challenge | null>(
      null
    );

  const [leaderboard, setLeaderboard] =
    useState<LeaderboardEntry[]>(
      []
    );

  const [currentUserId, setCurrentUserId] =
    useState<string | null>(
      null
    );

  const [playerCount, setPlayerCount] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [joining, setJoining] =
    useState(false);

  const [error, setError] =
    useState("");

  const [copied, setCopied] =
    useState(false);

  const [editingTitle, setEditingTitle] =
    useState(false);

  const [title, setTitle] =
    useState("");

  const [savingTitle, setSavingTitle] =
    useState(false);

  const [
    challengeUnavailable,
    setChallengeUnavailable,
  ] = useState(false);

  const [
    guestChallenge,
    setGuestChallenge,
  ] = useState(false);

  /*
   * ============================================================
   * LOAD
   * ============================================================
   */

  useEffect(() => {
    if (inviteCode) {
      loadChallenge();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCode]);

  async function loadChallenge() {
    setLoading(true);
    setError("");
    setGuestChallenge(
      false
    );
    setChallengeUnavailable(
      false
    );

    try {
      /*
       * ============================================================
       * AUTHENTICATION
       * ============================================================
       */

      const {
        data: {
          session,
        },
        error:
          sessionError,
      } =
        await supabase.auth.getSession();

      if (
        sessionError
      ) {
        throw sessionError;
      }

      const user =
        session?.user ??
        null;

      const challengePath =
        getChallengePath(
          inviteCode
        );

      /*
       * LOGGED OUT
       */

      if (!user) {
        router.replace(
          `/login?next=${encodeURIComponent(
            challengePath
          )}`
        );

        return;
      }

      /*
       * GUEST
       *
       * Guests are not allowed to play challenges.
       */
      if (
        user.is_anonymous
      ) {
        setGuestChallenge(
          true
        );

        return;
      }

      /*
       * REGISTERED USER
       */

      setCurrentUserId(
        user.id
      );

      /*
       * ============================================================
       * LOAD CHALLENGE
       * ============================================================
       */

      const challengeResponse =
        await fetch(
          `/api/challenges/${encodeURIComponent(
            inviteCode
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const challengeData =
        await challengeResponse
          .json()
          .catch(
            () => null
          );

      if (
        !challengeResponse.ok
      ) {
        if (
          challengeResponse.status ===
            404 &&
          challengeData?.code ===
            "CHALLENGE_NOT_FOUND"
        ) {
          setChallengeUnavailable(
            true
          );

          return;
        }

        throw new Error(
          challengeData?.error ??
            "Unable to load the challenge."
        );
      }

      const loadedChallenge =
        challengeData?.challenge as
          | Challenge
          | undefined;

      if (
        !loadedChallenge
      ) {
        throw new Error(
          "Unable to load the challenge."
        );
      }

      setChallenge(
        loadedChallenge
      );

      setTitle(
        loadedChallenge.title
      );

      if (
        typeof challengeData?.playerCount ===
        "number"
      ) {
        setPlayerCount(
          challengeData.playerCount
        );
      }

      /*
       * ============================================================
       * LOAD LEADERBOARD
       * ============================================================
       */

      const leaderboardResponse =
        await fetch(
          `/api/challenges/${encodeURIComponent(
            loadedChallenge.invite_code
          )}/leaderboard`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const leaderboardData =
        await leaderboardResponse
          .json()
          .catch(
            () => null
          );

      if (
        !leaderboardResponse.ok
      ) {
        throw new Error(
          leaderboardData?.error ??
            "Unable to load the challenge leaderboard."
        );
      }

      setLeaderboard(
        Array.isArray(
          leaderboardData?.leaderboard
        )
          ? leaderboardData.leaderboard
          : []
      );

      if (
        typeof leaderboardData?.playerCount ===
        "number"
      ) {
        setPlayerCount(
          leaderboardData.playerCount
        );
      }
    } catch (
      err
    ) {
      console.error(
        "Challenge page error:",
        err
      );

      setError(
        err instanceof
          Error
          ? err.message
          : "Something went wrong while loading the challenge."
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /*
   * ============================================================
   * RENAME
   * ============================================================
   */

  async function saveTitle() {
    if (!challenge) {
      return;
    }

    const cleanedTitle =
      title.trim();

    setError("");

    if (
      !cleanedTitle
    ) {
      setError(
        "Challenge name cannot be empty."
      );

      return;
    }

    if (
      cleanedTitle.length >
      60
    ) {
      setError(
        "Challenge name must be 60 characters or fewer."
      );

      return;
    }

    setSavingTitle(
      true
    );

    try {
      const response =
        await fetch(
          "/api/challenges/rename",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            cache: "no-store",

            body:
              JSON.stringify({
                challengeId:
                  challenge.id,

                title:
                  cleanedTitle,
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
            "Unable to rename the challenge."
        );
      }

      const updatedTitle =
        data?.challenge?.title ??
        cleanedTitle;

      setChallenge(
        (current) =>
          current
            ? {
                ...current,
                title:
                  updatedTitle,
              }
            : current
      );

      setTitle(
        updatedTitle
      );

      setEditingTitle(
        false
      );
    } catch (
      err
    ) {
      setError(
        err instanceof
          Error
          ? err.message
          : "Unable to rename the challenge."
      );
    } finally {
      setSavingTitle(
        false
      );
    }
  }

  /*
   * ============================================================
   * COPY LINK
   * ============================================================
   */

  async function copyInviteLink() {
    try {
      const link =
        `${window.location.origin}/challenges/${encodeURIComponent(
          inviteCode
        )}`;

      await navigator.clipboard.writeText(
        link
      );

      setCopied(
        true
      );

      window.setTimeout(
        () => {
          setCopied(
            false
          );
        },
        2000
      );
    } catch {
      setError(
        "Could not copy the invite link."
      );
    }
  }

  /*
   * ============================================================
   * SHARE
   * ============================================================
   */

  async function shareChallenge() {
    const link =
      `${window.location.origin}/challenges/${encodeURIComponent(
        inviteCode
      )}`;

    if (
      navigator.share
    ) {
      try {
        await navigator.share(
          {
            title:
              challenge?.title ??
              "Build Your XI Challenge",

            text:
              "Join my Build Your XI challenge!",

            url:
              link,
          }
        );
      } catch {
        // User cancelled.
      }

      return;
    }

    await copyInviteLink();
  }

  /*
   * ============================================================
   * PLAY
   * ============================================================
   */

  function handlePlay() {
    if (!challenge) {
      return;
    }

    setJoining(
      true
    );

    router.push(
      `/games?challenge=${encodeURIComponent(
        challenge.id
      )}&mode=${encodeURIComponent(
        challenge.game_mode
      )}`
    );
  }

  /*
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-[var(--muted)]">
            Loading challenge...
          </p>
        </div>
      </main>
    );
  }

  /*
   * ============================================================
   * GUEST CHALLENGE
   * ============================================================
   */

  if (
    guestChallenge
  ) {
    const challengePath =
      getChallengePath(
        inviteCode
      );

    return (
      <main className="min-h-screen px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/home"
              )
            }
            className="mb-8 flex items-center gap-2 text-sm font-bold text-[var(--muted)] transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </button>

          <section className="card mx-auto max-w-2xl p-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--accent)]/10">
              <Trophy className="h-8 w-8 text-[var(--accent)]" />
            </div>

            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--accent)]">
              Challenge Access
            </p>

            <h1 className="mt-3 text-2xl font-black sm:text-3xl">
              Registered player required
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">
              Only registered players can
              play challenges. Guest players
              can play normal games without
              registering.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/register?next=${encodeURIComponent(
                      challengePath
                    )}`
                  )
                }
                className="btn btn-primary min-h-11 text-xs font-black"
              >
                REGISTER TO PLAY
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/home"
                  )
                }
                className="btn btn-secondary min-h-11 text-xs font-black"
              >
                BACK TO HOME
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  /*
   * ============================================================
   * CHALLENGE UNAVAILABLE
   * ============================================================
   */

  if (
    challengeUnavailable
  ) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/challenges"
              )
            }
            className="mb-8 flex items-center gap-2 text-sm font-bold text-[var(--muted)] transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Challenges
          </button>

          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/10">
              <Trophy className="h-7 w-7 text-amber-300" />
            </div>

            <h1 className="mt-5 text-2xl font-black">
              Challenge unavailable
            </h1>

            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">
              This challenge has expired or
              was deleted. The invite link is
              no longer active.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/challenges"
                )
              }
              className="btn btn-primary mt-6"
            >
              BACK TO CHALLENGES
            </button>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ============================================================
   * GENERAL ERROR
   * ============================================================
   */

  if (
    error ||
    !challenge
  ) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/challenges"
              )
            }
            className="mb-8 flex items-center gap-2 text-sm font-bold text-[var(--muted)] transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Challenges
          </button>

          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <h1 className="text-xl font-black">
              Challenge unavailable
            </h1>

            <p className="mt-2 text-sm text-red-300">
              {error}
            </p>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ============================================================
   * BASIC CHALLENGE DATA
   * ============================================================
   */

  const isCreator =
    currentUserId ===
    challenge.creator_id;

  const isIpl =
    challenge.game_mode ===
    "ipl";

  /*
   * ============================================================
   * CURRENT PLAYER RECLAIM LOGIC
   * ============================================================
   *
   * IMPORTANT:
   *
   * This must be calculated against the CURRENTLY
   * LOGGED-IN PLAYER, not the challenge creator.
   *
   * Example:
   *
   * Creator = 56
   * Current player = 58
   *
   * The creator has been beaten,
   * but the current player has NOT been beaten.
   *
   * Therefore the current player must NOT see
   * "Your score has been beaten."
   */

  const currentUserScore =
    currentUserId
      ? leaderboard.find(
          (entry) =>
            entry.user_id ===
            currentUserId
        ) ?? null
      : null;

  const highestOpponent =
    currentUserId
      ? leaderboard.find(
          (entry) =>
            entry.user_id !==
            currentUserId
        ) ?? null
      : null;

  const currentUserHasBeenBeaten =
    Boolean(
      currentUserScore &&
      highestOpponent &&
      highestOpponent.score >
        currentUserScore.score
    );

  const currentUserReclaimScore =
    currentUserHasBeenBeaten &&
    highestOpponent
      ? highestOpponent.score
      : null;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() =>
            router.push(
              "/challenges"
            )
          }
          className="mb-10 flex items-center gap-2 text-sm font-bold text-[var(--muted)] transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Challenges
        </button>

        {/* ========================================================
            CHALLENGE HEADER
        ======================================================== */}

        <section className="card mx-auto max-w-2xl p-7 text-center">
          <div className="flex justify-center">
            <div
              className={`grid h-14 w-14 place-items-center rounded-2xl ${
                isIpl
                  ? "bg-[var(--accent)]/15"
                  : "bg-blue-500/15"
              }`}
            >
              {isIpl ? (
                <span className="text-3xl">
                  🏏
                </span>
              ) : (
                <Globe2 className="h-7 w-7" />
              )}
            </div>
          </div>

          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-[var(--accent)]">
            {isCreator
              ? "YOUR CHALLENGE"
              : "YOU'VE BEEN CHALLENGED"}
          </p>

          <div className="mt-3 flex items-center justify-center gap-2">
            {editingTitle ? (
              <div className="flex w-full max-w-xl flex-col items-center gap-2 sm:flex-row">
                <input
                  value={
                    title
                  }
                  onChange={(
                    event
                  ) =>
                    setTitle(
                      event.target
                        .value
                    )
                  }
                  maxLength={
                    60
                  }
                  autoFocus
                  className="min-w-0 flex-1 text-center sm:text-left"
                  onKeyDown={(
                    event
                  ) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      event.preventDefault();
                      saveTitle();
                    }

                    if (
                      event.key ===
                      "Escape"
                    ) {
                      setTitle(
                        challenge.title
                      );

                      setEditingTitle(
                        false
                      );
                    }
                  }}
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={
                      savingTitle
                    }
                    onClick={
                      saveTitle
                    }
                    className="rounded-lg px-3 py-2 text-xs font-black text-[var(--accent)] hover:bg-white/5 disabled:opacity-50"
                  >
                    {savingTitle
                      ? "SAVING..."
                      : "SAVE"}
                  </button>

                  <button
                    type="button"
                    disabled={
                      savingTitle
                    }
                    onClick={() => {
                      setTitle(
                        challenge.title
                      );

                      setEditingTitle(
                        false
                      );
                    }}
                    className="rounded-lg px-3 py-2 text-xs font-black text-[var(--muted)] hover:bg-white/5 disabled:opacity-50"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-black sm:text-3xl">
                  {
                    challenge.title
                  }
                </h1>

                {isCreator && (
                  <button
                    type="button"
                    aria-label="Rename challenge"
                    onClick={() => {
                      setTitle(
                        challenge.title
                      );

                      setEditingTitle(
                        true
                      );

                      setError(
                        ""
                      );
                    }}
                    className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>

          <p className="mt-2 text-sm text-[var(--muted)]">
            {isIpl
              ? "Build the ultimate IPL XI."
              : "Take on the world."}
          </p>

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
            <Users className="h-4 w-4" />

            {playerCount} player
            {playerCount !==
            1
              ? "s"
              : ""}
          </div>
        </section>

        {error && (
          <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ========================================================
            RECLAIM
        ======================================================== */}

        {currentUserHasBeenBeaten &&
          currentUserScore &&
          highestOpponent && (
            <section className="mx-auto mt-6 max-w-2xl">
              <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">
                      RECLAIM
                    </p>

                    <p className="mt-1 text-sm font-black">
                      Your score has been beaten.
                    </p>

                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Your score:{" "}
                      {
                        currentUserScore.score
                      }

                      {" · "}

                      Current score:{" "}
                      {
                        highestOpponent.score
                      }
                    </p>
                  </div>

                  <Trophy className="h-6 w-6 shrink-0 text-[var(--accent)]" />
                </div>
              </div>
            </section>
          )}

        {currentUserHasBeenBeaten &&
          currentUserReclaimScore !==
            null && (
            <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400/10 text-amber-300">
                  <Trophy className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-sm font-black uppercase tracking-wide text-amber-300">
                    Your score has been beaten
                  </p>

                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Another player has reached{" "}
                    <span className="font-black text-white">
                      {
                        currentUserReclaimScore
                      }
                    </span>
                    . Play again to reclaim the top spot.
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* ========================================================
            LEADERBOARD
        ======================================================== */}

        <section className="mt-8">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent)]">
                  Challenge Leaderboard
                </p>

                <p className="mt-1 text-sm text-[var(--muted)]">
                  {
                    leaderboard.length
                  }{" "}
                  player
                  {leaderboard.length !==
                  1
                    ? "s"
                    : ""}
                </p>
              </div>

              <Trophy className="h-5 w-5 text-[var(--accent)]" />
            </div>

            {leaderboard.length >
            0 ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                <div className="grid grid-cols-[48px_minmax(0,1fr)_80px] border-b border-white/10 px-4 py-3 text-[9px] font-black uppercase tracking-[0.15em] text-[var(--muted)]">
                  <span>
                    #
                  </span>

                  <span>
                    Player
                  </span>

                  <span className="text-right">
                    Score
                  </span>
                </div>

                <div className="divide-y divide-white/10">
                  {leaderboard.map(
                    (
                      entry,
                      index
                    ) => {
                      const isCurrentUser =
                        entry.user_id ===
                        currentUserId;

                      const isCreatorRow =
                        entry.user_id ===
                        challenge.creator_id;

                      return (
                        <div
                          key={
                            entry.user_id
                          }
                          className={`grid grid-cols-[48px_minmax(0,1fr)_80px] items-center px-4 py-3 ${
                            isCurrentUser
                              ? "bg-[var(--accent)]/10"
                              : ""
                          }`}
                        >
                          <span className="text-sm font-black text-[var(--muted)]">
                            {
                              index +
                              1
                            }
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-black">
                                {
                                  entry.gamer_tag
                                }
                              </p>

                              {isCreatorRow && (
                                <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[var(--muted)]">
                                  Creator
                                </span>
                              )}
                            </div>

                            {isCurrentUser && (
                              <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
                                You
                              </p>
                            )}
                          </div>

                          <span className="text-right text-base font-black text-[var(--accent)]">
                            {
                              entry.score
                            }
                          </span>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-6 text-center">
                <Trophy className="mx-auto h-7 w-7 text-[var(--accent)]" />

                <p className="mt-3 text-sm font-black">
                  Be the first to play
                </p>

                <p className="mt-1 text-xs text-[var(--muted)]">
                  Your score will appear here after you complete the challenge.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ========================================================
            PLAY
        ======================================================== */}

        <div className="mx-auto mt-10 max-w-xl">
          <button
            type="button"
            disabled={
              joining
            }
            onClick={
              handlePlay
            }
            className="w-full rounded-full bg-[var(--accent)] px-6 py-4 text-sm font-black tracking-wide text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {joining
              ? "JOINING..."
              : isCreator
              ? "PLAY ›"
              : "ACCEPT & PLAY ›"}
          </button>
        </div>

        {/* ========================================================
            ACTIONS
        ======================================================== */}

        <div className="mx-auto mt-4 grid max-w-xl grid-cols-2 gap-3">
          <button
            type="button"
            onClick={
              copyInviteLink
            }
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-white"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}

            {copied
              ? "COPIED"
              : "COPY LINK"}
          </button>

          <button
            type="button"
            onClick={
              shareChallenge
            }
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-white"
          >
            <Share2 className="h-4 w-4" />

            INVITE FRIENDS
          </button>
        </div>
      </div>
    </main>
  );
}