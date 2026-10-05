import fs from "node:fs";
import path from "node:path";

import {
    WORLD_AVAILABLE_EDITIONS,
    getWorldEdition,
} from "./data/world/editions";

import {
    resolveWorldRoles,
    type WorldPlayerIdentity,
    type RoleEntry,
} from "./world-role-resolver";

type WorldRole =
    | "BAT"
    | "WK"
    | "AR"
    | "BOWL";

type RawDelivery = {
    batter: string;
    bowler: string;
    non_striker: string;

    runs: {
        batter: number;
        extras: number;
        total: number;
        non_boundary?: boolean;
    };

    extras?: Record<
        string,
        number
    >;

    wickets?: Array<{
        kind: string;
        player_out: string;
        fielders?: Array<{
            name: string;
        }>;
    }>;
};

type RawMatch = {
    info: {
        teams: string[];

        players: Record<
            string,
            string[]
        >;

        registry?: {
            people?: Record<
                string,
                string
            >;
        };

        dates?: string[];

        event?: {
            name?: string;
        };
    };

    innings?: Array<{
        team: string;

        overs?: Array<{
            deliveries?: RawDelivery[];
        }>;
    }>;
};

type RawFile = {
    source: {
        provider: string;
        url: string;
        archive: string;
        format: string;
    };

    year: number;
    seasonName: string;
    format: "ODI";
    competition:
    "ICC Men's Cricket World Cup";

    oversPerInnings:
    50 | 60;

    matches: RawMatch[];
};

type PlayerAccumulator = {
    fullName: string;
    sourcePlayerId: string;

    matches: Set<string>;
    battingInnings: Set<string>;

    runs: number;
    dismissals: number;

    ballsFaced: number;

    wickets: number;
    runsConceded: number;
    legalBallsBowled: number;

    catches: number;
    stumpings: number;

    fifties: number;
    hundreds: number;
};

type TeamAccumulator = {
    name: string;
    shortName: string;
    slug: string;

    players: Map<
        string,
        PlayerAccumulator
    >;
};

const ROOT =
    process.cwd();

const RAW_DIRECTORY =
    path.join(
        ROOT,
        "scripts",
        "data",
        "world",
        "raw"
    );

const PROCESSED_DIRECTORY =
    path.join(
        ROOT,
        "scripts",
        "data",
        "world",
        "processed"
    );

const REPORT_DIRECTORY =
    path.join(
        ROOT,
        "scripts",
        "data",
        "world"
    );

const ROLE_REPORT_PATH =
    path.join(
        REPORT_DIRECTORY,
        "role-resolution-report.json"
    );

function fail(
    message: string
): never {
    throw new Error(
        `[WORLD PROCESSING] ${message}`
    );
}

function ensureDirectory(
    directory: string
) {
    fs.mkdirSync(
        directory,
        {
            recursive: true,
        }
    );
}

function readRaw(
    year: number
): RawFile {
    const filePath =
        path.join(
            RAW_DIRECTORY,
            `${year}.json`
        );

    if (
        !fs.existsSync(
            filePath
        )
    ) {
        fail(
            `Missing raw source file: ${filePath}`
        );
    }

    const raw =
        fs.readFileSync(
            filePath,
            "utf8"
        );

    if (!raw.trim()) {
        fail(
            `${filePath} is empty.`
        );
    }

    let parsed: unknown;

    try {
        parsed =
            JSON.parse(raw);
    } catch (
    error
    ) {
        fail(
            `Invalid JSON in ${filePath}: ${error instanceof Error
                ? error.message
                : String(error)
            }`
        );
    }

    return parsed as RawFile;
}

function slugify(
    value: string
) {
    return value
        .toLowerCase()
        .replace(
            /[^a-z0-9]+/g,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            ""
        );
}

function shortName(
    value: string
) {
    const words =
        value
            .split(/\s+/)
            .filter(Boolean);

    if (
        words.length ===
        1
    ) {
        return words[0]
            .slice(0, 4)
            .toUpperCase();
    }

    return words
        .map(
            (word) =>
                word[0]
        )
        .join("")
        .slice(0, 4)
        .toUpperCase();
}

