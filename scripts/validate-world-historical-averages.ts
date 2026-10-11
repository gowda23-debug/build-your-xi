
import fs from "node:fs";
import path from "node:path";

import {
    WORLD_HISTORICAL_SOURCES,
} from "./data/world/historical-sources";

type WorldRole = "BAT" | "WK" | "AR" | "BOWL";

type RoleSource = {
    provider: string;
    url: string;
    retrievedAt: string;
};

type HistoricalPlayer = {
    fullName: string;
    sourcePlayerId: string;
    role: WorldRole | null;
    roleSource: RoleSource | null;
    stats: {
        matches: number;
        innings: number;
        runs: number;
        batting_average: number | null;
        strike_rate: number | null;
        hundreds: number;
        fifties: number;
        wickets: number;
        bowling_average: number | null;
        economy: number | null;
        catches: number;
        stumpings: number;
    };
    sources?: string[];
};

type HistoricalEdition = {
    year: number;
    seasonName: string;
    format: "ODI";
    competition: "ICC Men's Cricket World Cup";
    oversPerInnings: 50 | 60;
    status: "staging-unverified-roles";
    playable: false;
    unresolvedRoleCount: number;
    unresolvedPlayers: Array<{
        year: number;
        sourcePlayerId: string;
        fullName: string;
        teamCode: string;
        sourceUrl: string;
    }>;
    teams: Array<{
        name: string;
        shortName: string;
        slug: string;
        players: HistoricalPlayer[];
        sources: string[];
    }>;
    sources: string[];
};

const STAGING_DIRECTORY = path.join(
    process.cwd(),
    "scripts",
    "data",
    "world",
    "staging",
    "historical-averages",
);

function fail(message: string): never {
    throw new Error(
        `[WORLD HISTORICAL AVERAGES VALIDATION] ${message}`,
    );
}

function readEdition(year: number): HistoricalEdition {
    const filePath = path.join(
        STAGING_DIRECTORY,
        `${year}.json`,
    );

    if (!fs.existsSync(filePath)) {
        fail(
            `Missing staged averages file: ${filePath}. Run npm.cmd run data:import-world-historical-averages first.`,
        );
    }

    try {
        return JSON.parse(
            fs.readFileSync(filePath, "utf8"),
        ) as HistoricalEdition;
    } catch (error) {
        fail(
            `Invalid JSON in ${filePath}: ${error instanceof Error
                ? error.message
                : String(error)
            }`,
        );
    }
}

