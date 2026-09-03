import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");

  const next =
    searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await createClient();

    const { error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const redirectPath = next.startsWith("/")
        ? next
        : "/home";

      return NextResponse.redirect(
        `${origin}${redirectPath}`
      );
    }

    console.error(
      "Email confirmation error:",
      error.message
    );
  }

  return NextResponse.redirect(
    `${origin}/login?error=confirmation_failed`
  );
}