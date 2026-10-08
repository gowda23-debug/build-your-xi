import fs from "node:fs";
import path from "node:path";

import {
    WORLD_AVAILABLE_EDITIONS,
} from "./data/world/editions";

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

    extras?: Record<string, number>;

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
    source?: {
        provider?: string;
        url?: string;
        archive?: string;
        format?: string;
    };

    year?: number;

    seasonName?: string;

    format?: string;

    competition?: string;

    oversPerInnings?: number;

    matches: RawMatch[];
};

type PlayerReview = {
    sourcePlayerId: string;
    fullName: string;
    teams: string[];
    editions: number[];
};

type RoleSourceFile = {
    version: number;

    description: string;

    sourcePolicy: {
        primary: string[];
        thirdParty: string[];
        thirdPartyUsage: string;
    };

    players: Record<
        string,
        unknown
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

const REVIEW_DIRECTORY =
    path.join(
        ROOT,
        "scripts",
        "data",
        "world",
        "role-review"
    );

const REVIEW_PATH = path.join(
  ROOT,
  "scripts",
  "data",
  "world",
  "role-review.json"
);

const ROLE_SOURCE_PATH =
    path.join(
        ROOT,
        "scripts",
        "data",
        "world",
        "role-sources.json"
    );

function fail(
    message: string
): never {
    throw new Error(
        `[WORLD ROLE REVIEW] ${message}`
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

/**
 * The World downloader stores the raw data as JSON files
 * under scripts/data/world/raw.
 *
 * This function deliberately does not assume a year-directory
 * structure.
 */
function readRawMatches(
    year: number
): RawMatch[] {
    if (
        !fs.existsSync(
            RAW_DIRECTORY
        )
    ) {
        fail(
            `Missing World raw directory: ${RAW_DIRECTORY}`
        );
    }

    const entries =
        fs.readdirSync(
            RAW_DIRECTORY,
            {
                withFileTypes: true,
            }
        );

    const candidateFiles =
        entries
            .filter(
                (entry) =>
                    entry.isFile() &&
                    entry.name.endsWith(
                        ".json"
                    )
            )
            .map(
                (entry) =>
                    path.join(
                        RAW_DIRECTORY,
                        entry.name
                    )
            );

    const matches:
        RawMatch[] = [];

    for (
        const filePath of
        candidateFiles
    ) {
        const raw =
            fs.readFileSync(
                filePath,
                "utf8"
            );

        if (
            !raw.trim()
        ) {
            continue;
        }

        let parsed:
            unknown;

        try {
            parsed =
                JSON.parse(
                    raw
                );
        } catch {
            continue;
        }

        /*
         * Supported raw formats:
         *
         * 1. A wrapper containing:
         *    { year, matches: [...] }
         *
         * 2. A single Cricsheet match:
         *    { info: {...}, innings: [...] }
         *
         * 3. A wrapper containing a match array.
         */
        if (
            isRawFile(
                parsed
            )
        ) {
            if (
                parsed.year ===
                    year ||
                inferYearFromMatch(
                    parsed.matches[0]
                ) === year
            ) {
                matches.push(
                    ...parsed.matches
                );
            }

            continue;
        }

        if (
            isRawMatch(
                parsed
            )
        ) {
            const inferredYear =
                inferYearFromMatch(
                    parsed
                );

            if (
                inferredYear ===
                year
            ) {
                matches.push(
                    parsed
                );
            }
        }
    }

    if (
        matches.length ===
        0
    ) {
        fail(
            `No raw World Cup matches found for ${year} under ${RAW_DIRECTORY}.`
        );
    }

    return matches;
}

function isRawMatch(
    value: unknown
): value is RawMatch {
    if (
        !value ||
        typeof value !==
            "object"
    ) {
        return false;
    }

    const candidate =
        value as Partial<RawMatch>;

    return (
        !!candidate.info &&
        Array.isArray(
            candidate.info.teams
        ) &&
        !!candidate.info.players
    );
}

function isRawFile(
    value: unknown
): value is RawFile {
    if (
        !value ||
        typeof value !==
            "object"
    ) {
        return false;
    }

    const candidate =
        value as Partial<RawFile>;

    return Array.isArray(
        candidate.matches
    );
}

function inferYearFromMatch(
    match:
        RawMatch |
        undefined
): number | undefined {
    if (!match) {
        return undefined;
    }

    const date =
        match.info.dates?.[0];

    if (
        typeof date ===
        "string"
    ) {
        const year =
            Number(
                date.slice(
                    0,
                    4
                )
            );

        if (
            Number.isInteger(
                year
            )
        ) {
            return year;
        }
    }

    return undefined;
}

function createPlayerId(
  match: RawMatch,
  name: string
): string {
  const registryId =
    match.info.registry?.people?.[name];

  if (!registryId) {
    fail(
      `Missing Cricsheet Register ID for "${name}".`
    );
  }

  if (!/^[0-9a-f]{8}$/i.test(registryId)) {
    fail(
      `Invalid Cricsheet Register ID "${registryId}" for "${name}".`
    );
  }

  return registryId.toLowerCase();
}

function collectPlayers(): PlayerReview[] {
    const players =
        new Map<
            string,
            PlayerReview
        >();

    for (
        const edition of
        WORLD_AVAILABLE_EDITIONS
    ) {
        const matches =
            readRawMatches(
                edition.year
            );

        console.log(
            `[WORLD ROLE REVIEW] ${edition.year}: ${matches.length} matches`
        );

        for (
            const match of
            matches
        ) {
            for (
                const [
                    team,
                    teamPlayers,
                ] of Object.entries(
                    match.info.players
                )
            ) {
                for (
                    const fullName of
                    teamPlayers
                ) {
                    const sourcePlayerId =
                        createPlayerId(
                            match,
                            fullName
                        );

                    const existing =
                        players.get(
                            sourcePlayerId
                        );

                    if (
                        existing
                    ) {
                        if (
                            !existing.teams.includes(
                                team
                            )
                        ) {
                            existing.teams.push(
                                team
                            );
                        }

                        if (
                            !existing.editions.includes(
                                edition.year
                            )
                        ) {
                            existing.editions.push(
                                edition.year
                            );
                        }

                        continue;
                    }

                    players.set(
                        sourcePlayerId,
                        {
                            sourcePlayerId,
                            fullName,
                            teams: [
                                team,
                            ],
                            editions: [
                                edition.year,
                            ],
                        }
                    );
                }
            }
        }
    }

    return Array.from(
        players.values()
    ).sort(
        (a, b) =>
            a.fullName.localeCompare(
                b.fullName
            )
    );
}

function loadExistingRoles():
    Record<
        string,
        unknown
    > {
    if (
        !fs.existsSync(
            ROLE_SOURCE_PATH
        )
    ) {
        return {};
    }

    const raw =
        fs.readFileSync(
            ROLE_SOURCE_PATH,
            "utf8"
        );

    if (
        !raw.trim()
    ) {
        return {};
    }

    let parsed:
        RoleSourceFile;

    try {
        parsed =
            JSON.parse(
                raw
            ) as RoleSourceFile;
    } catch (
        error
    ) {
        fail(
            `Invalid JSON in role-sources.json: ${
                error instanceof Error
                    ? error.message
                    : String(error)
            }`
        );
    }

    return (
        parsed.players ??
        {}
    );
}

function main() {
    console.log(
        "[WORLD ROLE REVIEW] Starting."
    );

    ensureDirectory(
        REVIEW_DIRECTORY
    );

    const players =
        collectPlayers();

    const existingRoles =
        loadExistingRoles();

    const review =
        players.map(
            (player) => ({
                ...player,

                status:
                    existingRoles[
                        player.sourcePlayerId
                    ]
                        ? "verified"
                        : "needs-verification",

                role:
                    existingRoles[
                        player.sourcePlayerId
                    ] ?? null,
            })
        );

    fs.writeFileSync(
        REVIEW_PATH,
        `${JSON.stringify(
            {
                generatedAt:
                    new Date().toISOString(),

                totalPlayers:
                    review.length,

                verifiedPlayers:
                    review.filter(
                        (player) =>
                            player.status ===
                            "verified"
                    ).length,

                unresolvedPlayers:
                    review.filter(
                        (player) =>
                            player.status ===
                            "needs-verification"
                    ).length,

                players:
                    review,
            },
            null,
            2
        )}\n`,
        "utf8"
    );

    console.log(
        `[WORLD ROLE REVIEW] Players discovered: ${review.length}`
    );

    console.log(
        `[WORLD ROLE REVIEW] Already verified: ${
            review.filter(
                (player) =>
                    player.status ===
                    "verified"
            ).length
        }`
    );

    console.log(
        `[WORLD ROLE REVIEW] Needs verification: ${
            review.filter(
                (player) =>
                    player.status ===
                    "needs-verification"
            ).length
        }`
    );

    console.log(
        `[WORLD ROLE REVIEW] Review file: ${REVIEW_PATH}`
    );
}

main();