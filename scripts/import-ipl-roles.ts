import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
});

/* =========================================
   ENVIRONMENT
========================================= */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL in .env.local"
  );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
}

/* =========================================
   SUPABASE ADMIN CLIENT

   This script runs locally only.

   NEVER import the service-role client
   into the Next.js application.
========================================= */

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/* =========================================
   CONSTANTS
========================================= */

const PLAYER_META_URL =
  "https://raw.githubusercontent.com/mavaali/cricket-mcp/main/data/player_meta.csv";

const VALID_ROLES = [
  "BAT",
  "WK",
  "AR",
  "BOWL",
] as const;

type PlayerRole =
  (typeof VALID_ROLES)[number];

type Player = {
  id: string;
  name: string;
};

type PlayerMeta = {
  cricsheet_id: string;
  playing_role: string;
};

/* =========================================
   FILE HELPERS
========================================= */

const processedDir = path.join(
  process.cwd(),
  "scripts",
  "data",
  "processed"
);

function readJson<T>(
  fileName: string
): T {
  const filePath = path.join(
    processedDir,
    fileName
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Processed file not found: ${filePath}`
    );
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  ) as T;
}

/* =========================================
   CSV PARSER

   Handles quoted fields and commas inside
   quoted values.
========================================= */

function parseCsvLine(
  line: string
): string[] {
  const values: string[] = [];

  let current = "";
  let inQuotes = false;

  for (
    let index = 0;
    index < line.length;
    index += 1
  ) {
    const character = line[index];

    if (character === '"') {
      if (
        inQuotes &&
        line[index + 1] === '"'
      ) {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (
      character === "," &&
      !inQuotes
    ) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);

  return values;
}

function parseCsv(
  csv: string
): PlayerMeta[] {
  const lines = csv
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.trim().length > 0
    );

  if (lines.length < 2) {
    throw new Error(
      "Player metadata CSV is empty."
    );
  }

  const headers =
    parseCsvLine(lines[0]);

  const cricsheetIdIndex =
    headers.indexOf(
      "cricsheet_id"
    );

  const playingRoleIndex =
    headers.indexOf(
      "playing_role"
    );

  if (
    cricsheetIdIndex === -1 ||
    playingRoleIndex === -1
  ) {
    throw new Error(
      "Player metadata CSV does not contain the required cricsheet_id and playing_role columns."
    );
  }

  return lines
    .slice(1)
    .map((line) => {
      const columns =
        parseCsvLine(line);

      return {
        cricsheet_id:
          columns[
            cricsheetIdIndex
          ]?.trim() ?? "",

        playing_role:
          columns[
            playingRoleIndex
          ]?.trim() ?? "",
      };
    })
    .filter(
      (record) =>
        record.cricsheet_id.length > 0
    );
}

/* =========================================
   ROLE NORMALIZATION
========================================= */

function normalizeRole(
  value: string
): PlayerRole | null {
  const role =
    value
      .trim()
      .toLowerCase();

  if (!role) {
    return null;
  }

  /*
   * Wicketkeeper roles must be checked before
   * generic batter roles.
   */
  if (
    role.includes("wicketkeeper") ||
    role.includes("wicket-keeper")
  ) {
    return "WK";
  }

  if (
    role.includes("allrounder") ||
    role.includes("all-rounder") ||
    role.includes("all rounder")
  ) {
    return "AR";
  }

  if (role.includes("bowler")) {
    return "BOWL";
  }

  if (
    role.includes("batter") ||
    role.includes("batsman") ||
    role.includes("batswoman") ||
    role.includes("opening") ||
    role.includes("middle order") ||
    role.includes("top order")
  ) {
    return "BAT";
  }

  return null;
}

/* =========================================
   MAIN IMPORT
========================================= */

async function importRoles() {
  console.log("");
  console.log("================================");
  console.log("IPL PLAYER ROLE IMPORT");
  console.log("================================");
  console.log("");

  /* -----------------------------------------
     LOAD LOCAL PLAYER REGISTRY
  ----------------------------------------- */

  const players =
    readJson<Player[]>(
      "players.json"
    );

  console.log(
    `Local IPL players: ${players.length}`
  );

  /* -----------------------------------------
     DOWNLOAD PLAYER METADATA
  ----------------------------------------- */

  console.log("");
  console.log(
    "Downloading player metadata..."
  );

  const response = await fetch(
    PLAYER_META_URL
  );

  if (!response.ok) {
    throw new Error(
      `Unable to download player metadata. HTTP ${response.status}`
    );
  }

  const csv =
    await response.text();

  console.log(
    `Downloaded ${csv.length.toLocaleString()} characters`
  );

  /* -----------------------------------------
     PARSE METADATA
  ----------------------------------------- */

  const metadata =
    parseCsv(csv);

  console.log(
    `Metadata records: ${metadata.length}`
  );

  /*
   * Cricsheet ID
   * →
   * normalized role
   */

  const roleMap =
    new Map<
      string,
      PlayerRole
    >();

  for (const record of metadata) {
    const role =
      normalizeRole(
        record.playing_role
      );

    if (!role) {
      continue;
    }

    roleMap.set(
      record.cricsheet_id,
      role
    );
  }

  console.log(
    `Verified role records: ${roleMap.size}`
  );

  /* -----------------------------------------
     MATCH LOCAL PLAYERS
  ----------------------------------------- */

  const updates: Array<{
    id: string;
    name: string;
    role: PlayerRole;
  }> = [];

  const missing: Player[] = [];

  for (const player of players) {
    const role =
      roleMap.get(player.id);

    if (!role) {
      missing.push(player);
      continue;
    }

    updates.push({
      id: player.id,
      name: player.name,
      role,
    });
  }

  console.log("");
  console.log(
    `Players with verified roles: ${updates.length}`
  );

  console.log(
    `Players without verified roles: ${missing.length}`
  );

  /* -----------------------------------------
     SAFETY CHECK
  ----------------------------------------- */

  if (updates.length === 0) {
    throw new Error(
      "No IPL player roles could be matched. Database was not modified."
    );
  }

  /*
   * IMPORTANT:
   *
   * We intentionally do NOT assign a role to
   * unmatched players.
   *
   * This prevents bad role guesses from
   * entering production data.
   */

  /* -----------------------------------------
     UPDATE SUPABASE
  ----------------------------------------- */

  console.log("");
  console.log(
    "Updating player roles..."
  );

  const CHUNK_SIZE = 250;

  for (
    let index = 0;
    index < updates.length;
    index += CHUNK_SIZE
  ) {
    const chunk =
      updates.slice(
        index,
        index + CHUNK_SIZE
      );

    const {
      error,
    } = await supabase
      .from("ipl_players")
      .upsert(
        chunk.map(
          (player) => ({
            id: player.id,
            name: player.name,
            role: player.role,
          })
        ),
        {
          onConflict: "id",
        }
      );

    if (error) {
      throw error;
    }

    console.log(
      `✓ Updated ${Math.min(
        index + CHUNK_SIZE,
        updates.length
      )}/${updates.length}`
    );
  }

  /* -----------------------------------------
     ROLE SUMMARY
  ----------------------------------------- */

  const counts: Record<
    PlayerRole,
    number
  > = {
    BAT: 0,
    WK: 0,
    AR: 0,
    BOWL: 0,
  };

  for (const player of updates) {
    counts[player.role] += 1;
  }

  console.log("");
  console.log("Role summary:");
  console.log(`BAT  : ${counts.BAT}`);
  console.log(`WK   : ${counts.WK}`);
  console.log(`AR   : ${counts.AR}`);
  console.log(`BOWL : ${counts.BOWL}`);

  /* -----------------------------------------
     MISSING PLAYERS
  ----------------------------------------- */

  if (missing.length > 0) {
    console.log("");
    console.log(
      "================================"
    );
    console.log(
      "PLAYERS WITHOUT VERIFIED ROLES"
    );
    console.log(
      "================================"
    );

    for (const player of missing) {
      console.log(
        `${player.id} | ${player.name}`
      );
    }

    console.log("");
    console.log(
      "These players were intentionally left unchanged."
    );
  }

  /* -----------------------------------------
     COMPLETE
  ----------------------------------------- */

  console.log("");
  console.log("================================");
  console.log(
    "IPL PLAYER ROLE IMPORT COMPLETE"
  );
  console.log("================================");
  console.log("");
}

importRoles().catch(
  (error) => {
    console.error("");
    console.error(
      "================================"
    );
    console.error(
      "IPL PLAYER ROLE IMPORT FAILED"
    );
    console.error(
      "================================"
    );
    console.error("");

    console.error(error);

    process.exit(1);
  }
);