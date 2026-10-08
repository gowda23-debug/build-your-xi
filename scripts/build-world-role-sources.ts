import fs from "node:fs";
import path from "node:path";

type WorldRole =
  | "BAT"
  | "WK"
  | "AR"
  | "BOWL";

type RoleProvider =
  | "ICC"
  | "BOARD";

type RoleSource = {
  provider: RoleProvider;
  url: string;
  retrievedAt: string;
};

type RoleReviewPlayer = {
  sourcePlayerId: string;
  fullName: string;
  teams: string[];
  editions: number[];
  status: string;
  role: WorldRole | null;
};

type VerifiedRoleEntry = {
  role: WorldRole;
  source: RoleSource;
};

type RoleReviewFile = {
  players: RoleReviewPlayer[];
};

type VerifiedRolesFile = {
  version: number;
  description: string;
  players: Record<
    string,
    VerifiedRoleEntry
  >;
};

const ROOT =
  process.cwd();

const ROLE_REVIEW_PATH =
  path.join(
    ROOT,
    "scripts",
    "data",
    "world",
    "role-review.json"
  );

const VERIFIED_ROLES_PATH =
  path.join(
    ROOT,
    "scripts",
    "data",
    "world",
    "verified-world-roles.json"
  );

const OUTPUT_PATH =
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
    `[WORLD ROLE BUILD] ${message}`
  );
}

function readJson<T>(
  filePath: string
): T {
  if (
    !fs.existsSync(
      filePath
    )
  ) {
    fail(
      `Missing ${filePath}`
    );
  }

  const raw =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  if (!raw.trim()) {
    fail(
      `Empty ${filePath}`
    );
  }

  try {
    return JSON.parse(
      raw
    ) as T;
  } catch (error) {
    fail(
      `Invalid JSON ${filePath}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}

function isRole(
  value: unknown
): value is WorldRole {
  return (
    value === "BAT" ||
    value === "WK" ||
    value === "AR" ||
    value === "BOWL"
  );
}

function isProvider(
  value: unknown
): value is RoleProvider {
  return (
    value === "ICC" ||
    value === "BOARD"
  );
}

function validateRoleEntry(
  playerId: string,
  entry: VerifiedRoleEntry
): void {
  if (
    !entry ||
    typeof entry !== "object"
  ) {
    fail(
      `Invalid role entry for ${playerId}.`
    );
  }

  if (
    !isRole(entry.role)
  ) {
    fail(
      `Invalid role for ${playerId}: ${String(entry.role)}`
    );
  }

  if (
    !entry.source ||
    !isProvider(
      entry.source.provider
    )
  ) {
    fail(
      `Role source for ${playerId} must use ICC or BOARD.`
    );
  }

  if (
    !entry.source.url ||
    !entry.source.url.startsWith(
      "https://"
    )
  ) {
    fail(
      `Invalid role source URL for ${playerId}.`
    );
  }

  if (
    !entry.source.retrievedAt ||
    Number.isNaN(
      new Date(
        entry.source.retrievedAt
      ).getTime()
    )
  ) {
    fail(
      `Invalid role source timestamp for ${playerId}.`
    );
  }
}

function main(): void {
  const review =
    readJson<RoleReviewFile>(
      ROLE_REVIEW_PATH
    );

  const verified =
    readJson<VerifiedRolesFile>(
      VERIFIED_ROLES_PATH
    );

  if (
    !Array.isArray(
      review.players
    )
  ) {
    fail(
      "role-review.json has no players array."
    );
  }

  const discoveredIds =
    new Set(
      review.players.map(
        (player) =>
          player.sourcePlayerId
      )
    );

  for (
    const [
      playerId,
      entry,
    ] of Object.entries(
      verified.players
    )
  ) {
    validateRoleEntry(
      playerId,
      entry
    );

    if (
      !discoveredIds.has(
        playerId
      )
    ) {
      fail(
        `Verified role ${playerId} does not exist in role-review.json.`
      );
    }
  }

  const unresolved =
    review.players.filter(
      (player) =>
        !verified.players[
          player.sourcePlayerId
        ]
    );

  if (
    unresolved.length > 0
  ) {
    console.log(
      `[WORLD ROLE BUILD] ${unresolved.length} players remain unresolved.`
    );

    console.log(
      "[WORLD ROLE BUILD] No final role-sources.json will be produced."
    );

    process.exit(2);
  }

  fs.writeFileSync(
    OUTPUT_PATH,
    `${JSON.stringify(
      {
        version: 1,
        description:
          "Authoritative World Cup player-role mappings. Roles must be supported by ICC or an official national cricket board source.",
        sourcePolicy: {
          primary: [
            "ICC player profile",
            "ICC tournament media guide",
            "Official national cricket board player profile",
            "Official national cricket board tournament squad/profile",
          ],
          thirdParty: [
            "ESPNcricinfo",
            "Cricbuzz",
            "Kaggle",
            "GitHub datasets",
          ],
          thirdPartyUsage:
            "Third-party sources may be used for cross-checking only and cannot establish the authoritative role.",
        },
        players:
          verified.players,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `[WORLD ROLE BUILD] ${Object.keys(
      verified.players
    ).length} authoritative roles written.`
  );
}

main();