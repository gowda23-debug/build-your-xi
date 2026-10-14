import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// world_editions is introduced by the World pipeline migration and may not yet
// be present in the project's generated Supabase Database type.
const worldDb = supabaseAdmin as unknown as SupabaseClient;

type WorldEditionRow = {
  id: string;
  year: number;
  season_name: string;
  overs_per_innings: 50 | 60;
};

export async function GET() {
  try {
    const { error: authError } = await requireUser();
    if (authError) return authError;

    const { data, error } = await worldDb
      .from("world_editions")
      .select("id,year,season_name,overs_per_innings")
      .eq("status", "published")
      .order("year", { ascending: true })
      .returns<WorldEditionRow[]>();

    if (error) {
      console.error("World editions query failed:", error.message);
      return NextResponse.json(
        { error: "Unable to load published World Cup editions." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      editions: (data ?? []).map((edition) => ({
        id: edition.id,
        year: edition.year,
        seasonName: edition.season_name,
        oversPerInnings: edition.overs_per_innings,
      })),
    });
  } catch (error) {
    console.error("World editions endpoint failed:", error);
    return NextResponse.json(
      { error: "Unable to load published World Cup editions." },
      { status: 500 },
    );
  }
}
