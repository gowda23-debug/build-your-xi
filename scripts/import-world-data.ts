import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  WORLD_AVAILABLE_EDITION_YEARS,
  getWorldEdition,
} from "./data/world/editions";

type WorldRole =
  | "BAT"
  | "WK"
  | "AR"
  | "BOWL";

type WorldStats = {
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

type WorldPlayer = {
  fullName: string;
  sourcePlayerId: string;
  role: WorldRole;
  stats: WorldStats;
  sources: string[];
};

type WorldTeam = {
  name: string;
  shortName: string;
  slug: string;
  players: WorldPlayer[];
  sources: string[];
};

type WorldSeason = {
  year: number;
  seasonName: string;
  format: "ODI";
  competition: "ICC Men's Cricket World Cup";
  oversPerInnings: 50 | 60;
  teams: WorldTeam[];
  sources: string[];
};

const supabaseUrl =
  process.env
    .NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env
    .SUPABASE_SERVICE_ROLE_KEY;

if (
  !supabaseUrl ||
  !serviceRoleKey
) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
  );
}

const supabase =
  createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken:
          false,
        persistSession:
          false,
      },
    }
  );

const PROCESSED_DIRECTORY =
  path.join(
    process.cwd(),
    "scripts",
    "data",
    "world",
    "processed"
  );

function fail(
  message: string
): never {
  throw new Error(
    `[WORLD IMPORT] ${message}`
  );
}

