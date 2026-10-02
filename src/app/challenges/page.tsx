"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Check,
    Copy,
    Globe2,
    Pencil,
    Plus,
    Trash2,
    Share2,
    Trophy,
    Users,
    X,
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

type Player = {
    id: string;
    challenge_id: string;
    user_id: string;
    joined_at: string;
};

type ChallengeStatus =
    | "your_turn"
    | "leading"
    | "tied"
    | "behind"
    | "reclaim";

type ChallengeStatusDetails = {
    status: ChallengeStatus;
    score: number | null;
    leaderScore: number | null;
    rank: number | null;
    pointsBehind: number;
};

function formatDate(date: string) {
    return new Intl.DateTimeFormat(
        "en-IN",
        {
            day: "numeric",
            month: "short",
            year: "numeric",
        }
    ).format(
        new Date(date)
    );
}

export default function ChallengesPage() {
    const router = useRouter();
    const supabase = createClient();
    const [deletingChallengeId, setDeletingChallengeId] =
        useState<string | null>(null);
    const [loading, setLoading] =
        useState(true);

    const [creating, setCreating] =
        useState(false);

    const [guest, setGuest] =
        useState(false);

    const [error, setError] =
        useState("");

    const [challenges, setChallenges] =
        useState<Challenge[]>([]);

    const [playerCounts, setPlayerCounts] =
        useState<Record<string, number>>(
            {}
        );

    const [currentUserId, setCurrentUserId] =
        useState<string | null>(null);

    const [view, setView] =
        useState<
            "list" | "create"
        >("list");

    const [title, setTitle] =
        useState("");

    const [gameMode, setGameMode] =
        useState<GameMode>("ipl");

    const [copied, setCopied] =
        useState<string | null>(null);

    /*
     * ============================================================
     * RECLAIM STATE
     * ============================================================
     *
     * Contains the challenge IDs where the currently
     * logged-in user is the creator and their score
     * has been beaten by another player.
     */
    const [
        reclaimChallengeIds,
        setReclaimChallengeIds,
    ] = useState<Set<string>>(
        new Set()
    );

    const [
        challengeStatuses,
        setChallengeStatuses,
    ] = useState<
        Record<
            string,
            ChallengeStatusDetails
        >
    >({});
    /*
     * ============================================================
     * INLINE RENAME STATE
     * ============================================================
     */
    const [editingChallengeId, setEditingChallengeId] =
        useState<string | null>(null);

    const [editingTitle, setEditingTitle] =
        useState("");

    const [savingChallengeId, setSavingChallengeId] =
        useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] =
        useState<Challenge | null>(null);
    /*
     * ============================================================
     * LOAD CHALLENGES
     * ============================================================
     */

    async function loadChallenges() {
        setLoading(true);
        setError("");

        /*
         * Reset reclaim state before refreshing.
         */
        setReclaimChallengeIds(
            new Set()
        );
        setChallengeStatuses(
            {}
        );
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (
            userError ||
            !user
        ) {
            router.replace(
                "/login"
            );
            return;
        }

        /*
         * ============================================================
         * GUEST
         * ============================================================
         *
         * Guests can play normal games, but they do not have
         * registered challenge participation.
         */
        if (
            user.is_anonymous
        ) {
            setGuest(true);
            setLoading(false);
            return;
        }

        setGuest(false);

        setCurrentUserId(
            user.id
        );

        /*
         * ============================================================
         * LOAD CHALLENGES
         * ============================================================
         */

        const {
            data,
            error: challengesError,
        } = await supabase
            .from("challenges")
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false,
                }
            );

        if (
            challengesError
        ) {
            setError(
                challengesError.message
            );

            setLoading(false);

            return;
        }

        const challengeData =
            (data ??
                []) as Challenge[];

        setChallenges(
            challengeData
        );

        /*
         * No challenges.
         */
        if (
            challengeData.length ===
            0
        ) {
            setChallengeStatuses(
                {}
            );
            setPlayerCounts(
                {}
            );

            setReclaimChallengeIds(
                new Set()
            );

            setLoading(false);

            return;
        }

        const ids =
            challengeData.map(
                (challenge) =>
                    challenge.id
            );

        /*
         * ============================================================
         * LOAD PLAYER COUNTS
         * ============================================================
         *
         * Keep this exactly as a normal client-side query because
         * challenge_players already belongs to the challenge-list
         * UI and we only need the count.
         */

        const {
            data: players,
            error: playersError,
        } = await supabase
            .from(
                "challenge_players"
            )
            .select(
                "id, challenge_id, user_id, joined_at"
            )
            .in(
                "challenge_id",
                ids
            );

        if (
            playersError
        ) {
            setError(
                playersError.message
            );
        } else {
            const counts: Record<
                string,
                number
            > = {};

            (
                (players ??
                    []) as Player[]
            ).forEach(
                (player) => {
                    counts[
                        player.challenge_id
                    ] =
                        (
                            counts[
                            player.challenge_id
                            ] ??
                            0
                        ) + 1;
                }
            );

            setPlayerCounts(
                counts
            );
        }

        /*
         * ============================================================
         * LOAD RECLAIM STATUS
         * ============================================================
         *
         * IMPORTANT:
         *
         * Do NOT query challenge_scores directly from the browser.
         *
         * The server-side reclaim endpoint uses supabaseAdmin and
         * calculates RECLAIM for challenges created by the current
         * registered user.
         */

        try {
            const reclaimResponse =
                await fetch(
                    "/api/challenges/reclaim-status",
                    {
                        method: "GET",
                        cache: "no-store",
                    }
                );

            const reclaimData =
                await reclaimResponse
                    .json()
                    .catch(
                        () => null
                    );

            if (
                !reclaimResponse.ok
            ) {
                throw new Error(
                    reclaimData?.error ??
                    "Unable to load challenge reclaim status."
                );
            }

            const reclaimIds =
                Array.isArray(
                    reclaimData?.reclaimChallengeIds
                )
                    ? reclaimData.reclaimChallengeIds.filter(
                        (
                            value: unknown
                        ): value is string =>
                            typeof value ===
                            "string" &&
                            value.trim()
                                .length >
                            0
                    )
                    : [];

            setReclaimChallengeIds(
                new Set(
                    reclaimIds
                )
            );

            const statuses =
                reclaimData?.challengeStatuses;

            if (
                statuses &&
                typeof statuses ===
                "object"
            ) {
                setChallengeStatuses(
                    statuses as Record<
                        string,
                        ChallengeStatusDetails
                    >
                );
            } else {
                setChallengeStatuses(
                    {}
                );
            }
        } catch (
        reclaimError
        ) {
            /*
             * RECLAIM is supplementary UI.
             *
             * A failure here should NOT prevent the user's
             * challenge list from loading.
             */
            console.error(
                "Unable to load challenge reclaim status:",
                reclaimError
            );

            setReclaimChallengeIds(
                new Set()
            );

            setChallengeStatuses(
                {}
            );
        }

        setLoading(
            false
        );
    }

    useEffect(() => {
        loadChallenges();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /*
     * ============================================================
     * CREATE CHALLENGE
     * ============================================================
     */

    async function handleCreateChallenge() {
        const cleanedTitle =
            title.trim();

        setError("");

        if (!cleanedTitle) {
            setError(
                "Please enter a challenge title."
            );
            return;
        }

        if (
            cleanedTitle.length >
            60
        ) {
            setError(
                "Challenge title must be 60 characters or fewer."
            );
            return;
        }

        setCreating(true);

        const {
            data,
            error: createError,
        } = await supabase.rpc(
            "create_challenge",
            {
                p_title:
                    cleanedTitle,
                p_game_mode:
                    gameMode,
            }
        );

        if (createError) {
            setError(
                createError.message
            );
            setCreating(false);
            return;
        }

        const newChallenge =
            data as Challenge;

        setChallenges(
            (current) => [
                newChallenge,
                ...current,
            ]
        );

        setPlayerCounts(
            (current) => ({
                ...current,
                [newChallenge.id]:
                    1,
            })
        );

        setTitle("");
        setGameMode("ipl");
        setCreating(false);

        router.push(
            `/challenges/${encodeURIComponent(
                newChallenge.invite_code
            )}`
        );
    }

    /*
     * ============================================================
     * RENAME CHALLENGE
     * ============================================================
     */

    async function renameChallenge(
        challenge: Challenge
    ) {
        const cleanedTitle =
            editingTitle.trim();

        setError("");

        if (!cleanedTitle) {
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

        setSavingChallengeId(
            challenge.id
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
                        body: JSON.stringify(
                            {
                                challengeId:
                                    challenge.id,
                                title:
                                    cleanedTitle,
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
                    "Unable to rename the challenge."
                );
            }

            const updatedTitle =
                data?.challenge?.title ??
                cleanedTitle;

            setChallenges(
                (current) =>
                    current.map(
                        (item) =>
                            item.id ===
                                challenge.id
                                ? {
                                    ...item,
                                    title:
                                        updatedTitle,
                                }
                                : item
                    )
            );

            setEditingChallengeId(
                null
            );

            setEditingTitle(
                ""
            );
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to rename the challenge."
            );
        } finally {
            setSavingChallengeId(
                null
            );
        }
    }
    async function deleteChallenge(
        challenge: Challenge
    ) {
        setError("");

        setDeletingChallengeId(
            challenge.id
        );

        try {
            const response =
                await fetch(
                    "/api/challenges/delete",
                    {
                        method: "DELETE",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        cache: "no-store",
                        body: JSON.stringify({
                            challengeId:
                                challenge.id,
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
                    "Unable to delete the challenge."
                );
            }

            setChallenges(
                (current) =>
                    current.filter(
                        (item) =>
                            item.id !==
                            challenge.id
                    )
            );

            setPlayerCounts(
                (current) => {
                    const next = {
                        ...current,
                    };

                    delete next[
                        challenge.id
                    ];

                    return next;
                }
            );

            setDeleteTarget(
                null
            );
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to delete the challenge."
            );
        } finally {
            setDeletingChallengeId(
                null
            );
        }
    }
    /*
     * ============================================================
     * COPY LINK
     * ============================================================
     */

    async function copyInviteLink(
        challenge: Challenge
    ) {
        const link =
            `${window.location.origin}/challenges/${encodeURIComponent(
                challenge.invite_code
            )}`;

        try {
            await navigator.clipboard.writeText(
                link
            );

            setCopied(
                challenge.id
            );

            window.setTimeout(
                () => {
                    setCopied(null);
                },
                2000
            );
        } catch {
            setError(
                "Unable to copy the invite link."
            );
        }
    }

    /*
     * ============================================================
     * SHARE
     * ============================================================
     */

    async function shareChallenge(
        challenge: Challenge
    ) {
        const link =
            `${window.location.origin}/challenges/${encodeURIComponent(
                challenge.invite_code
            )}`;

        if (
            navigator.share
        ) {
            try {
                await navigator.share(
                    {
                        title:
                            challenge.title,
                        text:
                            `Join my ${challenge.game_mode ===
                                "ipl"
                                ? "IPL Challenge"
                                : "World Domination Challenge"
                            } on Build Your XI!`,
                        url:
                            link,
                    }
                );
            } catch {
                // User may cancel the share dialog.
            }

            return;
        }

        await copyInviteLink(
            challenge
        );
    }

    /*
     * ============================================================
     * PAGE TITLE
     * ============================================================
     */

    const pageTitle =
        useMemo(
            () =>
                view ===
                    "create"
                    ? "Create a Challenge"
                    : "Challenges",
            [view]
        );

    /*
     * ============================================================
     * LOADING
     * ============================================================
     */

    if (loading) {
        return (
            <main className="min-h-screen px-4 py-8 sm:px-6">
                <div className="mx-auto max-w-5xl">
                    <p className="text-center text-[var(--muted)]">
                        Loading challenges...
                    </p>
                </div>
            </main>
        );
    }

    /*
     * ============================================================
     * GUEST
     * ============================================================
     */

    if (guest) {
        return (
            <main className="min-h-screen px-4 py-8 sm:px-6">
                <section className="card mx-auto max-w-lg p-8 text-center">
                    <Trophy className="mx-auto h-10 w-10 text-[var(--accent)]" />

                    <h1 className="mt-5 text-2xl font-black">
                        Challenges are for registered players
                    </h1>

                    <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                        Create an account to challenge friends, share invite links,
                        and compete on challenge leaderboards.
                    </p>

                    <button
                        type="button"
                        onClick={() =>
                            router.push(
                                "/register"
                            )
                        }
                        className="btn btn-primary mt-6"
                    >
                        CREATE AN ACCOUNT
                    </button>
                </section>
            </main>
        );
    }

    return (
        <main className="min-h-screen w-full overflow-x-hidden px-4 py-8 sm:px-6">
            <section className="mx-auto w-full min-w-0 max-w-5xl">
                {/* Header */}

                <div className="flex min-w-0 items-center justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-3xl font-black sm:text-4xl">
                            {
                                pageTitle
                            }
                        </h1>

                        <p className="mt-2 text-sm text-[var(--muted)]">
                            Challenge your friends and compete for the top score.
                        </p>
                    </div>

                    {view ===
                        "list" && (
                            <button
                                type="button"
                                onClick={() =>
                                    setView(
                                        "create"
                                    )
                                }
                                className="btn btn-primary flex items-center gap-2"
                            >
                                <Plus className="h-4 w-4" />

                                <span className="hidden sm:inline">
                                    CREATE NEW CHALLENGE
                                </span>

                                <span className="sm:hidden">
                                    CREATE
                                </span>
                            </button>
                        )}
                </div>

                {/* Error */}

                {error && (
                    <div className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                        {error}
                    </div>
                )}

                {/* ========================================================
                    CREATE VIEW
                ======================================================== */}

                {view ===
                    "create" && (
                        <div className="mt-8">
                            <button
                                type="button"
                                onClick={() => {
                                    setView(
                                        "list"
                                    );
                                    setError(
                                        ""
                                    );
                                }}
                                className="flex items-center gap-2 text-sm font-bold text-[var(--muted)] transition hover:text-white"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back to Challenges
                            </button>

                            <div className="card mx-auto mt-5 max-w-2xl p-5 sm:p-8">
                                <div>
                                    <label className="text-sm font-bold">
                                        Challenge title
                                    </label>

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
                                        placeholder="Challenge your friends!"
                                        maxLength={
                                            60
                                        }
                                        className="mt-2 w-full"
                                    />
                                </div>

                                <div className="mt-7">
                                    <p className="text-sm font-bold">
                                        Select challenge
                                    </p>

                                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setGameMode(
                                                    "ipl"
                                                )
                                            }
                                            className={`rounded-2xl border p-5 text-left transition ${gameMode ===
                                                "ipl"
                                                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                                                : "border-white/10 hover:border-white/25"
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-3xl">
                                                    🏏
                                                </span>

                                                <div>
                                                    <p className="font-black">
                                                        IPL CHALLENGE
                                                    </p>

                                                    <p className="mt-1 text-xs text-[var(--muted)]">
                                                        Build the ultimate IPL XI.
                                                    </p>
                                                </div>
                                            </div>

                                            {gameMode ===
                                                "ipl" && (
                                                    <Check className="mt-4 h-5 w-5 text-[var(--accent)]" />
                                                )}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setGameMode(
                                                    "world"
                                                )
                                            }
                                            className={`rounded-2xl border p-5 text-left transition ${gameMode ===
                                                "world"
                                                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                                                : "border-white/10 hover:border-white/25"
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Globe2 className="h-8 w-8 text-[var(--accent)]" />

                                                <div>
                                                    <p className="font-black">
                                                        WORLD DOMINATION
                                                    </p>

                                                    <p className="mt-1 text-xs text-[var(--muted)]">
                                                        Take on the world.
                                                    </p>
                                                </div>
                                            </div>

                                            {gameMode ===
                                                "world" && (
                                                    <Check className="mt-4 h-5 w-5 text-[var(--accent)]" />
                                                )}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    disabled={
                                        creating
                                    }
                                    onClick={
                                        handleCreateChallenge
                                    }
                                    className="btn btn-primary mt-8 w-full"
                                >
                                    {creating
                                        ? "CREATING CHALLENGE..."
                                        : "CREATE CHALLENGE +"}
                                </button>
                            </div>
                        </div>
                    )}

                {/* ========================================================
                    EMPTY STATE
                ======================================================== */}

                {view ===
                    "list" &&
                    challenges.length ===
                    0 && (
                        <section className="card mt-10 flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
                            <Trophy className="h-14 w-14 text-[var(--accent)]" />

                            <h2 className="mt-6 text-2xl font-black">
                                Create your first Challenge.
                            </h2>

                            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
                                Create a challenge, invite your friends and compete to see
                                who can build the strongest XI.
                            </p>

                            <button
                                type="button"
                                onClick={() =>
                                    setView(
                                        "create"
                                    )
                                }
                                className="btn btn-primary mt-7 flex items-center gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                CREATE A CHALLENGE
                            </button>
                        </section>
                    )}

                {/* ========================================================
                    CHALLENGE LIST
                ======================================================== */}

                {view ===
                    "list" &&
                    challenges.length >
                    0 && (
                        <div className="mt-8 grid w-full min-w-0 justify-items-center gap-5 sm:grid-cols-2 sm:justify-items-stretch lg:grid-cols-3">
                            {challenges.map(
                                (
                                    challenge
                                ) => {
                                    const isIpl =
                                        challenge.game_mode ===
                                        "ipl";

                                    const isCreator =
                                        currentUserId ===
                                        challenge.creator_id;
                                    const challengeStatus =
                                        challengeStatuses[
                                        challenge.id
                                        ] ?? null;
                                    const isEditing =
                                        editingChallengeId ===
                                        challenge.id;

                                    return (
                                        <article
                                            key={
                                                challenge.id
                                            }
                                            onClick={() => {
                                                if (
                                                    isEditing
                                                ) {
                                                    return;
                                                }

                                                router.push(
                                                    `/challenges/${encodeURIComponent(
                                                        challenge.invite_code
                                                    )}`
                                                );
                                            }}
                                            className="card mx-auto flex min-h-[220px] min-w-0 w-full max-w-[330px] flex-col cursor-pointer p-5 transition hover:border-[var(--accent)]/50 lg:mx-0"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div
                                                    className={`grid h-12 w-12 place-items-center rounded-xl ${isIpl
                                                        ? "bg-[var(--accent)]/15"
                                                        : "bg-blue-500/15"
                                                        }`}
                                                >
                                                    {isIpl ? (
                                                        <span className="text-2xl">
                                                            🏏
                                                        </span>
                                                    ) : (
                                                        <Globe2 className="h-6 w-6" />
                                                    )}
                                                </div>

                                                <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black tracking-wider text-[var(--muted)]">
                                                    {isIpl
                                                        ? "IPL"
                                                        : "WORLD"}
                                                </span>
                                            </div>

                                            {/* Title */}

                                            <div className="mt-5 flex min-w-0 items-center gap-2">
                                                {isEditing ? (
                                                    <>
                                                        <input
                                                            value={
                                                                editingTitle
                                                            }
                                                            onChange={(
                                                                event
                                                            ) =>
                                                                setEditingTitle(
                                                                    event
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            maxLength={
                                                                60
                                                            }
                                                            autoFocus
                                                            className="min-w-0 flex-1"
                                                            onClick={(
                                                                event
                                                            ) =>
                                                                event.stopPropagation()
                                                            }
                                                            onKeyDown={(
                                                                event
                                                            ) => {
                                                                if (
                                                                    event.key ===
                                                                    "Enter"
                                                                ) {
                                                                    event.preventDefault();
                                                                    renameChallenge(
                                                                        challenge
                                                                    );
                                                                }

                                                                if (
                                                                    event.key ===
                                                                    "Escape"
                                                                ) {
                                                                    setEditingChallengeId(
                                                                        null
                                                                    );
                                                                    setEditingTitle(
                                                                        ""
                                                                    );
                                                                }
                                                            }}
                                                        />

                                                        <button
                                                            type="button"
                                                            disabled={
                                                                savingChallengeId ===
                                                                challenge.id
                                                            }
                                                            onClick={(
                                                                event
                                                            ) => {
                                                                event.stopPropagation();
                                                                renameChallenge(
                                                                    challenge
                                                                );
                                                            }}
                                                            className="shrink-0 rounded-lg p-1.5 text-[var(--accent)] transition hover:bg-white/5 disabled:opacity-50"
                                                            aria-label="Save challenge name"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={
                                                                savingChallengeId ===
                                                                challenge.id
                                                            }
                                                            onClick={(
                                                                event
                                                            ) => {
                                                                event.stopPropagation();
                                                                setEditingChallengeId(
                                                                    null
                                                                );
                                                                setEditingTitle(
                                                                    ""
                                                                );
                                                            }}
                                                            className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-white/5 disabled:opacity-50"
                                                            aria-label="Cancel rename"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <h2 className="min-w-0 flex-1 truncate text-lg font-black">
                                                            {
                                                                challenge.title
                                                            }
                                                        </h2>

                                                        {isCreator && (
                                                            <div className="flex shrink-0 items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();

                                                                        setEditingChallengeId(
                                                                            challenge.id
                                                                        );

                                                                        setEditingTitle(
                                                                            challenge.title
                                                                        );

                                                                        setError("");
                                                                    }}
                                                                    aria-label="Rename challenge"
                                                                    className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        deletingChallengeId ===
                                                                        challenge.id
                                                                    }
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();

                                                                        setDeleteTarget(
                                                                            challenge
                                                                        );

                                                                        setError("");
                                                                    }}
                                                                    aria-label="Delete challenge"
                                                                    className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    {deletingChallengeId ===
                                                                        challenge.id ? (
                                                                        <span className="block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                                                    ) : (
                                                                        <Trash2 className="h-4 w-4" />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            <p className="mt-2 text-xs text-[var(--muted)]">
                                                Created{" "}
                                                {formatDate(
                                                    challenge.created_at
                                                )}
                                            </p>
                                            {challengeStatus && (
                                                <div className="mt-3">
                                                    {challengeStatus.status ===
                                                        "reclaim" && (
                                                            <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-amber-300">
                                                                RECLAIM
                                                            </span>
                                                        )}

                                                    {challengeStatus.status ===
                                                        "leading" && (
                                                            <span className="inline-flex items-center rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--accent)]">
                                                                LEADING
                                                            </span>
                                                        )}

                                                    {challengeStatus.status ===
                                                        "tied" && (
                                                            <span className="inline-flex items-center rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-sky-300">
                                                                TIED
                                                            </span>
                                                        )}

                                                    {challengeStatus.status ===
                                                        "behind" && (
                                                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                                                                BEHIND
                                                            </span>
                                                        )}

                                                    {challengeStatus.status ===
                                                        "your_turn" && (
                                                            <span className="inline-flex items-center rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--accent)]">
                                                                YOUR TURN
                                                            </span>
                                                        )}
                                                </div>
                                            )}
                                            <div className="mt-5 flex items-center gap-2 text-sm text-[var(--muted)]">
                                                <Users className="h-4 w-4" />

                                                {
                                                    playerCounts[
                                                    challenge.id
                                                    ] ??
                                                    0
                                                }{" "}
                                                player
                                                {(
                                                    playerCounts[
                                                    challenge.id
                                                    ] ??
                                                    0
                                                ) !==
                                                    1
                                                    ? "s"
                                                    : ""}
                                            </div>

                                            <div className="mt-auto flex items-center gap-2 pt-5">
                                                <button
                                                    type="button"
                                                    onClick={(
                                                        event
                                                    ) => {
                                                        event.stopPropagation();

                                                        copyInviteLink(
                                                            challenge
                                                        );
                                                    }}
                                                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold tracking-wide text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-[var(--foreground)]"
                                                >
                                                    {copied ===
                                                        challenge.id ? (
                                                        <>
                                                            <Check className="h-3.5 w-3.5" />
                                                            COPIED
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy className="h-3.5 w-3.5" />
                                                            COPY
                                                        </>
                                                    )}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={(
                                                        event
                                                    ) => {
                                                        event.stopPropagation();

                                                        shareChallenge(
                                                            challenge
                                                        );
                                                    }}
                                                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--accent)]/30 px-3 py-2 text-xs font-bold tracking-wide text-[var(--foreground)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/10"
                                                >
                                                    <Share2 className="h-3.5 w-3.5" />
                                                    INVITE
                                                </button>
                                            </div>
                                        </article>
                                    );
                                }
                            )}
                        </div>
                    )}
            </section>
            {deleteTarget && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-challenge-title"
                    onMouseDown={(event) => {
                        if (
                            event.target ===
                            event.currentTarget
                        ) {
                            setDeleteTarget(
                                null
                            );
                        }
                    }}
                >
                    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#081b15] p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="grid h-11 w-11 place-items-center rounded-xl bg-red-500/10 text-red-400">
                                    <Trash2 className="h-5 w-5" />
                                </div>

                                <h2
                                    id="delete-challenge-title"
                                    className="mt-5 text-xl font-black"
                                >
                                    Delete challenge?
                                </h2>

                                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                                    You are about to delete{" "}
                                    <span className="font-bold text-white">
                                        "{deleteTarget.title}"
                                    </span>
                                    .
                                </p>

                                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                                    This will remove the challenge,
                                    its players and its leaderboard
                                    data. This action cannot be undone.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setDeleteTarget(
                                        null
                                    )
                                }
                                className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
                                aria-label="Close"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="mt-7 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                disabled={
                                    deletingChallengeId ===
                                    deleteTarget.id
                                }
                                onClick={() =>
                                    setDeleteTarget(
                                        null
                                    )
                                }
                                className="rounded-xl border border-white/10 px-4 py-3 text-sm font-black text-[var(--muted)] transition hover:border-white/20 hover:text-white disabled:opacity-50"
                            >
                                CANCEL
                            </button>

                            <button
                                type="button"
                                disabled={
                                    deletingChallengeId ===
                                    deleteTarget.id
                                }
                                onClick={() =>
                                    deleteChallenge(
                                        deleteTarget
                                    )
                                }
                                className="rounded-xl bg-red-500 px-4 py-3 text-sm font-black text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {deletingChallengeId ===
                                    deleteTarget.id
                                    ? "DELETING..."
                                    : "DELETE CHALLENGE"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}