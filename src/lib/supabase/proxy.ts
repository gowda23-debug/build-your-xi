import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  /*
   * Get and validate the current authenticated user.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

//   console.log("PROXY AUTH CHECK:", {
//   pathname,
//   userId: user?.id ?? null,
//   email: user?.email ?? null,
// });
  /*
   * Routes that require authentication.
   *
   * Anonymous guest users also have a valid Supabase user,
   * so they can access these routes.
   */
  const protectedRoutes = [
    "/home",
    "/ipl-challenge",
  ];

  const isProtectedRoute = protectedRoutes.some(
    (route) =>
      pathname === route || pathname.startsWith(`${route}/`)
  );

  /*
   * Logged-out users cannot access protected routes.
   */
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();

    url.pathname = "/";
    url.search = "";

    return NextResponse.redirect(url);
  }

  /*
   * Logged-in users should not access authentication pages.
   */
  const authRoutes = [
    "/login",
    "/register",
  ];

  const isAuthRoute = authRoutes.includes(pathname);

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();

    url.pathname = "/home";
    url.search = "";

    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}