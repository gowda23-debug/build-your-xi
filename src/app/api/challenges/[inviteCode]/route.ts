import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Challenge = {
    id: string;
    creator_id: string;
    title: string;
    game_mode: "ipl" | "world";
    invite_code: string;
    status: string;
    created_at: string;
    updated_at: string;
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
         * Challenge participation requires a registered account.
         */
        if (user.is_anonymous) {
            return NextResponse.json(
                {
                    error:
                        "Registered authentication is required for challenges.",
                },
                {
                    status: 403,
                }
            );
        }

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
         * Use the admin client here.
         *
         * This is intentional:
         * the invite code is the access mechanism for the challenge
         * page, so an invited player must be able to resolve the
         * challenge before they become a challenge member.
         *
         * We do NOT weaken the challenges table RLS policy.
         */

        const {
            data: challenge,
            error: challengeError,
        } = await supabaseAdmin
            .from("challenges")
            .select(
                "id, creator_id, title, game_mode, invite_code, status, created_at, updated_at"
            )
            .eq(
                "invite_code",
                normalizedInviteCode
            )
            .maybeSingle();

        if (challengeError) {
            console.error(
                "Challenge lookup error:",
                challengeError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to load the challenge.",
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
                        "No challenge was found with this invite code.",
                },
                {
                    status: 404,
                }
            );
        }

        /*
         * ============================================================
         * JOIN CHALLENGE
         * ============================================================
         *
         * The creator is normally already a member.
         *
         * For an invited registered player, add them here.
         *
         * This is done server-side so the operation does not depend
         * on client-side RLS INSERT permissions.
         */

        const {
            data: existingPlayer,
            error: existingPlayerError,
        } = await supabaseAdmin
            .from("challenge_players")
            .select("challenge_id")
            .eq(
                "challenge_id",
                challenge.id
            )
            .eq(
                "user_id",
                user.id
            )
            .maybeSingle();

        if (existingPlayerError) {
            console.error(
                "Challenge membership lookup error:",
                existingPlayerError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to verify challenge membership.",
                },
                {
                    status: 500,
                }
            );
        }

        if (!existingPlayer) {
            const {
                error: joinError,
            } = await supabaseAdmin
                .from("challenge_players")
                .insert({
                    challenge_id:
                        challenge.id,
                    user_id:
                        user.id,
                });

            if (joinError) {
                /*
                 * If the row was inserted by a concurrent request,
                 * verify membership one more time before failing.
                 */

                const {
                    data: concurrentPlayer,
                    error:
                        concurrentCheckError,
                } = await supabaseAdmin
                    .from("challenge_players")
                    .select(
                        "challenge_id"
                    )
                    .eq(
                        "challenge_id",
                        challenge.id
                    )
                    .eq(
                        "user_id",
                        user.id
                    )
                    .maybeSingle();

                if (
                    concurrentCheckError ||
                    !concurrentPlayer
                ) {
                    console.error(
                        "Challenge membership insert error:",
                        joinError
                    );

                    return NextResponse.json(
                        {
                            error:
                                "Unable to join the challenge.",
                        },
                        {
                            status: 500,
                        }
                    );
                }
            }
        }

        /*
         * ============================================================
         * PLAYER COUNT
         * ============================================================
         */

        const {
            count: playerCount,
            error: playerCountError,
        } = await supabaseAdmin
            .from("challenge_players")
            .select(
                "*",
                {
                    count: "exact",
                    head: true,
                }
            )
            .eq(
                "challenge_id",
                challenge.id
            );

        if (playerCountError) {
            console.error(
                "Challenge player count error:",
                playerCountError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to load challenge players.",
                },
                {
                    status: 500
                }
            );
        }

        return NextResponse.json(
            {
                challenge:
                    challenge as Challenge,

                playerCount:
                    playerCount ?? 0,
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
            "Challenge access endpoint error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    "Something went wrong while loading the challenge.",
            },
            {
                status: 500,
            }
        );
    }
}