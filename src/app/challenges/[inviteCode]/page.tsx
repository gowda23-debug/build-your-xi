"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft,
    Copy,
    Globe2,
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

type Leader = {
    user_id: string;
    score: number;
    created_at: string;
};

export default function ChallengePage() {
    const params = useParams();
    const router = useRouter();
    const supabase = createClient();

    const inviteCode = params.inviteCode as string;

    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [leader, setLeader] = useState<Leader | null>(null);

    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);

    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    const [playerCount, setPlayerCount] = useState(0);

    useEffect(() => {
        if (inviteCode) {
            loadChallenge();
        }
    }, [inviteCode]);

    async function loadChallenge() {
        setLoading(true);
        setError("");

        try {
            // 1. Get current user
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError) {
                throw userError;
            }

            if (!user) {
                setError("You must be logged in to join this challenge.");
                setLoading(false);
                return;
            }

            // 2. Find challenge using invite code
            const { data: challengeData, error: challengeError } =
                await supabase
                    .from("challenges")
                    .select("*")
                    .eq("invite_code", inviteCode)
                    .single();

            console.log("Invite code:", inviteCode);
            console.log("Challenge data:", challengeData);
            console.log("Challenge error:", challengeError);

            if (challengeError || !challengeData) {
                console.error("Challenge loading error:", challengeError);

                setError(
                    challengeError?.message ??
                    "No challenge was found with this invite code."
                );

                return;
            }

            setChallenge(challengeData);

            // 3. Automatically join the challenge
            // 3. Check whether the current user already joined
            setJoining(true);

            const {
                data: existingPlayer,
                error: existingPlayerError,
            } = await supabase
                .from("challenge_players")
                .select("challenge_id")
                .eq("challenge_id", challengeData.id)
                .eq("user_id", user.id)
                .maybeSingle();

            if (existingPlayerError) {
                throw existingPlayerError;
            }

            // Only insert when the user has not joined yet
            if (!existingPlayer) {
                const { error: joinError } = await supabase
                    .from("challenge_players")
                    .insert({
                        challenge_id: challengeData.id,
                        user_id: user.id,
                    });

                if (joinError) {
                    throw joinError;
                }
            }

            setJoining(false);

            // 4. Get player count
            const { count, error: countError } = await supabase
                .from("challenge_players")
                .select("*", {
                    count: "exact",
                    head: true,
                })
                .eq("challenge_id", challengeData.id);

            if (countError) {
                throw countError;
            }

            setPlayerCount(count ?? 0);

            // 5. Get the current highest score
            const { data: scoreData, error: scoreError } =
                await supabase
                    .from("challenge_scores")
                    .select("user_id, score, created_at")
                    .eq("challenge_id", challengeData.id)
                    .order("score", {
                        ascending: false,
                    })
                    .limit(1);

            if (scoreError) {
                throw scoreError;
            }

            if (scoreData && scoreData.length > 0) {
                setLeader(scoreData[0]);
            }
        } catch (err) {
            console.error(err);

            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("Something went wrong while loading the challenge.");
            }
        } finally {
            setJoining(false);
            setLoading(false);
        }
    }

    async function copyInviteLink() {
        try {
            const link = `${window.location.origin}/challenges/${inviteCode}`;

            await navigator.clipboard.writeText(link);

            setCopied(true);

            setTimeout(() => {
                setCopied(false);
            }, 2000);
        } catch {
            setError("Could not copy the invite link.");
        }
    }

    async function shareChallenge() {
        const link = `${window.location.origin}/challenges/${inviteCode}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: challenge?.title ?? "Challenge",
                    text: "Join my challenge!",
                    url: link,
                });
            } catch {
                // User may cancel the share dialog.
            }
        } else {
            await copyInviteLink();
        }
    }

    function handlePlay() {
        if (!challenge) return;

        router.push(
            `/games?challenge=${challenge.id}&mode=${challenge.game_mode}`
        );
    }

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

    if (error || !challenge) {
        return (
            <main className="min-h-screen px-6 py-12">
                <div className="mx-auto max-w-3xl">
                    <button
                        type="button"
                        onClick={() => router.push("/challenges")}
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
                            {error || "This challenge could not be found."}
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    const isIpl = challenge.game_mode === "ipl";

    return (
        <main className="min-h-screen px-6 py-10">
            <div className="mx-auto max-w-3xl">
                {/* Back */}

                <button
                    type="button"
                    onClick={() => router.push("/challenges")}
                    className="mb-10 flex items-center gap-2 text-sm font-bold text-[var(--muted)] transition hover:text-white"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Challenges
                </button>

                {/* Challenge header */}

                <section className="card mx-auto max-w-2xl p-6 text-center">
                    <div className="flex justify-center">
                        <div
                            className={`grid h-14 w-14 place-items-center rounded-2xl ${isIpl
                                ? "bg-[var(--accent)]/15"
                                : "bg-blue-500/15"
                                }`}
                        >
                            {isIpl ? (
                                <span className="text-3xl">🏏</span>
                            ) : (
                                <Globe2 className="h-7 w-7" />
                            )}
                        </div>
                    </div>

                    <span className="mt-4 inline-block text-[10px] font-black tracking-[0.25em] text-[var(--accent)]">
                        YOU'VE BEEN CHALLENGED
                    </span>

                    <h1 className="mt-3 text-2xl font-black">
                        {challenge.title}
                    </h1>

                    <p className="mt-2 text-sm text-[var(--muted)]">
                        {isIpl
                            ? "Build the ultimate IPL XI."
                            : "Take on the world."}
                    </p>

                    <div className="mt-6 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
                        <Users className="h-4 w-4" />

                        {playerCount} player
                        {playerCount !== 1 ? "s" : ""}
                    </div>
                </section>

                {/* Score to beat */}

                <section className="mt-8 text-center">
                    {leader ? (
                        <>
                            <div className="flex justify-center">
                                <div className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2">
                                    <span className="flex items-center gap-2 text-sm font-bold">
                                        <Trophy className="h-4 w-4 text-[var(--accent)]" />

                                        Beat the current leader:{" "}
                                        <span className="text-[var(--accent)]">
                                            {leader.score}
                                        </span>
                                    </span>
                                </div>
                            </div>

                            <p className="mt-5 text-sm text-[var(--muted)]">
                                A player has already set the score to beat.
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="flex justify-center">
                                <div className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2">
                                    <span className="flex items-center gap-2 text-sm font-bold">
                                        <Trophy className="h-4 w-4 text-[var(--accent)]" />

                                        Be the first to play!
                                    </span>
                                </div>
                            </div>

                            <p className="mt-5 text-sm text-[var(--muted)]">
                                No one has played this challenge yet.
                                Set the score everyone else has to beat.
                            </p>
                        </>
                    )}
                </section>

                {/* Play button */}

                <div className="mx-auto mt-10 max-w-xl">
                    <button
                        type="button"
                        disabled={joining}
                        onClick={handlePlay}
                        className="w-full rounded-full bg-[var(--accent)] px-6 py-4 text-sm font-black tracking-wide text-black transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {joining
                            ? "JOINING..."
                            : leader
                                ? "ACCEPT & PLAY ›"
                                : "PLAY FIRST ›"}
                    </button>
                </div>

                {/* Invite actions */}

                <div className="mx-auto mt-4 grid max-w-xl grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={copyInviteLink}
                        className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-[var(--muted)] transition hover:border-[var(--accent)]/50 hover:text-white"
                    >
                        <Copy className="h-4 w-4" />

                        {copied ? "COPIED" : "COPY LINK"}
                    </button>

                    <button
                        type="button"
                        onClick={shareChallenge}
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