function findPlayer(
    team: TeamAccumulator,
    name: string
) {
    return [
        ...team.players.values(),
    ].find(
        (player) =>
            player.fullName ===
            name
    );
}

function addPlayer(
    team: TeamAccumulator,
    name: string,
    sourcePlayerId: string,
    matchId: string
) {
    const existing =
        team.players.get(
            sourcePlayerId
        );

    if (
        existing
    ) {
        existing.matches.add(
            matchId
        );

        return existing;
    }

    const player:
        PlayerAccumulator =
    {
        fullName:
            name,

        sourcePlayerId,

        matches:
            new Set([
                matchId,
            ]),

        battingInnings:
            new Set(),

        runs: 0,
        dismissals: 0,

        ballsFaced: 0,

        wickets: 0,
        runsConceded: 0,
        legalBallsBowled:
            0,

        catches: 0,
        stumpings: 0,

        fifties: 0,
        hundreds: 0,
    };

    team.players.set(
        sourcePlayerId,
        player
    );

    return player;
}

function processMatch(
    match: RawMatch,
    matchId: string,
    teams: Map<
        string,
        TeamAccumulator
    >
) {
    const registry =
        match.info.registry
            ?.people ?? {};

    for (
        const teamName of
        match.info.teams
    ) {
        const team =
            teams.get(
                teamName
            ) ??
            {
                name:
                    teamName,

                shortName:
                    shortName(
                        teamName
                    ),

                slug:
                    slugify(
                        teamName
                    ),

                players:
                    new Map(),
            };

        teams.set(
            teamName,
            team
        );

        for (
            const playerName of
            match.info.players[
            teamName
            ] ?? []
        ) {
            const sourcePlayerId =
                registry[
                playerName
                ];

            if (
                !sourcePlayerId
            ) {
                console.warn(
                    `[WORLD PROCESSING] Missing registry ID for ${playerName} in ${teamName}.`
                );

                continue;
            }

            addPlayer(
                team,
                playerName,
                sourcePlayerId,
                matchId
            );
        }
    }

    for (
        const innings of
        match.innings ?? []
    ) {
        const battingTeam =
            teams.get(
                innings.team
            );

        if (
            !battingTeam
        ) {
            continue;
        }

        const runsByPlayer =
            new Map<
                string,
                number
            >();

        for (
            const over of
            innings.overs ?? []
        ) {
            for (
                const delivery of
                over.deliveries ??
                []
            ) {
                const batter =
                    findPlayer(
                        battingTeam,
                        delivery.batter
                    );

                if (
                    batter
                ) {
                    batter.battingInnings.add(
                        matchId
                    );

                    batter.runs +=
                        delivery.runs
                            .batter;

                    const isWide =
                        Boolean(
                            delivery.extras
                                ?.wides
                        );

                    if (
                        !isWide
                    ) {
                        batter.ballsFaced +=
                            1;
                    }

                    runsByPlayer.set(
                        batter.fullName,
                        (
                            runsByPlayer.get(
                                batter.fullName
                            ) ?? 0
                        ) +
                        delivery.runs
                            .batter
                    );
                }

                const bowlingTeamName =
                    match.info.teams.find(
                        (teamName) =>
                            teamName !==
                            innings.team
                    );

                if (
                    !bowlingTeamName
                ) {
                    continue;
                }

                const bowlingTeam =
                    teams.get(
                        bowlingTeamName
                    );

                if (
                    !bowlingTeam
                ) {
                    continue;
                }

                const bowler =
                    findPlayer(
                        bowlingTeam,
                        delivery.bowler
                    );

                if (
                    !bowler
                ) {
                    continue;
                }

                const isWide =
                    Boolean(
                        delivery.extras
                            ?.wides
                    );

                const isNoBall =
                    Boolean(
                        delivery.extras
                            ?.noballs
                    );

                if (
                    !isWide &&
                    !isNoBall
                ) {
                    bowler.legalBallsBowled +=
                        1;
                }

                const byes =
                    delivery.extras
                        ?.byes ?? 0;

                const legByes =
                    delivery.extras
                        ?.legbyes ?? 0;

                const penalty =
                    delivery.extras
                        ?.penalty ?? 0;

                const bowlerRuns =
                    delivery.runs
                        .total -
                    byes -
                    legByes -
                    penalty;

                bowler.runsConceded +=
                    bowlerRuns;

                for (
                    const wicket of
                    delivery.wickets ??
                    []
                ) {
                    const creditedKinds =
                        new Set([
                            "bowled",
                            "caught",
                            "caught and bowled",
                            "lbw",
                            "stumped",
                            "hit wicket",
                        ]);

                    if (
                        creditedKinds.has(
                            wicket.kind
                        )
                    ) {
                        bowler.wickets +=
                            1;
                    }

                    if (
                        wicket.kind ===
                        "stumped"
                    ) {
                        const keeperName =
                            wicket
                                .fielders?.[0]
                                ?.name;

                        if (
                            keeperName
                        ) {
                            const keeper =
                                findPlayer(
                                    bowlingTeam,
                                    keeperName
                                );

                            if (
                                keeper
                            ) {
                                keeper.stumpings +=
                                    1;
                            }
                        }
                    }

                    if (
                        wicket.kind ===
                        "caught" ||
                        wicket.kind ===
                        "caught and bowled"
                    ) {
                        for (
                            const fielder of
                            wicket.fielders ??
                            []
                        ) {
                            const player =
                                findPlayer(
                                    bowlingTeam,
                                    fielder.name
                                );

                            if (
                                player
                            ) {
                                player.catches +=
                                    1;
                            }
                        }
                    }
                }
            }
        }

        for (
            const [
                playerName,
                runs,
            ] of runsByPlayer
        ) {
            const player =
                findPlayer(
                    battingTeam,
                    playerName
                );

            if (
                !player
            ) {
                continue;
            }

            if (
                runs >= 100
            ) {
                player.hundreds +=
                    1;
            } else if (
                runs >= 50
            ) {
                player.fifties +=
                    1;
            }
        }

        /*
         * Count dismissals for batting average.
         */
        for (
            const over of
            innings.overs ?? []
        ) {
            for (
                const delivery of
                over.deliveries ??
                []
            ) {
                for (
                    const wicket of
                    delivery.wickets ??
                    []
                ) {
                    if (
                        wicket.kind ===
                        "retired hurt" ||
                        wicket.kind ===
                        "retired not out"
                    ) {
                        continue;
                    }

                    const dismissed =
                        findPlayer(
                            battingTeam,
                            wicket.player_out
                        );

                    if (
                        dismissed
                    ) {
                        dismissed.dismissals +=
                            1;
                    }
                }
            }
        }
    }
}

