import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RequestBody = {
    challengeId?: string;
};

export async function DELETE(
    request: Request
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

        if (user.is_anonymous) {
            return NextResponse.json(
                {
                    error:
                        "Registered authentication is required to delete a challenge.",
                },
                {
                    status: 403,
                }
            );
        }

        const body =
            (await request
                .json()
                .catch(() => ({}))) as RequestBody;

        const challengeId =
            typeof body.challengeId === "string"
                ? body.challengeId.trim()
                : "";

        if (!challengeId) {
            return NextResponse.json(
                {
                    error:
                        "challengeId is required.",
                },
                {
                    status: 400,
                }
            );
        }

        /*
         * ------------------------------------------------------------
         * VERIFY CREATOR
         * ------------------------------------------------------------
         */

        const {
            data: challenge,
            error: challengeError,
        } = await supabaseAdmin
            .from("challenges")
            .select(
                "id, creator_id"
            )
            .eq(
                "id",
                challengeId
            )
            .maybeSingle();

        if (challengeError) {
            console.error(
                "Delete challenge lookup error:",
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

        if (
            challenge.creator_id !==
            user.id
        ) {
            return NextResponse.json(
                {
                    error:
                        "Only the challenge creator can delete this challenge.",
                },
                {
                    status: 403,
                }
            );
        }

        /*
         * ------------------------------------------------------------
         * DELETE CHILD RECORDS
         * ------------------------------------------------------------
         *
         * We explicitly remove challenge scores and players instead
         * of assuming database cascade rules that we have not verified.
         */

        const {
            error: scoresDeleteError,
        } = await supabaseAdmin
            .from("challenge_scores")
            .delete()
            .eq(
                "challenge_id",
                challengeId
            );

        if (scoresDeleteError) {
            console.error(
                "Delete challenge scores error:",
                scoresDeleteError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to delete challenge scores.",
                },
                {
                    status: 500,
                }
            );
        }

        const {
            error: playersDeleteError,
        } = await supabaseAdmin
            .from("challenge_players")
            .delete()
            .eq(
                "challenge_id",
                challengeId
            );

        if (playersDeleteError) {
            console.error(
                "Delete challenge players error:",
                playersDeleteError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to delete challenge players.",
                },
                {
                    status: 500,
                }
            );
        }

        /*
         * ------------------------------------------------------------
         * DELETE CHALLENGE
         * ------------------------------------------------------------
         */

        const {
            error: deleteError,
        } = await supabaseAdmin
            .from("challenges")
            .delete()
            .eq(
                "id",
                challengeId
            )
            .eq(
                "creator_id",
                user.id
            );

        if (deleteError) {
            console.error(
                "Delete challenge error:",
                deleteError
            );

            return NextResponse.json(
                {
                    error:
                        "Unable to delete the challenge.",
                },
                {
                    status: 500,
                }
            );
        }

        return NextResponse.json(
            {
                success: true,
            },
            {
                status: 200,
            }
        );
    } catch (error) {
        console.error(
            "Delete challenge endpoint error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    "Something went wrong while deleting the challenge.",
            },
            {
                status: 500,
            }
        );
    }
}