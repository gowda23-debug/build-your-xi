import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ChallengeRow = {
    id: string;
};

type ChallengeScoreRow = {
    challenge_id: string;
    user_id: string;
    score: number | string;
};

export async function GET() {
    try {
        /*
         * ============================================================
         * AUTHENTICATION
         * ============================================================
         *
         * Only a registered player can have created challenges.
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
                        error:
                            "Unauthorized",
                    },
                    {
                        status: 401,
                    }
                )
            );
        }

        /*
         * Guests cannot own usable challenge lists.
         */
        if (user.is_anonymous) {
            return NextResponse.json(
                {
                    reclaimChallengeIds: [],
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
         * LOAD CHALLENGES CREATED BY CURRENT USER
         * ============================================================
         *
         * Do this server-side with the admin client.
         * This avoids depending on client-side RLS visibility
         * for challenge_scores.
         */

        const {
            data: challengeData,
            error: challengeError,
        } = await supabaseAdmin
            .from("challenges")
            .select("id")
            .eq(
                "creator_id",
                user.id
            );

        if (challengeError) {
            console.error(
                "Reclaim challenge lookup error:",
                challengeError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to load your challenges.",
                },
                {
                    status: 500,
                }
            );
        }

        const challenges =
            (challengeData ??
                []) as ChallengeRow[];

        if (
            challenges.length ===
            0
        ) {
            return NextResponse.json(
                {
                    reclaimChallengeIds: [],
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

        const challengeIds =
            challenges.map(
                (
                    challenge
                ) =>
                    challenge.id
            );

        /*
         * ============================================================
         * LOAD CHALLENGE SCORES
         * ============================================================
         *
         * Use the admin client instead of the browser client.
         *
         * This is the important part of the fix.
         */

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
                "Reclaim score lookup error:",
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
         * CALCULATE RECLAIM STATUS
         * ============================================================
         *
         * RECLAIM means:
         *
         *   creator has a score
         *   AND
         *   another player has a higher score
         *
         * Only the creator's own challenges are considered.
         */

        const scoresByChallenge =
            new Map<
                string,
                Map<string, number>
            >();

        for (
            const scoreRow of
                scores
        ) {
            const challengeId =
                String(
                    scoreRow.challenge_id
                );

            const userId =
                String(
                    scoreRow.user_id
                );

            const score =
                Number(
                    scoreRow.score
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

            /*
             * Be defensive about duplicates.
             * Keep the best score for each player.
             */
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

        const reclaimChallengeIds =
            new Set<string>();

        for (
            const challenge of
                challenges
        ) {
            const players =
                scoresByChallenge.get(
                    challenge.id
                );

            if (!players) {
                continue;
            }

            const creatorScore =
                players.get(
                    user.id
                );

            /*
             * Creator has not played yet.
             */
            if (
                creatorScore ===
                undefined
            ) {
                continue;
            }

            let highestOpponentScore =
                Number.NEGATIVE_INFINITY;

            players.forEach(
                (
                    score,
                    playerId
                ) => {
                    if (
                        playerId ===
                        user.id
                    ) {
                        return;
                    }

                    highestOpponentScore =
                        Math.max(
                            highestOpponentScore,
                            score
                        );
                }
            );

            if (
                highestOpponentScore >
                creatorScore
            ) {
                reclaimChallengeIds.add(
                    challenge.id
                );
            }
        }

        return NextResponse.json(
            {
                reclaimChallengeIds:
                    Array.from(
                        reclaimChallengeIds
                    ),
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
            "Reclaim status API error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    "Unable to calculate challenge reclaim status.",
            },
            {
                status: 500,
            }
        );
    }
}