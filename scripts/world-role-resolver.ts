import fs from "node:fs";
import path from "node:path";

export type WorldRole =
  | "BAT"
  | "WK"
  | "AR"
  | "BOWL";

export type RoleSource = {
  provider: "ICC" | "BOARD" | "ESPNcricinfo";
  url: string;
  retrievedAt: string;
};

export type RoleEntry = {
  role: WorldRole;
  source: RoleSource;
};

type RoleSourceFile = {
  version: number;
  description: string;

  sourcePolicy: {
    primary: string[];
    thirdParty: string[];
    thirdPartyUsage: string;
  };

  players: Record<string, RoleEntry>;
};

export type WorldPlayerIdentity = {
  fullName: string;
  sourcePlayerId: string;
};

const ROLE_SOURCE_FILE = path.join(
  process.cwd(),
  "scripts",
  "data",
  "world",
  "role-sources.json"
);

function fail(message: string): never {
  throw new Error(`[WORLD ROLES] ${message}`);
}

function loadRoleSources(): RoleSourceFile {
  if (!fs.existsSync(ROLE_SOURCE_FILE)) {
    fail(
      `Missing role source file: ${ROLE_SOURCE_FILE}`
    );
  }

  const raw = fs.readFileSync(
    ROLE_SOURCE_FILE,
    "utf8"
  );

  if (!raw.trim()) {
    fail(
      `${ROLE_SOURCE_FILE} is empty.`
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(
      `Invalid JSON in ${ROLE_SOURCE_FILE}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }

  const file = parsed as RoleSourceFile;

  if (
    !file.players ||
    typeof file.players !== "object" ||
    Array.isArray(file.players)
  ) {
    fail(
      "role-sources.json must contain a players object."
    );
  }

  return file;
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
  sourcePlayerId: string,
  entry: RoleEntry
): void {
  if (!entry || typeof entry !== "object") {
    fail(
      `Invalid role entry for ${sourcePlayerId}.`
    );
  }

  if (!validateRole(entry.role)) {
    fail(
      `Invalid role for ${sourcePlayerId}: ${String(
        entry.role
      )}`
    );
  }

  if (!entry.source) {
    fail(
      `Missing role source for ${sourcePlayerId}.`
    );
  }

  if (
    entry.source.provider !== "ICC" &&
    entry.source.provider !== "BOARD" &&
    entry.source.provider !== "ESPNcricinfo"
  ) {
    fail(
      `Unsupported authoritative provider for ${sourcePlayerId}: ${String(
        entry.source.provider
      )}`
    );
  }

  if (
    typeof entry.source.url !== "string" ||
    !entry.source.url.startsWith("https://")
  ) {
    fail(
      `Role source must use HTTPS for ${sourcePlayerId}.`
    );
  }

  if (
    typeof entry.source.retrievedAt !== "string" ||
    Number.isNaN(
      new Date(entry.source.retrievedAt).getTime()
    )
  ) {
    fail(
      `Invalid retrievedAt for ${sourcePlayerId}.`
    );
  }
}

export function loadVerifiedWorldRoles(): Map<
  string,
  RoleEntry
> {
  const file = loadRoleSources();

  const roles = new Map<string, RoleEntry>();

  for (const [
    sourcePlayerId,
    entry,
  ] of Object.entries(file.players)) {
    validateRoleEntry(
      sourcePlayerId,
      entry
    );

    roles.set(
      sourcePlayerId,
      entry
    );
  }

  return roles;
}

export function resolveWorldRoles(
  players: WorldPlayerIdentity[]
) {
  const verifiedRoles =
    loadVerifiedWorldRoles();

  const resolved: Array<{
    player: WorldPlayerIdentity;
    role: RoleEntry;
  }> = [];

  const unresolved: WorldPlayerIdentity[] = [];

  const seen = new Set<string>();

  for (const player of players) {
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
      verifiedRoles.get(
        player.sourcePlayerId
      );

    if (role) {
      resolved.push({
        player,
        role,
      });
    } else {
      unresolved.push(player);
    }
  }

  return {
    resolved,
    unresolved,
    total: seen.size,
  };
}