"use client";

import { useEffect, useState } from "react";
import { Trophy, Medal, Crown, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type ScoreRow = {
    user_id: string;
    score: number | string;
    created_at: string;
};

type Profile = {
    id: string;
    gamer_tag: string | null;
    display_name: string | null;
};

type TopPlayer = {
    userId: string;
    name: string;
    score: number;
    playedAt: string;
    rank: number;
};

function getPlayerName(profile?: Profile) {
    if (!profile) {
        return "Unknown Player";
    }

    return (
        profile.display_name ||
        profile.gamer_tag ||
        "Unknown Player"
    );
}

function getRankIcon(rank: number) {
    if (rank === 1) {
        return <Crown className="h-5 w-5" />;
    }

    if (rank === 2) {
        return <Medal className="h-5 w-5" />;
    }

    if (rank === 3) {
        return <Medal className="h-5 w-5" />;
    }

    return (
        <span className="text-sm font-black text-[var(--muted)]">
            #{rank}
        </span>
    );
}

export default function LeaderboardPage() {
    const [players, setPlayers] = useState<TopPlayer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function loadLeaderboard() {
            setLoading(true);
            setError("");

            try {
                const supabase = createClient();

                /*
                 * Get all submitted challenge scores.
                 */
                const {
                    data: scoreData,
                    error: scoreError,
                } = await supabase
                    .from("challenge_scores")
                    .select(`
                        user_id,
                        score,
                        created_at
                    `)
                    .order("score", {
                        ascending: false,
                    });

                if (scoreError) {
                    throw scoreError;
                }

                /*
                 * If nobody has played yet,
                 * show an empty leaderboard.
                 */
                if (!scoreData || scoreData.length === 0) {
                    setPlayers([]);
                    return;
                }

                const scores = scoreData as ScoreRow[];

                /*
                 * Keep only the best score for each user.
                 */
                const bestScores = new Map<
                    string,
                    {
                        score: number;
                        created_at: string;
                    }
                >();

                for (const scoreRow of scores) {
                    const numericScore = Number(scoreRow.score);

                    const existing = bestScores.get(
                        scoreRow.user_id
                    );

                    if (
                        !existing ||
                        numericScore > existing.score
                    ) {
                        bestScores.set(
                            scoreRow.user_id,
                            {
                                score: numericScore,
                                created_at:
                                    scoreRow.created_at,
                            }
                        );
                    }
                }

                /*
                 * Get the unique user IDs.
                 */
                const userIds = Array.from(
                    bestScores.keys()
                );

                /*
                 * Get player profile information.
                 */
                const {
                    data: profileData,
                    error: profileError,
                } = await supabase
                    .from("profiles")
                    .select(`
                        id,
                        gamer_tag,
                        display_name
                    `)
                    .in("id", userIds);

                if (profileError) {
                    throw profileError;
                }

                const profiles = (
                    profileData ?? []
                ) as Profile[];

                /*
                 * Create a quick lookup table.
                 */
                const profileMap = new Map<
                    string,
                    Profile
                >();

                for (const profile of profiles) {
                    profileMap.set(
                        profile.id,
                        profile
                    );
                }

                /*
                 * Convert the best scores into leaderboard players.
                 */
                const leaderboardPlayers =
                    Array.from(
                        bestScores.entries()
                    )
                        .map(
                            ([
                                userId,
                                scoreInfo,
                            ]) => {
                                const profile =
                                    profileMap.get(
                                        userId
                                    );

                                return {
                                    userId,
                                    name: getPlayerName(
                                        profile
                                    ),
                                    score:
                                        scoreInfo.score,
                                    playedAt:
                                        scoreInfo.created_at,
                                    rank: 0,
                                };
                            }
                        )
                        .sort(
                            (a, b) =>
                                b.score - a.score
                        );

                /*
                 * Assign ranks.
                 */
                const rankedPlayers =
                    leaderboardPlayers.map(
                        (player, index) => ({
                            ...player,
                            rank: index + 1,
                        })
                    );

                setPlayers(rankedPlayers);
            } catch (err) {
                console.error(
                    "Leaderboard loading error:",
                    err
                );

                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError(
                        "Something went wrong while loading the leaderboard."
                    );
                }
            } finally {
                setLoading(false);
            }
        }

        loadLeaderboard();
    }, []);

    return (
        <main className="min-h-screen">
            <section className="mx-auto max-w-6xl px-6 py-12">
                {/* HEADER */}

                <div className="mb-10">
                    <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--accent)]/15">
                            <Trophy className="h-6 w-6 text-[var(--accent)]" />
                        </div>

                        <div>
                            <h1 className="text-3xl font-black">
                                Leaderboard
                            </h1>

                            <p className="mt-1 text-sm text-[var(--muted)]">
                                See who's at the top.
                            </p>
                        </div>
                    </div>
                </div>

                {/* LOADING */}

                {loading && (
                    <div className="card flex min-h-[300px] items-center justify-center">
                        <p className="text-sm text-[var(--muted)]">
                            Loading leaderboard...
                        </p>
                    </div>
                )}

                {/* ERROR */}

                {!loading && error && (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
                        <h2 className="text-lg font-black text-red-300">
                            Unable to load leaderboard
                        </h2>

                        <p className="mt-2 text-sm text-red-200/80">
                            {error}
                        </p>
                    </div>
                )}

                {/* EMPTY STATE */}

                {!loading &&
                    !error &&
                    players.length === 0 && (
                        <div className="card flex min-h-[350px] flex-col items-center justify-center p-8 text-center">
                            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[var(--accent)]/10">
                                <Trophy className="h-8 w-8 text-[var(--accent)]" />
                            </div>

                            <h2 className="mt-6 text-xl font-black">
                                No scores yet
                            </h2>

                            <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                                No one has completed a
                                challenge yet. Play a game
                                and set the first score!
                            </p>
                        </div>
                    )}

                {/* LEADERBOARD */}

                {!loading &&
                    !error &&
                    players.length > 0 && (
                        <div className="card overflow-hidden">
                            {/* TABLE HEADER */}

                            <div className="grid grid-cols-[70px_1fr_auto] items-center gap-4 border-b border-white/10 px-6 py-4 text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                                <div>Rank</div>

                                <div>Player</div>

                                <div>Score</div>
                            </div>

                            {/* PLAYERS */}

                            <div>
                                {players.map(
                                    (player) => (
                                        <div
                                            key={
                                                player.userId
                                            }
                                            className="grid grid-cols-[70px_1fr_auto] items-center gap-4 border-b border-white/5 px-6 py-5 last:border-b-0 transition hover:bg-white/[0.02]"
                                        >
                                            {/* RANK */}

                                            <div className="flex items-center">
                                                <div
                                                    className={`grid h-10 w-10 place-items-center rounded-xl ${
                                                        player.rank ===
                                                        1
                                                            ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                                                            : player.rank ===
                                                                2
                                                              ? "bg-white/10 text-white"
                                                              : player.rank ===
                                                                  3
                                                                ? "bg-orange-400/10 text-orange-300"
                                                                : "bg-white/5"
                                                    }`}
                                                >
                                                    {getRankIcon(
                                                        player.rank
                                                    )}
                                                </div>
                                            </div>

                                            {/* PLAYER */}

                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--accent)]/10">
                                                    <Users className="h-4 w-4 text-[var(--accent)]" />
                                                </div>

                                                <div className="min-w-0">
                                                    <p className="truncate font-black">
                                                        {
                                                            player.name
                                                        }
                                                    </p>

                                                    <p className="mt-1 text-xs text-[var(--muted)]">
                                                        Challenge
                                                        player
                                                    </p>
                                                </div>
                                            </div>

                                            {/* SCORE */}

                                            <div className="text-right">
                                                <p className="text-lg font-black text-[var(--accent)]">
                                                    {player.score}
                                                </p>

                                                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                                                    points
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    )}
            </section>
        </main>
    );
}