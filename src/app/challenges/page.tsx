"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Check,
    Copy,
    Globe2,
    Plus,
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

function formatDate(date: string) {
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(date));
}

export default function ChallengesPage() {
    const router = useRouter();
    const supabase = createClient();

    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [guest, setGuest] = useState(false);
    const [error, setError] = useState("");

    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [playerCounts, setPlayerCounts] = useState<Record<string, number>>(
        {}
    );

    // Page states — all inside /challenges.
    const [view, setView] = useState<"list" | "create">("list");

    const [title, setTitle] = useState("");
    const [gameMode, setGameMode] = useState<GameMode>("ipl");

    const [copied, setCopied] = useState<string | null>(null);

    async function loadChallenges() {
        setLoading(true);
        setError("");

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace("/login");
            return;
        }

        if (user.is_anonymous) {
            setGuest(true);
            setLoading(false);
            return;
        }

        setGuest(false);

        const { data, error: challengesError } = await supabase
            .from("challenges")
            .select("*")
            .order("created_at", { ascending: false });

        if (challengesError) {
            setError(challengesError.message);
            setLoading(false);
            return;
        }

        const challengeData = (data ?? []) as Challenge[];
        setChallenges(challengeData);

        if (challengeData.length > 0) {
            const ids = challengeData.map((challenge) => challenge.id);

            const { data: players, error: playersError } = await supabase
                .from("challenge_players")
                .select("id, challenge_id, user_id, joined_at")
                .in("challenge_id", ids);

            if (playersError) {
                setError(playersError.message);
            } else {
                const counts: Record<string, number> = {};

                ((players ?? []) as Player[]).forEach((player) => {
                    counts[player.challenge_id] =
                        (counts[player.challenge_id] ?? 0) + 1;
                });

                setPlayerCounts(counts);
            }
        }

        setLoading(false);
    }

    useEffect(() => {
        loadChallenges();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleCreateChallenge() {
        const cleanedTitle = title.trim();

        setError("");

        if (!cleanedTitle) {
            setError("Please enter a challenge title.");
            return;
        }

        setCreating(true);

        const { data, error: createError } = await supabase.rpc(
            "create_challenge",
            {
                p_title: cleanedTitle,
                p_game_mode: gameMode,
            }
        );

        if (createError) {
            setError(createError.message);
            setCreating(false);
            return;
        }

        const newChallenge = data as Challenge;

        setChallenges((current) => [newChallenge, ...current]);

        setPlayerCounts((current) => ({
            ...current,
            [newChallenge.id]: 1,
        }));

        setTitle("");
        setGameMode("ipl");
        setCreating(false);

        router.push(`/challenges/${newChallenge.invite_code}`);

        // We will open the challenge lobby next.
        // For now, the newly created challenge appears immediately.
    }

    async function copyInviteLink(challenge: Challenge) {
        const link = `${window.location.origin}/challenges/${challenge.invite_code}`;

        try {
            await navigator.clipboard.writeText(link);

            setCopied(challenge.id);

            window.setTimeout(() => {
                setCopied(null);
            }, 2000);
        } catch {
            setError("Unable to copy the invite link.");
        }
    }

    async function shareChallenge(challenge: Challenge) {
        const link = `${window.location.origin}/challenges/${challenge.invite_code}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: challenge.title,
                    text: `Join my ${challenge.game_mode === "ipl" ? "IPL Challenge" : "World Domination Challenge"} on Build Your XI!`,
                    url: link,
                });
            } catch {
                // User may simply cancel the share dialog.
            }

            return;
        }

        await copyInviteLink(challenge);
    }

    const pageTitle = useMemo(() => {
        if (view === "create") {
            return "Create a Challenge";
        }

        return "Challenges";
    }, [view]);

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
                        onClick={() => router.push("/register")}
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
                <div className="flex min-w-0 items-center justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-3xl font-black sm:text-4xl">
                            {pageTitle}
                        </h1>

                        <p className="mt-2 text-sm text-[var(--muted)]">
                            Challenge your friends and compete for the top score.
                        </p>
                    </div>

                    {view === "list" && challenges.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setView("create")}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            <span className="hidden sm:inline">
                                CREATE NEW CHALLENGE
                            </span>
                            <span className="sm:hidden">CREATE</span>
                        </button>
                    )}
                </div>

                {error && (
                    <div className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                        {error}
                    </div>
                )}

                {/* CREATE VIEW */}
                {view === "create" && (
                    <div className="mt-8">
                        <button
                            type="button"
                            onClick={() => {
                                setView("list");
                                setError("");
                            }}
                            className="flex items-center gap-2 text-sm font-bold text-[var(--muted)] transition hover:text-white"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to Challenges
                        </button>

                        <div className="card mt-5 mx-auto max-w-2xl p-5 sm:p-8">
                            <div>
                                <label className="text-sm font-bold">
                                    Challenge title
                                </label>

                                <input
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    placeholder="Challenge your friends!"
                                    maxLength={60}
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
                                        onClick={() => setGameMode("ipl")}
                                        className={`rounded-2xl border p-5 text-left transition ${gameMode === "ipl"
                                            ? "border-[var(--accent)] bg-[var(--accent)]/10"
                                            : "border-white/10 hover:border-white/25"
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-3xl">🏏</span>

                                            <div>
                                                <p className="font-black">IPL CHALLENGE</p>

                                                <p className="mt-1 text-xs text-[var(--muted)]">
                                                    Build the ultimate IPL XI.
                                                </p>
                                            </div>
                                        </div>

                                        {gameMode === "ipl" && (
                                            <Check className="mt-4 h-5 w-5 text-[var(--accent)]" />
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setGameMode("world")}
                                        className={`rounded-2xl border p-5 text-left transition ${gameMode === "world"
                                            ? "border-[var(--accent)] bg-[var(--accent)]/10"
                                            : "border-white/10 hover:border-white/25"
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Globe2 className="h-8 w-8 text-[var(--accent)]" />

                                            <div>
                                                <p className="font-black">WORLD DOMINATION</p>

                                                <p className="mt-1 text-xs text-[var(--muted)]">
                                                    Take on the world.
                                                </p>
                                            </div>
                                        </div>

                                        {gameMode === "world" && (
                                            <Check className="mt-4 h-5 w-5 text-[var(--accent)]" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="button"
                                disabled={creating}
                                onClick={handleCreateChallenge}
                                className="btn btn-primary mt-8 w-full"
                            >
                                {creating
                                    ? "CREATING CHALLENGE..."
                                    : "CREATE CHALLENGE +"}
                            </button>
                        </div>
                    </div>
                )}

                {/* EMPTY STATE */}
                {view === "list" && challenges.length === 0 && (
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
                            onClick={() => setView("create")}
                            className="btn btn-primary mt-7 flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            CREATE A CHALLENGE
                        </button>
                    </section>
                )}

                {/* CHALLENGE LIST */}
                {view === "list" && challenges.length > 0 && (
                    <div className="mt-8 grid w-full min-w-0 justify-items-center gap-5 sm:grid-cols-2 sm:justify-items-stretch lg:grid-cols-3">
                        {challenges.map((challenge) => {
                            const isIpl = challenge.game_mode === "ipl";

                            return (
                                <article
                                    key={challenge.id}
                                    onClick={() =>
                                        router.push(`/challenges/${challenge.invite_code}`)
                                    }
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
                                                <span className="text-2xl">🏏</span>
                                            ) : (
                                                <Globe2 className="h-6 w-6" />
                                            )}
                                        </div>

                                        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black tracking-wider text-[var(--muted)]">
                                            {isIpl ? "IPL" : "WORLD"}
                                        </span>
                                    </div>

                                    <h2 className="mt-5 text-lg font-black">
                                        {challenge.title}
                                    </h2>

                                    <p className="mt-2 text-xs text-[var(--muted)]">
                                        Created {formatDate(challenge.created_at)}
                                    </p>

                                    <div className="mt-5 flex items-center gap-2 text-sm text-[var(--muted)]">
                                        <Users className="h-4 w-4" />

                                        {playerCounts[challenge.id] ?? 0} player
                                        {(playerCounts[challenge.id] ?? 0) !== 1 ? "s" : ""}
                                    </div>

                                    <div className="mt-auto flex items-center gap-2 pt-5">
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                copyInviteLink(challenge);
                                            }}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold tracking-wide text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-[var(--foreground)]"
                                        >
                                            {copied === challenge.id ? (
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
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                shareChallenge(challenge);
                                            }}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--accent)]/30 px-3 py-2 text-xs font-bold tracking-wide text-[var(--foreground)] transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/10"
                                        >
                                            INVITE
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}