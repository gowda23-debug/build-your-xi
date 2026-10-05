import fs from "node:fs";
import path from "node:path";

type WorldRole =
  | "BAT"
  | "WK"
  | "AR"
  | "BOWL";

type OfficialProvider =
  | "ICC"
  | "BOARD";

type RoleSource = {
  provider: OfficialProvider;
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
  players: Record<string, VerifiedRoleEntry>;
};

type RoleSourcesOutput = {
  version: number;
  description: string;
  sourcePolicy: {
    primary: string[];
    thirdParty: string[];
    thirdPartyUsage: string;
  };
  players: Record<string, VerifiedRoleEntry>;
};

const ROLE_REVIEW_PATH = path.join(
  process.cwd(),
  "scripts",
  "data",
  "world",
  "role-review.json"
);

const VERIFIED_ROLES_PATH = path.join(
  process.cwd(),
  "scripts",
  "data",
  "world",
  "verified-world-roles.json"
);

const OUTPUT_PATH = path.join(
  process.cwd(),
  "scripts",
  "data",
  "world",
  "role-sources.json"
);

function fail(message: string): never {
  throw new Error(`[WORLD ROLE BUILD] ${message}`);
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    fail(`Missing file: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");

  if (!raw.trim()) {
    fail(`File is empty: ${filePath}`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    fail(
      `Invalid JSON in ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function isWorldRole(value: unknown): value is WorldRole {
  return (
    value === "BAT" ||
    value === "WK" ||
    value === "AR" ||
    value === "BOWL"
  );
}

function isOfficialProvider(
  value: unknown
): value is OfficialProvider {
  return value === "ICC" || value === "BOARD";
}

function validateSource(
  sourcePlayerId: string,
  source: RoleSource
): void {
  if (!source || typeof source !== "object") {
    fail(`Missing source for ${sourcePlayerId}.`);
  }

  if (!isOfficialProvider(source.provider)) {
    fail(
      `Invalid provider for ${sourcePlayerId}: ${String(
        source.provider
      )}. Only ICC or BOARD is allowed.`
    );
  }

  if (
    typeof source.url !== "string" ||
    source.url.trim().length === 0
  ) {
    fail(`Missing source URL for ${sourcePlayerId}.`);
  }

  if (!source.url.startsWith("https://")) {
    fail(
      `Source URL must use HTTPS for ${sourcePlayerId}: ${source.url}`
    );
  }

  if (
    typeof source.retrievedAt !== "string" ||
    source.retrievedAt.trim().length === 0
  ) {
    fail(`Missing retrievedAt for ${sourcePlayerId}.`);
  }

  const parsedDate = new Date(source.retrievedAt);

  if (Number.isNaN(parsedDate.getTime())) {
    fail(
      `Invalid retrievedAt date for ${sourcePlayerId}: ${source.retrievedAt}`
    );
  }
}

function validateRoleEntry(
  sourcePlayerId: string,
  entry: VerifiedRoleEntry
): void {
  if (!entry || typeof entry !== "object") {
    fail(`Invalid role entry for ${sourcePlayerId}.`);
  }

  if (!isWorldRole(entry.role)) {
    fail(
      `Invalid role for ${sourcePlayerId}: ${String(
        entry.role
      )}.`
    );
  }

  validateSource(sourcePlayerId, entry.source);
}

function validateReviewFile(
  review: RoleReviewFile
): RoleReviewPlayer[] {
  if (!review || !Array.isArray(review.players)) {
    fail(
      `role-review.json must contain a "players" array.`
    );
  }

  const seen = new Set<string>();

  for (const player of review.players) {
    if (
      !player.sourcePlayerId ||
      typeof player.sourcePlayerId !== "string"
    ) {
      fail(`Role review contains a player without sourcePlayerId.`);
    }

    if (seen.has(player.sourcePlayerId)) {
      fail(
        `Duplicate sourcePlayerId in role-review.json: ${player.sourcePlayerId}`
      );
    }

    seen.add(player.sourcePlayerId);

    if (
      !player.fullName ||
      typeof player.fullName !== "string"
    ) {
      fail(
        `Player ${player.sourcePlayerId} is missing fullName.`
      );
    }

    if (!Array.isArray(player.teams)) {
      fail(
        `Player ${player.sourcePlayerId} has invalid teams.`
      );
    }

    if (!Array.isArray(player.editions)) {
      fail(
        `Player ${player.sourcePlayerId} has invalid editions.`
      );
    }
  }

  return review.players;
}

function validateVerifiedRoles(
  verified: VerifiedRolesFile
): void {
  if (!verified || typeof verified !== "object") {
    fail(`verified-world-roles.json is invalid.`);
  }

  if (
    !verified.players ||
    typeof verified.players !== "object" ||
    Array.isArray(verified.players)
  ) {
    fail(
      `verified-world-roles.json must contain a players object.`
    );
  }

  for (const [
    sourcePlayerId,
    entry,
  ] of Object.entries(verified.players)) {
    validateRoleEntry(sourcePlayerId, entry);
  }
}

function buildOutput(
  reviewPlayers: RoleReviewPlayer[],
  verifiedRoles: Record<string, VerifiedRoleEntry>
): RoleSourcesOutput {
  const reviewIds = new Set(
    reviewPlayers.map((player) => player.sourcePlayerId)
  );

  const outputPlayers: Record<
    string,
    VerifiedRoleEntry
  > = {};

  for (const [
    sourcePlayerId,
    entry,
  ] of Object.entries(verifiedRoles)) {
    if (!reviewIds.has(sourcePlayerId)) {
      console.warn(
        `[WORLD ROLE BUILD] WARNING: ${sourcePlayerId} exists in verified-world-roles.json but not in role-review.json.`
      );
    }

    outputPlayers[sourcePlayerId] = entry;
  }

  return {
    version: 1,

    description:
      "Authoritative World Cup player-role mappings. Every role must be backed by an explicit official source.",

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
        "Cross-check only. Third-party sources cannot establish the authoritative role.",
    },

    players: outputPlayers,
  };
}

function printSummary(
  reviewPlayers: RoleReviewPlayer[],
  verifiedRoles: Record<string, VerifiedRoleEntry>
): void {
  const total = reviewPlayers.length;

  const resolved = reviewPlayers.filter(
    (player) =>
      verifiedRoles[player.sourcePlayerId] !== undefined
  );

  const unresolved = reviewPlayers.filter(
    (player) =>
      verifiedRoles[player.sourcePlayerId] === undefined
  );

  console.log("");
  console.log("========================================");
  console.log("WORLD ROLE VERIFICATION");
  console.log("========================================");
  console.log(`Players discovered : ${total}`);
  console.log(`Roles verified     : ${resolved.length}`);
  console.log(`Roles unresolved   : ${unresolved.length}`);
  console.log(
    `Coverage           : ${
      total === 0
        ? "0.00"
        : ((resolved.length / total) * 100).toFixed(2)
    }%`
  );
  console.log("========================================");
  console.log("");

  if (unresolved.length > 0) {
    console.log(
      "[WORLD ROLE BUILD] Unresolved players:"
    );

    for (const player of unresolved) {
      console.log(
        `- ${player.sourcePlayerId} | ${player.fullName} | ${player.teams.join(
          ", "
        )} | ${player.editions.join(", ")}`
      );
    }

    console.log("");
  }
}

function main(): void {
  console.log(
    "[WORLD ROLE BUILD] Starting role-source generation."
  );

  const review = readJson<RoleReviewFile>(
    ROLE_REVIEW_PATH
  );

  const verified = readJson<VerifiedRolesFile>(
    VERIFIED_ROLES_PATH
  );

  const reviewPlayers = validateReviewFile(review);

  validateVerifiedRoles(verified);

  const output = buildOutput(
    reviewPlayers,
    verified.players
  );

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );

  printSummary(
    reviewPlayers,
    verified.players
  );

  console.log(
    `[WORLD ROLE BUILD] Generated: ${OUTPUT_PATH}`
  );
  console.log(
    "[WORLD ROLE BUILD] Completed."
  );
}

main();