import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type LeaderboardScore = {
    user_id: string;
    score: number;
    created_at: string;
};

type Profile = {
    id: string;
    gamer_tag: string | null;
    display_name: string | null;
};

type LeaderboardEntry = {
    user_id: string;
    gamer_tag: string;
    display_name: string;
    score: number;
    created_at: string;
};

export async function GET(
    request: Request,
    context: {
        params: Promise<{
            inviteCode: string;
        }>;
    }
) {
    try {
        const {
            inviteCode,
        } = await context.params;

        const normalizedInviteCode =
            typeof inviteCode === "string"
                ? inviteCode.trim()
                : "";

        if (!normalizedInviteCode) {
            return NextResponse.json(
                {
                    error:
                        "Invite code is required.",
                },
                {
                    status: 400,
                }
            );
        }

        /*
         * ============================================================
         * LOAD CHALLENGE
         * ============================================================
         *
         * Leaderboards are intentionally public because the challenge
         * link itself is shareable.
         */

        const {
            data: challenge,
            error: challengeError,
        } = await supabaseAdmin
            .from("challenges")
            .select(
                "id, creator_id, title, game_mode, invite_code, status"
            )
            .eq(
                "invite_code",
                normalizedInviteCode
            )
            .maybeSingle();

        if (challengeError) {
            console.error(
                "Leaderboard challenge lookup error:",
                challengeError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to verify the challenge.",
                },
                {
                    status: 500,
                }
            );
        }

        if (!challenge) {
            return NextResponse.json(
                {
                    error:
                        "Challenge not found.",
                },
                {
                    status: 404,
                }
            );
        }

        /*
         * ============================================================
         * PLAYER COUNT
         * ============================================================
         *
         * Only registered challenge members are counted.
         */

        const {
            count: playerCount,
            error: playerCountError,
        } = await supabaseAdmin
            .from("challenge_players")
            .select("*", {
                count: "exact",
                head: true,
            })
            .eq(
                "challenge_id",
                challenge.id
            );

        if (playerCountError) {
            console.error(
                "Leaderboard player count error:",
                playerCountError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to load challenge player count.",
                },
                {
                    status: 500,
                }
            );
        }

        /*
         * ============================================================
         * LOAD SCORES
         * ============================================================
         */

        const {
            data: scoreData,
            error: scoreError,
        } = await supabaseAdmin
            .from("challenge_scores")
            .select(
                "user_id, score, created_at"
            )
            .eq(
                "challenge_id",
                challenge.id
            )
            .order(
                "score",
                {
                    ascending: false,
                }
            )
            .order(
                "created_at",
                {
                    ascending: true,
                }
            );

        if (scoreError) {
            console.error(
                "Leaderboard score query error:",
                scoreError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to load the challenge leaderboard.",
                },
                {
                    status: 500,
                }
            );
        }

        const scores =
            (scoreData ??
                []) as LeaderboardScore[];

        /*
         * ============================================================
         * LOAD PLAYER PROFILES
         * ============================================================
         *
         * Only the public fields needed by the leaderboard are exposed.
         */

        const userIds = [
            ...new Set(
                scores.map(
                    (entry) =>
                        entry.user_id
                )
            ),
        ];

        const profilesById =
            new Map<
                string,
                Profile
            >();

        if (userIds.length > 0) {
            const {
                data: profileData,
                error: profileError,
            } = await supabaseAdmin
                .from("profiles")
                .select(
                    "id, gamer_tag, display_name"
                )
                .in(
                    "id",
                    userIds
                );

            if (profileError) {
                console.error(
                    "Leaderboard profile query error:",
                    profileError
                );

                return NextResponse.json(
                    {
                        error:
                            "Unable to load player profiles.",
                    },
                    {
                        status: 500,
                    }
                );
            }

            for (
                const profile of
                profileData ?? []
            ) {
                profilesById.set(
                    profile.id,
                    profile as Profile
                );
            }
        }

        /*
         * ============================================================
         * BUILD SAFE RESPONSE
         * ============================================================
         */

        const leaderboard: LeaderboardEntry[] =
            scores.map(
                (entry) => {
                    const profile =
                        profilesById.get(
                            entry.user_id
                        );

                    return {
                        user_id:
                            entry.user_id,

                        gamer_tag:
                            profile?.gamer_tag?.trim() ||
                            profile?.display_name?.trim() ||
                            "PLAYER",

                        display_name:
                            profile?.display_name?.trim() ||
                            profile?.gamer_tag?.trim() ||
                            "PLAYER",

                        score:
                            Number(
                                entry.score
                            ),

                        created_at:
                            entry.created_at,
                    };
                }
            );

        /*
         * ============================================================
         * CREATOR STATUS
         * ============================================================
         */

        const creatorEntry =
            leaderboard.find(
                (entry) =>
                    entry.user_id ===
                    challenge.creator_id
            );

        const highestOpponentScore =
            leaderboard
                .filter(
                    (entry) =>
                        entry.user_id !==
                        challenge.creator_id
                )
                .reduce<number | null>(
                    (
                        highest,
                        entry
                    ) => {
                        if (
                            highest ===
                                null ||
                            entry.score >
                                highest
                        ) {
                            return entry.score;
                        }

                        return highest;
                    },
                    null
                );

        const creatorHasBeenBeaten =
            creatorEntry !==
                undefined &&
            highestOpponentScore !==
                null &&
            highestOpponentScore >
                creatorEntry.score;

        const reclaimScore =
            creatorHasBeenBeaten
                ? highestOpponentScore
                : null;

        return NextResponse.json(
            {
                challenge: {
                    id:
                        challenge.id,

                    creatorId:
                        challenge.creator_id,

                    title:
                        challenge.title,

                    gameMode:
                        challenge.game_mode,
                },

                playerCount:
                    playerCount ?? 0,

                leaderboard,

                creatorHasBeenBeaten,

                reclaimScore,
            },
            {
                status: 200,
                headers: {
                    "Cache-Control":
                        "no-store",
                },
            }
        );
    } catch (error) {
        console.error(
            "Challenge leaderboard endpoint error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    "Something went wrong while loading the challenge leaderboard.",
            },
            {
                status: 500,
            }
        );
    }
}