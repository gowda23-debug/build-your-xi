import fs from "node:fs";
import path from "node:path";

export type WorldRole =
  | "BAT"
  | "WK"
  | "AR"
  | "BOWL";

export type RoleProvider =
  | "ICC"
  | "BOARD";

export type RoleEntry = {
  role: WorldRole;
  source: {
    provider: RoleProvider;
    url: string;
    retrievedAt: string;
  };
};

export type WorldPlayerIdentity = {
  fullName: string;
  sourcePlayerId: string;
};

type RoleSourceFile = {
  version: number;
  description: string;
  players: Record<
    string,
    RoleEntry
  >;
};

const ROLE_SOURCE_FILE =
  path.join(
    process.cwd(),
    "scripts",
    "data",
    "world",
    "role-sources.json"
  );

function fail(
  message: string
): never {
  throw new Error(
    `[WORLD ROLES] ${message}`
  );
}

function validateRole(
  role: unknown
): role is WorldRole {
  return (
    role === "BAT" ||
    role === "WK" ||
    role === "AR" ||
    role === "BOWL"
  );
}

function validateRoleEntry(
  playerId: string,
  entry: RoleEntry
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
    !validateRole(
      entry.role
    )
  ) {
    fail(
      `Invalid role for ${playerId}.`
    );
  }

  if (
    entry.source.provider !==
      "ICC" &&
    entry.source.provider !==
      "BOARD"
  ) {
    fail(
      `Role source for ${playerId} must be ICC or BOARD.`
    );
  }

  if (
    typeof entry.source.url !==
      "string" ||
    !entry.source.url.startsWith(
      "https://"
    )
  ) {
    fail(
      `Invalid role source URL for ${playerId}.`
    );
  }

  if (
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

export function loadVerifiedWorldRoles():
  Map<string, RoleEntry> {
  if (
    !fs.existsSync(
      ROLE_SOURCE_FILE
    )
  ) {
    fail(
      `Missing ${ROLE_SOURCE_FILE}.`
    );
  }

  const raw =
    fs.readFileSync(
      ROLE_SOURCE_FILE,
      "utf8"
    );

  if (!raw.trim()) {
    fail(
      `${ROLE_SOURCE_FILE} is empty.`
    );
  }

  const file =
    JSON.parse(
      raw
    ) as RoleSourceFile;

  if (
    !file.players ||
    typeof file.players !==
      "object" ||
    Array.isArray(
      file.players
    )
  ) {
    fail(
      "role-sources.json must contain a players object."
    );
  }

  const result =
    new Map<
      string,
      RoleEntry
    >();

  for (
    const [
      playerId,
      entry,
    ] of Object.entries(
      file.players
    )
  ) {
    validateRoleEntry(
      playerId,
      entry
    );

    result.set(
      playerId,
      entry
    );
  }

  return result;
}

export function resolveWorldRoles(
  players: WorldPlayerIdentity[]
) {
  const verified =
    loadVerifiedWorldRoles();

  const resolved: Array<{
    player: WorldPlayerIdentity;
    role: RoleEntry;
  }> = [];

  const unresolved:
    WorldPlayerIdentity[] = [];

  const seen =
    new Set<string>();

  for (
    const player of players
  ) {
    if (
      seen.has(
        player.sourcePlayerId
      )
    ) {
      continue;
    }

    seen.add(
      player.sourcePlayerId
    );

    const role =
      verified.get(
        player.sourcePlayerId
      );

    if (role) {
      resolved.push({
        player,
        role,
      });
    } else {
      unresolved.push(
        player
      );
    }
  }

  return {
    resolved,
    unresolved,
    total:
      seen.size,
  };
}