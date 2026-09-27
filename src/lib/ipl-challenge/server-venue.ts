import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  IPLVenue,
  PitchProfile,
  PitchType,
} from "@/types/ipl";

type VenueRow = {
  id: string;
  name: string;
  city: string | null;
  country: string;
  pitch_type: PitchType;
  pitch_title: string;
  pitch_summary: string;
  batting_factor: number;
  pace_factor: number;
  spin_factor: number;
  dew_factor: number;
};

type VenueLinkRow = {
  venue_id: string;
  match_count: number;
  venue: VenueRow;
};

const STRATEGIES: Record<PitchType, string> = {
  BAT: "Prioritise aggressive top-order batting and players who can score quickly without losing wickets.",
  PACE: "Value batters who handle pace and bowlers who can exploit carry, bounce or seam.",
  SPIN: "Prioritise quality spin options and batters capable of rotating the strike against slower bowling.",
  BALANCED: "Build a flexible XI that can adapt to both batting and bowling conditions.",
};

function normalizeVenue(row: VenueRow): IPLVenue {
  const pitch: PitchProfile = {
    id: row.id,
    title: row.pitch_title,
    type: row.pitch_type,
    summary: row.pitch_summary,
    batting: Number(row.batting_factor),
    pace: Number(row.pace_factor),
    spin: Number(row.spin_factor),
    dew: Number(row.dew_factor),
    strategy: STRATEGIES[row.pitch_type],
  };

  return {
    id: row.id,
    name: row.name,
    city: row.city,
    country: row.country,
    pitch,
  };
}

export async function getRandomVenueForTeamSeason(
  teamSeasonId: string,
): Promise<IPLVenue | null> {
  const { data, error } = await supabaseAdmin
    .from("ipl_team_season_venues")
    .select(`
      venue_id,
      match_count,
      venue:ipl_venues (
        id,
        name,
        city,
        country,
        pitch_type,
        pitch_title,
        pitch_summary,
        batting_factor,
        pace_factor,
        spin_factor,
        dew_factor
      )
    `)
    .eq("team_season_id", teamSeasonId);

  if (error) {
    throw error;
  }

  const rows = (data ?? [])
    .map((row) => {
      const venue = Array.isArray(row.venue)
        ? row.venue[0]
        : row.venue;

      if (!venue) {
        return null;
      }

      return {
        venue_id: row.venue_id,
        match_count: Math.max(
          1,
          Number(row.match_count ?? 1),
        ),
        venue,
      };
    })
    .filter(
      (
        row,
      ): row is {
        venue_id: string;
        match_count: number;
        venue: VenueRow;
      } => row !== null,
    );

  if (rows.length === 0) {
    return null;
  }

  const totalWeight = rows.reduce(
    (sum, row) => sum + row.match_count,
    0,
  );

  let target = randomInt(totalWeight);

  for (const row of rows) {
    if (target < row.match_count) {
      return normalizeVenue(row.venue);
    }

    target -= row.match_count;
  }

  return normalizeVenue(rows[rows.length - 1].venue);
}