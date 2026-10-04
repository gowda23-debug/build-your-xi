import type {
    WorldPlayer,
} from "@/types/world";

export type WorldScoreBreakdown = {
    batting: number;
    bowling: number;
    balance: number;
    experience: number;
};

export type WorldMatchResult = {
    match: number;
    opponentStrength: number;
    winProbability: number;
    result: "W" | "L";
};

export type WorldEngineResult = {
    score: number;
    teamStrength: number;
    breakdown: WorldScoreBreakdown;
    wins: number;
    losses: number;
    matches: WorldMatchResult[];
};

const SCORE_MAX = 100;

const MATCHES = 10;

const clamp = (
    value: number,
    min = 0,
    max = 1
) =>
    Math.min(
        max,
        Math.max(
            min,
            value
        )
    );

const normalize = (
    value: number,
    low: number,
    high: number
) =>
    clamp(
        (value - low) /
        (high - low)
    );

const inverseNormalize = (
    value: number,
    best: number,
    worst: number
) =>
    clamp(
        (worst - value) /
        (worst - best)
    );

function battingQuality(
    player: WorldPlayer
) {
    const average =
        player.stats
            .battingAverage;

    const strikeRate =
        player.stats
            .strikeRate;

    const runsPerMatch =
        player.stats.matches >
            0
            ? player.stats.runs /
            player.stats.matches
            : 0;

    const averageScore =
        average === null
            ? 0
            : normalize(
                average,
                15,
                60
            );

    const strikeRateScore =
        strikeRate === null
            ? 0
            : normalize(
                strikeRate,
                45,
                110
            );

    const volumeScore =
        normalize(
            runsPerMatch,
            15,
            60
        );

    const hundredScore =
        normalize(
            player.stats.hundreds,
            0,
            5
        );

    const roleWeight =
        player.role ===
            "BAT"
            ? 1
            : player.role ===
                "WK"
                ? 0.96
                : player.role ===
                    "AR"
                    ? 0.9
                    : 0.25;

    return (
        (
            averageScore *
            0.35 +
            strikeRateScore *
            0.25 +
            volumeScore *
            0.25 +
            hundredScore *
            0.15
        ) *
        roleWeight
    );
}

function bowlingQuality(
    player: WorldPlayer
) {
    const wicketsPerMatch =
        player.stats.matches >
            0
            ? player.stats.wickets /
            player.stats.matches
            : 0;

    const average =
        player.stats
            .bowlingAverage;

    const economy =
        player.stats
            .economy;

    const wicketsScore =
        normalize(
            wicketsPerMatch,
            0.3,
            3
        );

    const averageScore =
        average === null
            ? 0
            : inverseNormalize(
                average,
                18,
                40
            );

    const economyScore =
        economy === null
            ? 0
            : inverseNormalize(
                economy,
                4.5,
                8
            );

    const roleWeight =
        player.role ===
            "BOWL"
            ? 1
            : player.role ===
                "AR"
                ? 0.9
                : 0.1;

    return (
        (
            wicketsScore *
            0.45 +
            averageScore *
            0.3 +
            economyScore *
            0.25
        ) *
        roleWeight
    );
}

function averageTop(
    values: number[],
    count: number
) {
    const sorted =
        [...values]
            .sort(
                (a, b) =>
                    b - a
            )
            .slice(
                0,
                count
            );

    if (
        sorted.length ===
        0
    ) {
        return 0;
    }

    return (
        sorted.reduce(
            (
                sum,
                value
            ) =>
                sum + value,
            0
        ) /
        sorted.length
    );
}

function calculateBatting(
    players: WorldPlayer[]
) {
    return Math.round(
        averageTop(
            players.map(
                battingQuality
            ),
            7
        ) * 35
    );
}

function calculateBowling(
    players: WorldPlayer[]
) {
    return Math.round(
        averageTop(
            players.map(
                bowlingQuality
            ),
            5
        ) * 35
    );
}