function collectPlayers(
    teamsByYear: Map<
        number,
        Map<
            string,
            TeamAccumulator
        >
    >
) {
    const players =
        new Map<
            string,
            {
                fullName: string;
                sourcePlayerId: string;
            }
        >();

    for (
        const teams of
        teamsByYear.values()
    ) {
        for (
            const team of
            teams.values()
        ) {
            for (
                const player of
                team.players.values()
            ) {
                players.set(
                    player.sourcePlayerId,
                    {
                        fullName:
                            player.fullName,
                        sourcePlayerId:
                            player.sourcePlayerId,
                    }
                );
            }
        }
    }

    return [
        ...players.values(),
    ];
}

function createPlayerOutput(
    player: PlayerAccumulator,
    role: WorldRole,
    roleSource: {
        provider: string;
        url: string;
        retrievedAt: string;
    }
) {
    const matches =
        player.matches.size;

    const innings =
        player.battingInnings.size;

    const battingAverage =
        player.dismissals > 0
            ? player.runs /
            player.dismissals
            : null;

    const strikeRate =
        player.ballsFaced > 0
            ? (
                player.runs /
                player.ballsFaced
            ) *
            100
            : null;

    const bowlingAverage =
        player.wickets > 0
            ? player.runsConceded /
            player.wickets
            : null;

    const economy =
        player.legalBallsBowled >
            0
            ? (
                player.runsConceded /
                player.legalBallsBowled
            ) *
            6
            : null;

    return {
        fullName:
            player.fullName,

        sourcePlayerId:
            player.sourcePlayerId,

        role,

        stats: {
            matches,
            innings,

            runs:
                player.runs,

            batting_average:
                battingAverage,

            strike_rate:
                strikeRate,

            hundreds:
                player.hundreds,

            fifties:
                player.fifties,

            wickets:
                player.wickets,

            bowling_average:
                bowlingAverage,

            economy,

            catches:
                player.catches,

            stumpings:
                player.stumpings,
        },

        sources: [
            {
                provider:
                    "Cricsheet",
                url:
                    "https://cricsheet.org/downloads/",
            },
        ],

        roleSource,
    };
}

