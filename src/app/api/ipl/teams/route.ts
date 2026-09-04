import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { error: authError } =
      await requireUser();

    if (authError) {
      return authError;
    }

    const { data: teams, error } =
      await supabaseAdmin
        .from("ipl_teams")
        .select("id, name")
        .order("name", {
          ascending: true,
        });

    if (error) {
      console.error(
        "IPL teams query error:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Unable to load IPL teams.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      teams: teams ?? [],
    });
  } catch (error) {
    console.error(
      "IPL teams endpoint error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while loading IPL teams.",
      },
      {
        status: 500,
      }
    );
  }
}