function calculateBalance(
    players: WorldPlayer[]
) {
    const counts = {
        WK: players.filter(
            (p) =>
                p.role ===
                "WK"
        ).length,

        BAT: players.filter(
            (p) =>
                p.role ===
                "BAT"
        ).length,

        AR: players.filter(
            (p) =>
                p.role ===
                "AR"
        ).length,

        BOWL: players.filter(
            (p) =>
                p.role ===
                "BOWL"
        ).length,
    };

    if (
        players.length !==
        11
    ) {
        return 0;
    }

    const bowlingOptions =
        counts.AR +
        counts.BOWL;

    const battingDepth =
        clamp(
            (
                counts.WK +
                counts.BAT +
                counts.AR -
                6
            ) / 3
        );

    const bowlingDepth =
        clamp(
            (
                bowlingOptions -
                5
            ) / 2
        );

    const validStructure =
        counts.WK >= 1 &&
        counts.BAT >= 4 &&
        counts.AR >= 1 &&
        counts.BOWL >= 3 &&
        counts.AR + counts.BOWL >= 5;

    return Math.round(
        (
            battingDepth *
            0.35 +
            bowlingDepth *
            0.35 +
            (validStructure
                ? 1
                : 0) *
            0.3
        ) * 15
    );
}

function calculateExperience(
    players: WorldPlayer[]
) {
    const averageMatches =
        players.reduce(
            (
                total,
                player
            ) =>
                total +
                player.stats.matches,
            0
        ) /
        players.length;

    return Math.round(
        normalize(
            averageMatches,
            3,
            25
        ) * 15
    );
}

function hashString(
    value: string
) {
    let hash =
        2166136261;

    for (
        let index = 0;
        index <
        value.length;
        index += 1
    ) {
        hash ^=
            value.charCodeAt(
                index
            );

        hash =
            Math.imul(
                hash,
                16777619
            );
    }

    return (
        hash >>> 0
    );
}

function seededRandom(
    seed: number
) {
    let state =
        seed >>> 0;

    return () => {
        state +=
            0x6D2B79F5;

        let t =
            state;

        t =
            Math.imul(
                t ^
                (t >>> 15),
                t | 1
            );

        t ^=
            t +
            Math.imul(
                t ^
                (t >>> 7),
                t | 61
            );

        return (
            (
                t ^
                (t >>> 14)
            ) >>>
            0
        ) /
            4294967296;
    };
}

function simulateMatches(
    teamStrength: number,
    players: WorldPlayer[],
    seed: string
) {
    const random =
        seededRandom(
            hashString(
                [
                    seed,
                    ...players
                        .map(
                            (p) =>
                                p.id
                        )
                        .sort(),
                ].join("|")
            )
        );

    return Array.from(
        {
            length:
                MATCHES,
        },
        (_, index) => {
            const opponentStrength =
                55 +
                (
                    index *
                    7
                ) %
                30;

            const probability =
                clamp(
                    1 /
                    (
                        1 +
                        Math.exp(
                            -(
                                teamStrength -
                                opponentStrength +
                                2
                            ) /
                            8
                        )
                    ),
                    0.03,
                    0.97
                );

            return {
                match:
                    index + 1,

                opponentStrength,

                winProbability:
                    Number(
                        probability.toFixed(
                            3
                        )
                    ),

                result:
                    (random() <
                        probability
                        ? "W"
                        : "L") as "W" | "L",
            };
        }
    );
}

export function evaluateWorldXI(
    players: WorldPlayer[],
    seed: string
): WorldEngineResult {
    const batting =
        calculateBatting(
            players
        );

    const bowling =
        calculateBowling(
            players
        );

    const balance =
        calculateBalance(
            players
        );

    const experience =
        calculateExperience(
            players
        );

    const score =
        Math.min(
            SCORE_MAX,
            Math.max(
                0,
                batting +
                bowling +
                balance +
                experience
            )
        );

    const matches =
        simulateMatches(
            score,
            players,
            seed
        );

    const wins =
        matches.filter(
            (match) =>
                match.result ===
                "W"
        ).length;

    return {
        score,

        teamStrength:
            score,

        breakdown: {
            batting,
            bowling,
            balance,
            experience,
        },

        wins,

        losses:
            matches.length -
            wins,

        matches,
    };
}