function hasPlayableXI(
    players: Array<{
        role:
        | "BAT"
        | "WK"
        | "AR"
        | "BOWL";
    }>
) {
    const wk =
        players.filter(
            (player) =>
                player.role ===
                "WK"
        ).length;

    const bat =
        players.filter(
            (player) =>
                player.role ===
                "BAT"
        ).length;

    const ar =
        players.filter(
            (player) =>
                player.role ===
                "AR"
        ).length;

    const bowl =
        players.filter(
            (player) =>
                player.role ===
                "BOWL"
        ).length;

    return (
        players.length >= 11 &&
        wk >= 1 &&
        bat >= 4 &&
        ar >= 1 &&
        bowl >= 3 &&
        ar + bowl >= 5
    );
}

function processEdition(
    year: number,
    teams: Map<
        string,
        TeamAccumulator
    >,
    roles: Map<
        string,
        {
            role:
            | "BAT"
            | "WK"
            | "AR"
            | "BOWL";

            source: {
                provider:
                | "ICC"
                | "BOARD";

                url: string;
                retrievedAt: string;
            };
        }
    >
) {
    const edition =
        getWorldEdition(
            year
        );

    if (!edition) {
        fail(
            `Unknown edition ${year}.`
        );
    }

    const outputTeams =
        [...teams.values()].map(
            (team) => {
                const players = [];

                for (
                    const player of
                    team.players.values()
                ) {
                    const resolved =
                        roles.get(
                            player.sourcePlayerId
                        );

                    /*
                     * Players without an explicitly
                     * verified role are excluded from
                     * the playable dataset.
                     */
                    if (!resolved) {
                        continue;
                    }

                    players.push(
                        createPlayerOutput(
                            player,
                            resolved.role,
                            resolved.source
                        )
                    );
                }

                return {
                    name:
                        team.name,

                    shortName:
                        team.shortName,

                    slug:
                        team.slug,

                    players,

                    sources: [
                        "https://cricsheet.org/downloads/",
                    ],
                };
            }
        );

    /*
     * Never allow a team with zero
     * verified players into processed data.
     */
    const emptyTeams =
        outputTeams.filter(
            (team) =>
                team.players.length === 0
        );

    if (
        emptyTeams.length > 0
    ) {
        throw new Error(
            `[WORLD PROCESSING] ${year} contains teams with zero verified players: ${emptyTeams
                .map(
                    (team) =>
                        team.name
                )
                .join(", ")}`
        );
    }

    /*
     * Every team that can be selected
     * by World Domination must be able
     * to form a valid XI.
     */
    const unplayableTeams =
        outputTeams.filter(
            (team) =>
                !hasPlayableXI(
                    team.players
                )
        );

    if (
        unplayableTeams.length > 0
    ) {
        throw new Error(
            `[WORLD PROCESSING] ${year} contains teams that cannot form a valid XI: ${unplayableTeams
                .map(
                    (team) =>
                        `${team.name} (${team.players.length} verified players)`
                )
                .join(", ")}`
        );
    }

    const output = {
        year,

        seasonName:
            edition.seasonName,

        format:
            edition.format,

        competition:
            edition.competition,

        oversPerInnings:
            edition.oversPerInnings,

        teams:
            outputTeams,

        sources: [
            "https://cricsheet.org/downloads/",
        ],
    };

    const outputPath =
        path.join(
            PROCESSED_DIRECTORY,
            `${year}.json`
        );

    fs.writeFileSync(
        outputPath,
        `${JSON.stringify(
            output,
            null,
            2
        )}\n`,
        "utf8"
    );

    console.log(
        `[WORLD PROCESSING] ${year}: ${outputTeams.length} teams / ${outputTeams.reduce(
            (sum, team) =>
                sum +
                team.players.length,
            0
        )} verified players`
    );
}

