import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ChallengeRow = {
    id: string;
    creator_id: string;
};

type ChallengeScoreRow = {
    challenge_id: string;
    user_id: string;
    score: number | string;
};

type ChallengePlayerRow = {
    challenge_id: string;
    user_id: string;
};

type ChallengeStatus =
    | "your_turn"
    | "leading"
    | "tied"
    | "behind"
    | "reclaim";

type StatusDetails = {
    status: ChallengeStatus;
    score: number | null;
    leaderScore: number | null;
    rank: number | null;
    pointsBehind: number;
};

export async function GET() {
    try {
        /*
         * ============================================================
         * AUTHENTICATION
         * ============================================================
         */

        const {
            user,
            error: authError,
        } = await requireUser();

        if (authError || !user) {
            return (
                authError ??
                NextResponse.json(
                    {
                        error: "Unauthorized",
                    },
                    {
                        status: 401,
                    }
                )
            );
        }

        /*
         * Guests do not participate in challenges.
         */
        if (user.is_anonymous) {
            return NextResponse.json(
                {
                    reclaimChallengeIds: [],
                    challengeStatuses: {},
                },
                {
                    status: 200,
                    headers: {
                        "Cache-Control":
                            "private, no-store",
                    },
                }
            );
        }

        /*
         * ============================================================
         * LOAD CHALLENGES
         * ============================================================
         *
         * We need the creator ID for every challenge because:
         *
         * - creators can have YOUR TURN before their first score
         * - creators can receive RECLAIM
         */

        const {
            data: challengeData,
            error: challengeError,
        } = await supabaseAdmin
            .from("challenges")
            .select("id, creator_id");

        if (challengeError) {
            console.error(
                "Challenge status lookup error:",
                challengeError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to load challenge status.",
                },
                {
                    status: 500,
                }
            );
        }

        const challenges =
            (challengeData ??
                []) as ChallengeRow[];

        if (challenges.length === 0) {
            return NextResponse.json(
                {
                    reclaimChallengeIds: [],
                    challengeStatuses: {},
                },
                {
                    status: 200,
                    headers: {
                        "Cache-Control":
                            "private, no-store",
                    },
                }
            );
        }

        /*
         * ============================================================
         * FIND CHALLENGES RELEVANT TO CURRENT USER
         * ============================================================
         *
         * A challenge is relevant when:
         *
         * 1. Current user created it
         * 2. Current user has joined it
         * 3. Current user has a score in it
         *
         * This prevents us from calculating status for every
         * challenge for every user.
         */

        const creatorChallengeIds =
            new Set<string>(
                challenges
                    .filter(
                        (challenge) =>
                            challenge.creator_id ===
                            user.id
                    )
                    .map(
                        (challenge) =>
                            challenge.id
                    )
            );

        const {
            data: playerData,
            error: playerError,
        } = await supabaseAdmin
            .from("challenge_players")
            .select(
                "challenge_id, user_id"
            )
            .eq(
                "user_id",
                user.id
            );

        if (playerError) {
            console.error(
                "Challenge player status lookup error:",
                playerError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to load your challenge participation.",
                },
                {
                    status: 500,
                }
            );
        }

        const playerRows =
            (playerData ??
                []) as ChallengePlayerRow[];

        const relevantChallengeIds =
            new Set<string>(
                creatorChallengeIds
            );

        playerRows.forEach(
            (row) => {
                relevantChallengeIds.add(
                    String(
                        row.challenge_id
                    )
                );
            }
        );

        /*
         * ============================================================
         * LOAD CURRENT USER SCORES
         * ============================================================
         */

        const {
            data: currentUserScoreData,
            error:
                currentUserScoreError,
        } = await supabaseAdmin
            .from("challenge_scores")
            .select(
                "challenge_id, user_id, score"
            )
            .eq(
                "user_id",
                user.id
            );

        if (currentUserScoreError) {
            console.error(
                "Current user challenge score lookup error:",
                currentUserScoreError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to load your challenge scores.",
                },
                {
                    status: 500,
                }
            );
        }

        const currentUserScores =
            (currentUserScoreData ??
                []) as ChallengeScoreRow[];

        currentUserScores.forEach(
            (row) => {
                relevantChallengeIds.add(
                    String(
                        row.challenge_id
                    )
                );
            }
        );

        if (
            relevantChallengeIds.size ===
            0
        ) {
            return NextResponse.json(
                {
                    reclaimChallengeIds: [],
                    challengeStatuses: {},
                },
                {
                    status: 200,
                    headers: {
                        "Cache-Control":
                            "private, no-store",
                    },
                }
            );
        }

        /*
         * ============================================================
         * LOAD ALL SCORES FOR RELEVANT CHALLENGES
         * ============================================================
         */

        const challengeIds =
            Array.from(
                relevantChallengeIds
            );

        const {
            data: scoreData,
            error: scoreError,
        } = await supabaseAdmin
            .from("challenge_scores")
            .select(
                "challenge_id, user_id, score"
            )
            .in(
                "challenge_id",
                challengeIds
            );

        if (scoreError) {
            console.error(
                "Challenge score lookup error:",
                scoreError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to load challenge scores.",
                },
                {
                    status: 500,
                }
            );
        }

        const scores =
            (scoreData ??
                []) as ChallengeScoreRow[];

        /*
         * ============================================================
         * BUILD SCORE MAP
         * ============================================================
         *
         * Keep the best score for every player in every challenge.
         */

        const scoresByChallenge =
            new Map<
                string,
                Map<string, number>
            >();

        for (
            const row of scores
        ) {
            const challengeId =
                String(
                    row.challenge_id
                );

            const userId =
                String(
                    row.user_id
                );

            const score =
                Number(
                    row.score
                );

            if (
                !Number.isFinite(
                    score
                )
            ) {
                continue;
            }

            if (
                !scoresByChallenge.has(
                    challengeId
                )
            ) {
                scoresByChallenge.set(
                    challengeId,
                    new Map<
                        string,
                        number
                    >()
                );
            }

            const players =
                scoresByChallenge.get(
                    challengeId
                )!;

            const previous =
                players.get(
                    userId
                );

            players.set(
                userId,
                previous ===
                    undefined
                    ? score
                    : Math.max(
                        previous,
                        score
                    )
            );
        }

        /*
         * ============================================================
         * CALCULATE STATUS
         * ============================================================
         */

        const challengeStatuses: Record<
            string,
            StatusDetails
        > = {};

        const reclaimChallengeIds =
            new Set<string>();

        for (
            const challenge of
                challenges
        ) {
            if (
                !relevantChallengeIds.has(
                    challenge.id
                )
            ) {
                continue;
            }

            const players =
                scoresByChallenge.get(
                    challenge.id
                ) ??
                new Map<
                    string,
                    number
                >();

            const currentUserScore =
                players.get(
                    user.id
                );

            /*
             * --------------------------------------------------------
             * CURRENT USER HAS NOT PLAYED
             * --------------------------------------------------------
             *
             * This applies to:
             *
             * - challenge creator
             * - joined player
             *
             * A completely unrelated user does not get a card status.
             */

            if (
                currentUserScore ===
                undefined
            ) {
                challengeStatuses[
                    challenge.id
                ] = {
                    status:
                        "your_turn",
                    score:
                        null,
                    leaderScore:
                        players.size >
                        0
                            ? Math.max(
                                ...Array.from(
                                    players.values()
                                )
                            )
                            : null,
                    rank:
                        null,
                    pointsBehind:
                        0,
                };

                continue;
            }

            /*
             * --------------------------------------------------------
             * LEADER INFORMATION
             * --------------------------------------------------------
             */

            const scoresList =
                Array.from(
                    players.values()
                );

            const leaderScore =
                scoresList.length >
                0
                    ? Math.max(
                        ...scoresList
                    )
                    : currentUserScore;

            const playersAtLeader =
                scoresList.filter(
                    (score) =>
                        score ===
                        leaderScore
                ).length;

            const rank =
                1 +
                scoresList.filter(
                    (score) =>
                        score >
                        currentUserScore
                ).length;

            const pointsBehind =
                Math.max(
                    0,
                    leaderScore -
                        currentUserScore
                );

            /*
             * --------------------------------------------------------
             * CURRENT USER IS LEADING
             * --------------------------------------------------------
             */

            if (
                currentUserScore ===
                    leaderScore &&
                playersAtLeader ===
                    1
            ) {
                challengeStatuses[
                    challenge.id
                ] = {
                    status:
                        "leading",
                    score:
                        currentUserScore,
                    leaderScore,
                    rank,
                    pointsBehind: 0,
                };

                continue;
            }

            /*
             * --------------------------------------------------------
             * CURRENT USER IS TIED
             * --------------------------------------------------------
             */

            if (
                currentUserScore ===
                    leaderScore &&
                playersAtLeader >
                    1
            ) {
                challengeStatuses[
                    challenge.id
                ] = {
                    status:
                        "tied",
                    score:
                        currentUserScore,
                    leaderScore,
                    rank,
                    pointsBehind: 0,
                };

                continue;
            }

            /*
             * --------------------------------------------------------
             * CURRENT USER IS BEHIND
             * --------------------------------------------------------
             */

            const isCreator =
                challenge.creator_id ===
                user.id;

            /*
             * RECLAIM is ONLY for the creator.
             */
            if (
                isCreator
            ) {
                reclaimChallengeIds.add(
                    challenge.id
                );

                challengeStatuses[
                    challenge.id
                ] = {
                    status:
                        "reclaim",
                    score:
                        currentUserScore,
                    leaderScore,
                    rank,
                    pointsBehind,
                };
            } else {
                challengeStatuses[
                    challenge.id
                ] = {
                    status:
                        "behind",
                    score:
                        currentUserScore,
                    leaderScore,
                    rank,
                    pointsBehind,
                };
            }
        }

        return NextResponse.json(
            {
                reclaimChallengeIds:
                    Array.from(
                        reclaimChallengeIds
                    ),

                challengeStatuses,
            },
            {
                status: 200,
                headers: {
                    "Cache-Control":
                        "private, no-store",
                },
            }
        );
    } catch (error) {
        console.error(
            "Challenge status API error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    "Unable to calculate challenge status.",
            },
            {
                status: 500,
            }
        );
    }
}