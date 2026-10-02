import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type GameMode =
    | "ipl"
    | "world";

type ProfileRow = {
    id: string;
    display_name: string | null;
    gamer_tag: string | null;
};

type StoredResult = {
    score?: number;

    wins?: number;
    losses?: number;

    teamStrength?: number;

    venue?: {
        id?: string;
        name?: string | null;
        city?: string | null;
        country?: string | null;
    };

    pitch?: {
        id?: string;
        title?: string;
        type?: string;
        summary?: string;
    };

    breakdown?: {
        batting?: number;
        bowling?: number;
        balance?: number;
        conditions?: number;
    };

    matches?: number;

    [key: string]: unknown;
};

type GameScoreRow = {
    id: string;
    game_mode: string;
    score: number | string;
    created_at: string;
    result: StoredResult | null;
};

type RecentGame = {
    id: string;
    gameType:
    | "IPL Challenge"
    | "World Domination";
    score: number;
    record: string;
    date: string;
    details: string[];
};

function getGameType(
    gameMode: string
):
    | "IPL Challenge"
    | "World Domination" {
    if (gameMode === "world") {
        return "World Domination";
    }

    return "IPL Challenge";
}

function getRecord(
    result: StoredResult | null
): string {
    if (
        typeof result?.wins !==
        "number" ||
        typeof result?.losses !==
        "number"
    ) {
        return "—";
    }

    return `${result.wins}-${result.losses}`;
}

function getAuthoritativeScore(
    row: GameScoreRow
): number | null {
    /*
     * The IPL scoring engine has a hard maximum of 100.
     *
     * Only a valid server-generated result.score is allowed
     * to contribute to player statistics.
     */

    const resultScore =
        Number(row.result?.score);

    if (
        Number.isFinite(resultScore) &&
        resultScore >= 0 &&
        resultScore <= 100
    ) {
        return resultScore;
    }

    /*
     * Never use an invalid legacy/top-level score.
     */

    return null;
}

function getDetails(
    row: GameScoreRow
): string[] {
    const result =
        row.result;

    if (!result) {
        return [];
    }

    const details: string[] =
        [];

    const record =
        getRecord(result);

    if (record !== "—") {
        details.push(
            `Record: ${record}`
        );
    }

    if (
        result.venue?.name
    ) {
        const location =
            [
                result.venue.city,
                result.venue.country,
            ]
                .filter(Boolean)
                .join(", ");

        details.push(
            location
                ? `Venue: ${result.venue.name}, ${location}`
                : `Venue: ${result.venue.name}`
        );
    }

    if (
        result.pitch?.title
    ) {
        details.push(
            `Pitch: ${result.pitch.title}`
        );
    }

    if (
        typeof result.teamStrength ===
        "number"
    ) {
        details.push(
            `Team Strength: ${result.teamStrength}`
        );
    }

    if (
        result.breakdown &&
        typeof result.breakdown.batting ===
        "number"
    ) {
        details.push(
            `Batting: ${result.breakdown.batting}`
        );
    }

    if (
        result.breakdown &&
        typeof result.breakdown.bowling ===
        "number"
    ) {
        details.push(
            `Bowling: ${result.breakdown.bowling}`
        );
    }

    if (
        result.breakdown &&
        typeof result.breakdown.balance ===
        "number"
    ) {
        details.push(
            `Balance: ${result.breakdown.balance}`
        );
    }

    if (
        result.breakdown &&
        typeof result.breakdown.conditions ===
        "number"
    ) {
        details.push(
            `Conditions: ${result.breakdown.conditions}`
        );
    }

    if (
        typeof result.matches ===
        "number"
    ) {
        details.push(
            `Matches: ${result.matches}`
        );
    }

    return details;
}