function readSeason(
  year: number
): WorldSeason {
  const filePath =
    path.join(
      PROCESSED_DIRECTORY,
      `${year}.json`
    );

  if (
    !fs.existsSync(
      filePath
    )
  ) {
    fail(
      `Missing processed file ${filePath}`
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

  try {
    return JSON.parse(
      raw
    ) as WorldSeason;
  } catch (error) {
    fail(
      `Invalid JSON in ${filePath}: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}

async function upsertSeason(
  season: WorldSeason
) {
  const edition =
    getWorldEdition(
      season.year
    );

  if (
    !edition ||
    edition.status !==
      "available"
  ) {
    fail(
      `${season.year} is not an available edition.`
    );
  }

  const {
    data: existingSeason,
    error: seasonLookupError,
  } = await supabase
    .from("seasons")
    .select(
      "id, year"
    )
    .eq(
      "year",
      season.year
    )
    .maybeSingle();

  if (
    seasonLookupError
  ) {
    throw seasonLookupError;
  }

  let seasonId =
    existingSeason?.id ??
    null;

  if (!seasonId) {
    const {
      data,
      error,
    } = await supabase
      .from("seasons")
      .insert({
        year:
          season.year,
      })
      .select(
        "id, year"
      )
      .single();

    if (error) {
      throw error;
    }

    seasonId =
      data.id;
  }

  for (
    const team of
      season.teams
  ) {
    const {
      data: existingTeam,
      error: teamLookupError,
    } = await supabase
      .from("teams")
      .select(
        "id, name, short_name, slug"
      )
      .eq(
        "slug",
        team.slug
      )
      .maybeSingle();

    if (
      teamLookupError
    ) {
      throw teamLookupError;
    }

    let teamId =
      existingTeam?.id ??
      null;

    if (!teamId) {
      const {
        data,
        error,
      } = await supabase
        .from("teams")
        .insert({
          name:
            team.name,

          short_name:
            team.shortName,

          slug:
            team.slug,
        })
        .select(
          "id, name, short_name, slug"
        )
        .single();

      if (error) {
        throw error;
      }

      teamId =
        data.id;
    } else {
      const {
        error,
      } = await supabase
        .from("teams")
        .update({
          name:
            team.name,

          short_name:
            team.shortName,
        })
        .eq(
          "id",
          teamId
        );

      if (error) {
        throw error;
      }
    }

    const {
      data: existingTeamSeason,
      error: teamSeasonLookupError,
    } = await supabase
      .from("team_seasons")
      .select(
        "id"
      )
      .eq(
        "team_id",
        teamId
      )
      .eq(
        "season_id",
        seasonId
      )
      .maybeSingle();

    if (
      teamSeasonLookupError
    ) {
      throw teamSeasonLookupError;
    }

    let teamSeasonId =
      existingTeamSeason?.id ??
      null;

    if (!teamSeasonId) {
      const {
        data,
        error,
      } = await supabase
        .from("team_seasons")
        .insert({
          team_id:
            teamId,

          season_id:
            seasonId,
        })
        .select(
          "id"
        )
        .single();

      if (error) {
        throw error;
      }

      teamSeasonId =
        data.id;
    }

    for (
      const player of
        team.players
    ) {
      const {
        data: existingPlayer,
        error: playerLookupError,
      } = await supabase
        .from("players")
        .select(
          "id, full_name, source_player_id"
        )
        .eq(
          "source_player_id",
          player.sourcePlayerId
        )
        .maybeSingle();

      if (
        playerLookupError
      ) {
        throw playerLookupError;
      }

      let playerId =
        existingPlayer?.id ??
        null;

      if (!playerId) {
        const {
          data,
          error,
        } = await supabase
          .from("players")
          .insert({
            full_name:
              player.fullName,

            source_player_id:
              player.sourcePlayerId,
          })
          .select(
            "id"
          )
          .single();

        if (error) {
          throw error;
        }

        playerId =
          data.id;
      } else if (
        existingPlayer?.full_name !==
        player.fullName
      ) {
        throw new Error(
          `Player ID ${player.sourcePlayerId} already belongs to "${existingPlayer?.full_name}", but the World data says "${player.fullName}".`
        );
      }

      const {
        error: roleError,
      } = await supabase
        .from("player_roles")
        .upsert(
          {
            player_id:
              playerId,

            role:
              player.role,
          },
          {
            onConflict:
              "player_id,role",
          }
        );

      if (
        roleError
      ) {
        throw roleError;
      }

      const {
        error: statsError,
      } = await supabase
        .from(
          "player_season_stats"
        )
        .upsert(
          {
            player_id:
              playerId,

            team_season_id:
              teamSeasonId,

            matches:
              player.stats.matches,

            innings:
              player.stats.innings,

            runs:
              player.stats.runs,

            batting_average:
              player.stats
                .batting_average,

            strike_rate:
              player.stats
                .strike_rate,

            hundreds:
              player.stats
                .hundreds,

            fifties:
              player.stats
                .fifties,

            wickets:
              player.stats
                .wickets,

            bowling_average:
              player.stats
                .bowling_average,

            economy:
              player.stats
                .economy,

            catches:
              player.stats
                .catches,

            stumpings:
              player.stats
                .stumpings,
          },
          {
            onConflict:
              "player_id,team_season_id",
          }
        );

      if (
        statsError
      ) {
        throw statsError;
      }
    }
  }
}

async function verifyImport() {
  for (
    const table of [
      "seasons",
      "teams",
      "team_seasons",
      "players",
      "player_roles",
      "player_season_stats",
    ]
  ) {
    const {
      count,
      error,
    } = await supabase
      .from(table)
      .select(
        "*",
        {
          count:
            "exact",
          head: true,
        }
      );

    if (error) {
      throw error;
    }

    console.log(
      `[WORLD IMPORT] ${table}: ${count ?? 0}`
    );
  }
}

async function main() {
  console.log(
    "[WORLD IMPORT] Starting."
  );

  console.log(
    `[WORLD IMPORT] Editions: ${WORLD_AVAILABLE_EDITION_YEARS.join(
      ", "
    )}`
  );

  for (
    const year of
      WORLD_AVAILABLE_EDITION_YEARS
  ) {
    const season =
      readSeason(
        year
      );

    await upsertSeason(
      season
    );

    console.log(
      `[WORLD IMPORT] Imported ${year}.`
    );
  }

  await verifyImport();

  console.log(
    "[WORLD IMPORT] Successful."
  );
}

main().catch(
  (error) => {
    console.error(
      "[WORLD IMPORT] Failed:",
      error
    );

    process.exit(
      1
    );
  }
);