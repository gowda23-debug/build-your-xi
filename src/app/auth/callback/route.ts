import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");

  /*
   * After a successful email confirmation,
   * show the confirmation success page.
   */
  const next =
    searchParams.get("next") ?? "/email-confirmed";

  if (code) {
    const supabase = await createClient();

    const { error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      /*
       * Prevent redirects to external websites.
       */
      const redirectPath =
        next.startsWith("/") && !next.startsWith("//")
          ? next
          : "/email-confirmed";

      return NextResponse.redirect(
        `${origin}${redirectPath}`
      );
    }

    console.error(
      "Email confirmation error:",
      error.message
    );
  } else {
    console.error(
      "Email confirmation error: No confirmation code received."
    );
  }

  return NextResponse.redirect(
    `${origin}/login?error=confirmation_failed`
  );
}