import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
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

type AuthState =
    | "logged_out"
    | "guest"
    | "registered";

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
         * OPTIONAL AUTHENTICATION
         * ============================================================
         *
         * Viewing a challenge is public.
         *
         * We only use the authenticated user, when available, to:
         *
         * - identify the visitor
         * - automatically join registered users
         *
         * Guests are deliberately NOT added to challenge_players.
         */

        let user:
            | {
                id: string;
                is_anonymous?: boolean;
            }
            | null = null;

        let authState: AuthState =
            "logged_out";

        try {
            const supabase =
                await createClient();

            const {
                data: {
                    user: authenticatedUser,
                },
                error: authError,
            } =
                await supabase.auth.getUser();

            if (
                !authError &&
                authenticatedUser
            ) {
                user = authenticatedUser;

                authState =
                    authenticatedUser.is_anonymous
                        ? "guest"
                        : "registered";
            }
        } catch (authError) {
            /*
             * A missing/invalid browser session must not prevent
             * somebody from viewing a public challenge.
             *
             * The visitor simply remains logged out.
             */
            console.warn(
                "Optional challenge authentication unavailable:",
                authError
            );
        }

        /*
         * ============================================================
         * LOAD CHALLENGE
         * ============================================================
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
                        "This challenge is no longer available.",
                    code:
                        "CHALLENGE_NOT_FOUND",
                },
                {
                    status: 404,
                }
            );
        }

        /*
         * ============================================================
         * JOIN REGISTERED USER
         * ============================================================
         *
         * Registered users become challenge members automatically.
         *
         * Guests and logged-out visitors only view the challenge.
         */

        if (
            user &&
            !user.is_anonymous
        ) {
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
                     * A concurrent request may have inserted the
                     * membership already. Verify before failing.
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
        }

        /*
         * ============================================================
         * PLAYER COUNT
         * ============================================================
         *
         * This counts registered challenge members only.
         * Anonymous guests are intentionally not members.
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
                "Challenge player count error:",
                playerCountError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to load challenge players.",
                },
                {
                    status: 500,
                }
            );
        }

        return NextResponse.json(
            {
                challenge:
                    challenge as Challenge,

                playerCount:
                    playerCount ?? 0,

                authState,
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