async function loadPlayerScores(
    userId: string
): Promise<GameScoreRow[]> {
    const rows: GameScoreRow[] =
        [];

    const PAGE_SIZE = 1000;

    let from = 0;

    while (true) {
        const {
            data,
            error,
        } = await supabaseAdmin
            .from("game_scores")
            .select(
                `
        id,
        game_mode,
        score,
        created_at,
        result
      `
            )
            .eq(
                "user_id",
                userId
            )
            .order(
                "created_at",
                {
                    ascending: false,
                }
            )
            .range(
                from,
                from + PAGE_SIZE - 1
            );

        if (error) {
            throw error;
        }

        const page =
            (data ??
                []) as GameScoreRow[];

        rows.push(...page);

        if (
            page.length <
            PAGE_SIZE
        ) {
            break;
        }

        from += PAGE_SIZE;
    }

    return rows;
}

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
         * ============================================================
         * GUEST
         * ============================================================
         *
         * Guest games are intentionally not persisted by the
         * authoritative completion flow.
         */

        if (user.is_anonymous) {
            return NextResponse.json(
                {
                    player: {
                        id: user.id,
                        displayName:
                            "Guest Player",
                        gamerTag:
                            `GUEST-${user.id
                                .slice(0, 6)
                                .toUpperCase()}`,
                        isGuest: true,
                    },

                    stats: {
                        gamesPlayed: 0,
                        bestScore: null,
                        bestRecord: null,
                    },

                    recentGames: [],
                },
                {
                    headers: {
                        "Cache-Control":
                            "private, no-store",
                    },
                }
            );
        }

        /*
         * ============================================================
         * LOAD PROFILE
         * ============================================================
         */

        const {
            data: profileData,
            error: profileError,
        } = await supabaseAdmin
            .from("profiles")
            .select(
                `
        id,
        display_name,
        gamer_tag
      `
            )
            .eq(
                "id",
                user.id
            )
            .maybeSingle();

        if (profileError) {
            throw profileError;
        }

        const profile =
            profileData as
            | ProfileRow
            | null;

        /*
         * ============================================================
         * LOAD AUTHORITATIVE GAME SCORES
         * ============================================================
         */

        const gameScores =
            await loadPlayerScores(
                user.id
            );

        /*
         * ============================================================
         * BASIC STATISTICS
         * ============================================================
         */

        const validGames =
            gameScores.filter(
                (row) =>
                    getAuthoritativeScore(row) !==
                    null
            );

        const validScores =
            validGames
                .map(getAuthoritativeScore)
                .filter(
                    (
                        score
                    ): score is number =>
                        score !== null
                );

        const gamesPlayed =
            validGames.length;

        const bestScore =
            validScores.length > 0
                ? Math.max(
                    ...validScores
                )
                : null;

        /*
         * ============================================================
         * BEST RECORD
         * ============================================================
         *
         * Record is compared using:
         *
         * 1. Most wins
         * 2. Fewest losses
         * 3. Highest score
         *
         * This gives us a deterministic all-time record.
         */

        const recordCandidates =
            gameScores
                .map((row) => {
                    const result =
                        row.result;

                    if (
                        typeof result?.wins !==
                        "number" ||
                        typeof result?.losses !==
                        "number"
                    ) {
                        return null;
                    }

                    return {
                        wins:
                            result.wins,

                        losses:
                            result.losses,

                        score:
                            getAuthoritativeScore(row) ?? 0,
                        createdAt:
                            row.created_at,
                    };
                })
                .filter(
                    (
                        value
                    ): value is {
                        wins: number;
                        losses: number;
                        score: number;
                        createdAt: string;
                    } =>
                        value !== null &&
                        Number.isFinite(
                            value.score
                        )
                );

        recordCandidates.sort(
            (a, b) => {
                if (
                    b.wins !==
                    a.wins
                ) {
                    return (
                        b.wins -
                        a.wins
                    );
                }

                if (
                    a.losses !==
                    b.losses
                ) {
                    return (
                        a.losses -
                        b.losses
                    );
                }

                if (
                    b.score !==
                    a.score
                ) {
                    return (
                        b.score -
                        a.score
                    );
                }

                return (
                    new Date(
                        b.createdAt
                    ).getTime() -
                    new Date(
                        a.createdAt
                    ).getTime()
                );
            }
        );

        const bestRecord =
            recordCandidates.length >
                0
                ? `${recordCandidates[0].wins}-${recordCandidates[0].losses}`
                : null;

        /*
         * ============================================================
         * RECENT 10 GAMES
         * ============================================================
         */

        const recentGames =
            validGames
                .slice(0, 10)
                .map(
                    (
                        row
                    ): RecentGame => ({
                        id: row.id,

                        gameType:
                            getGameType(
                                row.game_mode
                            ),

                        score:
                            getAuthoritativeScore(row)!,

                        record:
                            getRecord(
                                row.result
                            ),

                        date:
                            row.created_at,

                        details:
                            getDetails(row),
                    })
                );

        return NextResponse.json(
            {
                player: {
                    id: user.id,

                    displayName:
                        profile?.display_name ||
                        user.user_metadata
                            ?.display_name ||
                        "Player",

                    gamerTag:
                        profile?.gamer_tag ||
                        user.user_metadata
                            ?.gamer_tag ||
                        "",

                    isGuest: false,
                },

                stats: {
                    gamesPlayed,

                    bestScore,

                    bestRecord,
                },

                recentGames,
            },
            {
                headers: {
                    "Cache-Control":
                        "private, no-store",
                },
            }
        );
    } catch (error) {
        console.error(
            "Stats API error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    "Unable to load your statistics.",
            },
            {
                status: 500,
            }
        );
    }
}