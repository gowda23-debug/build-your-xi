"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

type GameMode = "ipl" | "world";

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

export default function ChallengePage() {
    const params = useParams();
    const router = useRouter();
    const supabase = createClient();

    const inviteCode =
        typeof params.inviteCode === "string"
            ? params.inviteCode
            : "";

    const [challenge, setChallenge] =
        useState<Challenge | null>(null);

    const [leaderboard, setLeaderboard] =
        useState<LeaderboardEntry[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [joining, setJoining] =
        useState(false);

    const [error, setError] =
        useState("");

    const [copied, setCopied] =
        useState(false);

    const [playerCount, setPlayerCount] =
        useState(0);

    const [currentUserId, setCurrentUserId] =
        useState<string | null>(null);

    const [editingTitle, setEditingTitle] =
        useState(false);

    const [title, setTitle] =
        useState("");

    const [savingTitle, setSavingTitle] =
        useState(false);

    useEffect(() => {
        if (inviteCode) {
            loadChallenge();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inviteCode]);

    async function loadChallenge() {
        setLoading(true);
        setError("");

        try {
            /*
             * ============================================================
             * AUTHENTICATION
             * ============================================================
             */

            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError) {
                throw userError;
            }

            if (!user) {
                setError(
                    "You must be logged in to join this challenge."
                );
                setLoading(false);
                return;
            }

            if (user.is_anonymous) {
                setError(
                    "Registered authentication is required for challenges."
                );
                setLoading(false);
                return;
            }

            setCurrentUserId(user.id);

            /*
             * ============================================================
             * LOAD CHALLENGE
             * ============================================================
             */

            const {
                data: challengeData,
                error: challengeError,
            } = await supabase
                .from("challenges")
                .select(
                    "id, creator_id, title, game_mode, invite_code, status, created_at, updated_at"
                )
                .eq(
                    "invite_code",
                    inviteCode
                )
                .single();

            if (
                challengeError ||
                !challengeData
            ) {
                console.error(
                    "Challenge loading error:",
                    challengeError
                );

                setError(
                    challengeError?.message ??
                    "No challenge was found with this invite code."
                );

                return;
            }

            const loadedChallenge =
                challengeData as Challenge;

            setChallenge(
                loadedChallenge
            );

            setTitle(
                loadedChallenge.title
            );

            /*
             * ============================================================
             * JOIN CHALLENGE
             * ============================================================
             *
             * The creator is already added when the challenge is created.
             *
             * An invited player is automatically added when they open
             * the challenge page.
             */

            setJoining(true);

            const {
                data: existingPlayer,
                error: existingPlayerError,
            } = await supabase
                .from("challenge_players")
                .select("challenge_id")
                .eq(
                    "challenge_id",
                    loadedChallenge.id
                )
                .eq(
                    "user_id",
                    user.id
                )
                .maybeSingle();

            if (existingPlayerError) {
                throw existingPlayerError;
            }

            if (!existingPlayer) {
                const {
                    error: joinError,
                } = await supabase
                    .from("challenge_players")
                    .insert({
                        challenge_id:
                            loadedChallenge.id,
                        user_id:
                            user.id,
                    });

                if (joinError) {
                    throw joinError;
                }
            }

            setJoining(false);

            /*
             * ============================================================
             * PLAYER COUNT
             * ============================================================
             */

            const {
                count,
                error: countError,
            } = await supabase
                .from("challenge_players")
                .select("*", {
                    count: "exact",
                    head: true,
                })
                .eq(
                    "challenge_id",
                    loadedChallenge.id
                );

            if (countError) {
                throw countError;
            }

            setPlayerCount(
                count ?? 0
            );

            /*
             * ============================================================
             * LEADERBOARD
             * ============================================================
             *
             * Profile data is intentionally loaded through the server API
             * rather than directly from the browser.
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
                    .catch(() => null);

            if (!leaderboardResponse.ok) {
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
        } catch (err) {
            console.error(
                "Challenge page error:",
                err
            );

            if (err instanceof Error) {
                setError(
                    err.message
                );
            } else {
                setError(
                    "Something went wrong while loading the challenge."
                );
            }
        } finally {
            setJoining(false);
            setLoading(false);
        }
    }

    /*
     * ============================================================
     * RENAME CHALLENGE
     * ============================================================
     */

    async function saveTitle() {
        if (!challenge) {
            return;
        }

        const cleanedTitle =
            title.trim();

        if (!cleanedTitle) {
            setError(
                "Challenge name cannot be empty."
            );
            return;
        }

        if (cleanedTitle.length > 60) {
            setError(
                "Challenge name must be 60 characters or fewer."
            );
            return;
        }

        setSavingTitle(true);
        setError("");

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
                        body: JSON.stringify({
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
                    .catch(() => null);

            if (!response.ok) {
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
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to rename the challenge."
            );
        } finally {
            setSavingTitle(false);
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

            setCopied(true);

            window.setTimeout(() => {
                setCopied(false);
            }, 2000);
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

        if (navigator.share) {
            try {
                await navigator.share({
                    title:
                        challenge?.title ??
                        "Challenge",
                    text:
                        "Join my Build Your XI challenge!",
                    url:
                        link,
                });
            } catch {
                // User may cancel the native share dialog.
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
            <main className="min-h-screen px-6 py-12">
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
     * ERROR
     * ============================================================
     */

    if (
        error ||
        !challenge
    ) {
        return (
            <main className="min-h-screen px-6 py-12">
                <div className="mx-auto max-w-3xl">
                    <button
                        type="button"
                        onClick={() =>
                            router.push(
                                "/challenges"
                            )
                        }
                        className="mb-8 flex items-center gap-2 text-sm font-bold text-[var(--muted)] hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Challenges
                    </button>

                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
                        <h1 className="text-xl font-black">
                            Challenge unavailable
                        </h1>

                        <p className="mt-2 text-sm text-red-300">
                            {error ||
                                "This challenge could not be found."}
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    const isIpl =
        challenge.game_mode ===
        "ipl";

    /*
     * ============================================================
     * CREATOR / INVITED PLAYER
     * ============================================================
     */

    const isCreator =
        currentUserId ===
        challenge.creator_id;

    /*
     * ============================================================
     * RECLAIM STATE
     * ============================================================
     *
     * The leaderboard is sorted descending by score.
     *
     * Reclaim appears only when:
     *
     * - creator has a score
     * - somebody else has the highest score
     * - that score is higher than the creator's score
     */

    const creatorScore =
        leaderboard.find(
            (entry) =>
                entry.user_id ===
                challenge.creator_id
        );

    const highestScore =
        leaderboard[0] ?? null;

    const creatorHasBeenBeaten =
        Boolean(
            creatorScore &&
            highestScore &&
            highestScore.user_id !==
                challenge.creator_id &&
            highestScore.score >
                creatorScore.score
        );

    return (
        <main className="min-h-screen px-6 py-10">
            <div className="mx-auto max-w-3xl">
                {/* Back */}

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

                {/* Challenge header */}

                <section className="card mx-auto max-w-2xl p-6 text-center">
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

                    <span className="mt-4 inline-block text-[10px] font-black tracking-[0.25em] text-[var(--accent)]">
                        {isCreator
                            ? "YOUR CHALLENGE"
                            : "YOU'VE BEEN CHALLENGED"}
                    </span>

                    {/* Challenge title / rename */}

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
                                            event
                                                .target
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

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={
                                            savingTitle
                                        }
                                        onClick={
                                            saveTitle
                                        }
                                        className="rounded-lg px-3 py-2 text-xs font-black text-[var(--accent)] transition hover:bg-white/5 disabled:opacity-50"
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
                                        className="rounded-lg px-3 py-2 text-xs font-black text-[var(--muted)] transition hover:bg-white/5 disabled:opacity-50"
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
                                        aria-label="Rename challenge"
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

                {/* Error */}

                {error && (
                    <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                        {error}
                    </div>
                )}

                {/* Reclaim */}

                {creatorHasBeenBeaten &&
                    creatorScore &&
                    highestScore && (
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
                                                creatorScore.score
                                            }
                                            {" · "}
                                            Current score:{" "}
                                            {
                                                highestScore.score
                                            }
                                        </p>
                                    </div>

                                    <Trophy className="h-6 w-6 shrink-0 text-[var(--accent)]" />
                                </div>
                            </div>
                        </section>
                    )}

                {/* Leaderboard */}

                <section className="mt-8">
                    <div className="mx-auto max-w-2xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent)]">
                                    Challenge Leaderboard
                                </p>

                                <p className="mt-1 text-sm text-[var(--muted)]">
                                    {leaderboard.length ===
                                    0
                                        ? "Be the first to set a score."
                                        : `${leaderboard.length} player${
                                              leaderboard.length !==
                                              1
                                                  ? "s"
                                                  : ""
                                          }`}
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
                                                        {index +
                                                            1}
                                                    </span>

                                                    <div className="min-w-0">
                                                        <div className="flex min-w-0 items-center gap-2">
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

                {/* Play */}

                <div className="mx-auto mt-10 max-w-xl">
                    <button
                        type="button"
                        disabled={joining}
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

                {/* Invite actions */}

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