function validatePlayer(
    year: number,
    player: HistoricalPlayer,
): void {
    if (
        typeof player.fullName !== "string" ||
        !player.fullName.trim()
    ) {
        fail(`${year}: player has an empty name.`);
    }



    const validCricketArchivePlayerId =
        /^cricketarchive:\/(?:[a-z0-9-]+\/)?players?\/\d+\/\d+\/\d+\.html(?:[?#].*)?$/i.test(
            player.sourcePlayerId,
        );

    if (!validCricketArchivePlayerId) {
        fail(
           `${year}/${player.fullName}: invalid CricketArchive player ID.`,
        );
    }


    const stats = player.stats;

    if (!stats || typeof stats !== "object") {
        fail(`${year}/${player.fullName}: missing statistics.`);
    }

    for (const field of [
        "matches",
        "innings",
        "runs",
        "hundreds",
        "fifties",
        "wickets",
        "catches",
        "stumpings",
    ] as const) {
        if (
            !Number.isInteger(stats[field]) ||
            stats[field] < 0
        ) {
            fail(
                `${year}/${player.fullName}: ${field} must be a non-negative integer.`,
            );
        }
    }

    for (const field of [
        "batting_average",
        "strike_rate",
        "bowling_average",
        "economy",
    ] as const) {
        const value = stats[field];

        if (
            value !== null &&
            (
                typeof value !== "number" ||
                !Number.isFinite(value) ||
                value < 0
            )
        ) {
            fail(
                `${year}/${player.fullName}: invalid ${field}.`,
            );
        }
    }

    if (stats.innings > stats.matches) {
        fail(`${year}/${player.fullName}: innings exceed matches.`);
    }

    if (
        stats.hundreds > stats.innings ||
        stats.fifties > stats.innings
    ) {
        fail(
            `${year}/${player.fullName}: hundreds or fifties exceed innings.`,
        );
    }

    if (player.role !== null) {
        if (
            !["BAT", "WK", "AR", "BOWL"].includes(player.role)
        ) {
            fail(`${year}/${player.fullName}: invalid role.`);
        }

        if (
            !player.roleSource ||
            !["ICC", "BOARD", "ESPNCRICINFO", "CRICKETARCHIVE"].includes(
                player.roleSource.provider,
            )
        ) {
            fail(
                `${year}/${player.fullName}: role lacks an approved documented source.`,
            );
        }

        if (
            !player.roleSource.url.startsWith("https://") ||
            Number.isNaN(
                Date.parse(player.roleSource.retrievedAt),
            )
        ) {
            fail(
                `${year}/${player.fullName}: invalid role-source metadata.`,
            );
        }
    } else if (player.roleSource !== null) {
        fail(
            `${year}/${player.fullName}: roleSource exists even though role is null.`,
        );
    }
}

function validateEdition(
    source: (typeof WORLD_HISTORICAL_SOURCES)[number],
): void {
    const edition = readEdition(source.year);

    if (edition.year !== source.year) {
        fail(`${source.year}: year mismatch.`);
    }

    if (edition.seasonName !== source.seasonName) {
        fail(`${source.year}: season name mismatch.`);
    }

    if (edition.format !== "ODI") {
        fail(`${source.year}: invalid format.`);
    }

    if (
        edition.competition !==
        "ICC Men's Cricket World Cup"
    ) {
        fail(`${source.year}: invalid competition.`);
    }

    if (
        edition.oversPerInnings !== source.oversPerInnings
    ) {
        fail(`${source.year}: overs per innings mismatch.`);
    }

    if (
        edition.status !== "staging-unverified-roles" ||
        edition.playable !== false
    ) {
        fail(
            `${source.year}: expected a staging-only, non-playable edition.`,
        );
    }

    if (
        !Array.isArray(edition.teams) ||
        edition.teams.length === 0
    ) {
        fail(`${source.year}: no teams found.`);
    }

    const playerIds = new Set<string>();
    const players: HistoricalPlayer[] = [];

    for (const team of edition.teams) {
        if (
            !team.name ||
            !team.slug ||
            !Array.isArray(team.players) ||
            team.players.length === 0
        ) {
            fail(`${source.year}: invalid or empty team record.`);
        }

        for (const player of team.players) {
            validatePlayer(source.year, player);

            if (playerIds.has(player.sourcePlayerId)) {
                fail(
                    `${source.year}: duplicate player ID ${player.sourcePlayerId}.`,
                );
            }

            playerIds.add(player.sourcePlayerId);
            players.push(player);
        }
    }

    if (players.length === 0) {
        fail(`${source.year}: zero players found.`);
    }

    const unresolved = players.filter(
        player => player.role === null,
    );

    if (edition.unresolvedRoleCount !== unresolved.length) {
        fail(
            `${source.year}: unresolvedRoleCount says ${edition.unresolvedRoleCount}, but found ${unresolved.length} players without verified roles.`,
        );
    }

    if (
        !Array.isArray(edition.unresolvedPlayers) ||
        edition.unresolvedPlayers.length !== unresolved.length
    ) {
        fail(
            `${source.year}: unresolvedPlayers does not match the actual unresolved role count.`,
        );
    }

    const unresolvedIds = new Set(
        edition.unresolvedPlayers.map(
            player => player.sourcePlayerId,
        ),
    );

    for (const player of unresolved) {
        if (!unresolvedIds.has(player.sourcePlayerId)) {
            fail(
                `${source.year}: unresolved player ${player.sourcePlayerId} is missing from the review list.`,
            );
        }
    }

    const topRuns = Math.max(
        ...players.map(player => player.stats.runs),
    );

    const topWickets = Math.max(
        ...players.map(player => player.stats.wickets),
    );

    if (
        source.integrityChecks?.expectedTopRuns !== undefined &&
        topRuns !== source.integrityChecks.expectedTopRuns
    ) {
        fail(
            `${source.year}: top runs mismatch. Got ${topRuns}; expected ${source.integrityChecks.expectedTopRuns}.`,
        );
    }

    if (
        source.integrityChecks?.expectedTopWickets !== undefined &&
        topWickets !== source.integrityChecks.expectedTopWickets
    ) {
        fail(
            `${source.year}: top wickets mismatch. Got ${topWickets}; expected ${source.integrityChecks.expectedTopWickets}.`,
        );
    }

    console.log(
        `[WORLD HISTORICAL AVERAGES VALIDATION] ${source.year}: ${edition.teams.length} teams, ${players.length} players, ${unresolved.length} unresolved roles. Staging data valid; NOT PLAYABLE.`,
    );
}

function main(): void {
    const sources = WORLD_HISTORICAL_SOURCES.filter(
        source => source.year <= 1999,
    );

    if (sources.length === 0) {
        fail("No historical averages editions are configured.");
    }

    for (const source of sources) {
        validateEdition(source);
    }

    console.log(
        "[WORLD HISTORICAL AVERAGES VALIDATION] All staged historical averages passed integrity checks. This does not mean the editions are playable.",
    );
}

main();