function writeRoleReport(
    unresolved: Array<{
        fullName: string;
        sourcePlayerId: string;
    }>,
    total: number,
    resolved: number
) {
    const report = {
        generatedAt:
            new Date().toISOString(),

        totalUniquePlayers:
            total,

        resolvedPlayers:
            resolved,

        unresolvedPlayers:
            unresolved.length,

        unresolved,

        policy:
            "Unresolved roles are excluded from the playable dataset. Roles are never inferred from statistics.",
    };

    fs.writeFileSync(
        ROLE_REPORT_PATH,
        `${JSON.stringify(
            report,
            null,
            2
        )}\n`,
        "utf8"
    );
}

async function main() {
    console.log(
        "[WORLD PROCESSING] Starting."
    );

    ensureDirectory(
        RAW_DIRECTORY
    );

    ensureDirectory(
        PROCESSED_DIRECTORY
    );

    const teamsByYear =
        new Map<
            number,
            Map<
                string,
                TeamAccumulator
            >
        >();

    for (
        const edition of
        WORLD_AVAILABLE_EDITIONS
    ) {
        const raw =
            readRaw(
                edition.year
            );

        const teams =
            new Map<
                string,
                TeamAccumulator
            >();

        raw.matches.forEach(
            (
                match,
                index
            ) => {
                processMatch(
                    match,
                    `${edition.year}-${index + 1}`,
                    teams
                );
            }
        );

        teamsByYear.set(
            edition.year,
            teams
        );
    }

    const players =
        collectPlayers(
            teamsByYear
        );

    console.log(
        `[WORLD PROCESSING] Unique players discovered: ${players.length}`
    );

    const roleResolution =
        resolveWorldRoles(
            players
        );

    writeRoleReport(
        roleResolution.unresolved,
        roleResolution.total,
        roleResolution.resolved.length
    );

    console.log(
        `[WORLD PROCESSING] Roles unresolved: ${roleResolution.unresolved.length}`
    );

    const resolvedRoles = new Map<
        string,
        {
            role:
                | "BAT"
                | "WK"
                | "AR"
                | "BOWL";
            source: {
                provider:
                    | "ICC"
                    | "BOARD";
                url: string;
                retrievedAt: string;
            };
        }
    >();

    for (
        const resolved of
            roleResolution.resolved
    ) {
        resolvedRoles.set(
            resolved.player.sourcePlayerId,
            resolved.role
        );
    }

    console.log(
        `[WORLD PROCESSING] Roles resolved: ${roleResolution.resolved.length}`
    );

    /*
     * Process every World Cup edition separately.
     *
     * Role resolution is global because the same player can
     * appear in multiple editions, but processed output is
     * edition-specific.
     */
    for (
        const edition of
            WORLD_AVAILABLE_EDITIONS
    ) {
        const teams =
            teamsByYear.get(
                edition.year
            );

        if (!teams) {
            fail(
                `No processed teams found for ${edition.year}.`
            );
        }

        processEdition(
            edition.year,
            teams,
            resolvedRoles
        );
    }

    if (
        roleResolution.unresolved
            .length > 0
    ) {
        console.error(
            "\n[WORLD PROCESSING] Unresolved players:"
        );

        for (
            const player of
                roleResolution.unresolved
        ) {
            console.error(
                `  - ${player.fullName} (${player.sourcePlayerId})`
            );
        }

        console.error(
            `\n[WORLD PROCESSING] Complete unresolved-role report: ${ROLE_REPORT_PATH}`
        );

        throw new Error(
            `[WORLD PROCESSING] ${roleResolution.unresolved.length} players still have no verified role.`
        );
    }

    console.log(
        "[WORLD PROCESSING] Successful."
    );
}

main().catch(
    (error) => {
        console.error(
            error
        );

        process.exit(1);
    }
);