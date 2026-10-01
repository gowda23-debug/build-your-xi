"use client";

import Link from "next/link";
import {
  FormEvent,
  Suspense,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Users } from "lucide-react";

function getLoginErrorMessage(
  message: string
) {
  const error =
    message.toLowerCase();

  if (
    error.includes(
      "invalid login credentials"
    ) ||
    error.includes(
      "invalid credentials"
    )
  ) {
    return "We couldn't find an account with that email and password.";
  }

  if (
    error.includes(
      "email not confirmed"
    )
  ) {
    return "Please confirm your email before logging in. Check your inbox for the confirmation link.";
  }

  if (
    error.includes(
      "too many requests"
    )
  ) {
    return "Too many login attempts. Please wait a moment and try again.";
  }

  if (
    error.includes("network")
  ) {
    return "Connection problem. Please check your internet connection and try again.";
  }

  return "We couldn't log you in right now. Please check your details and try again.";
}

function getSafeNextPath(
  next: string | null
) {
  /*
   * Only allow internal paths.
   *
   * This prevents an attacker from turning
   * ?next= into an external redirect such as:
   *
   * https://malicious-site.com
   */

  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//")
  ) {
    return next;
  }

  return "/home";
}

/*
 * ============================================================
 * LOGIN CONTENT
 * ============================================================
 *
 * This component is intentionally rendered inside Suspense
 * because it uses useSearchParams().
 */

function LoginContent() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const supabase =
    createClient();

  const nextPath =
    getSafeNextPath(
      searchParams.get(
        "next"
      )
    );

  const isChallengeLogin =
    nextPath.startsWith(
      "/challenges/"
    );

  const [email, setEmail] =
    useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    guestLoading,
    setGuestLoading,
  ] = useState(false);

  const [error, setError] =
    useState("");

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const {
      error: loginError,
    } =
      await supabase.auth.signInWithPassword(
        {
          email,
          password,
        }
      );

    if (loginError) {
      setError(
        getLoginErrorMessage(
          loginError.message
        )
      );

      setLoading(false);
      return;
    }

    /*
     * Return the user to the page that
     * originally required authentication.
     *
     * Example:
     *
     * /login?next=/challenges/251348BA
     *
     * becomes:
     *
     * /challenges/251348BA
     */

    router.push(
      nextPath
    );

    router.refresh();
  }

  async function handleGuestLogin() {
    setError("");
    setGuestLoading(true);

    const {
      error: guestError,
    } =
      await supabase.auth.signInAnonymously();

    if (guestError) {
      setError(
        "We couldn't start a guest session right now. Please check your connection and try again."
      );

      setGuestLoading(false);
      return;
    }

    /*
     * Guest mode is not allowed for challenges.
     *
     * The button is hidden for challenge login,
     * but keeping this redirect safe means the
     * behavior remains correct if this function
     * is ever called from another flow.
     */

    if (isChallengeLogin) {
      router.push(
        `/register?next=${encodeURIComponent(
          nextPath
        )}`
      );

      router.refresh();
      return;
    }

    router.push(
      "/home"
    );

    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center grid-bg px-6">
      <section className="card w-full max-w-md p-8">
        <Link
          href="/"
          className="text-sm font-black text-[var(--accent)]"
        >
          ← BUILD YOUR XI
        </Link>

        {/*
         * ============================================================
         * CHALLENGE CONTEXT
         * ============================================================
         */}

        {isChallengeLogin && (
          <div className="mt-8 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent)]/10">
                <Users className="h-5 w-5 text-[var(--accent)]" />
              </div>

              <div>
                <p className="text-sm font-black text-[var(--accent)]">
                  You&apos;ve been challenged!
                </p>

                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Challenges are for registered
                  players. Log in to continue
                  playing, or create an account
                  to join the challenge.
                </p>
              </div>
            </div>
          </div>
        )}

        <h1
          className={`text-3xl font-black ${
            isChallengeLogin
              ? "mt-7"
              : "mt-8"
          }`}
        >
          Welcome back
        </h1>

        <p className="mt-2 text-[var(--muted)]">
          {isChallengeLogin
            ? "Log in to continue to your challenge."
            : "Continue your Build Your XI journey."}
        </p>

        <form
          onSubmit={handleLogin}
          className="mt-8 space-y-4"
        >
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) =>
              setEmail(
                event.target.value
              )
            }
            disabled={
              loading ||
              guestLoading
            }
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            disabled={
              loading ||
              guestLoading
            }
            required
          />

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-[var(--accent)] hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-400"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              guestLoading
            }
            className="btn btn-primary w-full"
          >
            {loading
              ? "Logging in..."
              : "Log in"}
          </button>
        </form>

        {/*
         * ============================================================
         * GUEST LOGIN
         * ============================================================
         *
         * Guest mode remains available for normal
         * Build Your XI gameplay.
         *
         * It is intentionally hidden for challenge
         * authentication because challenges require
         * a registered account.
         */}

        {!isChallengeLogin && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-[var(--muted)]">
              <span className="h-px flex-1 bg-white/10" />

              OR

              <span className="h-px flex-1 bg-white/10" />
            </div>

            <button
              type="button"
              onClick={
                handleGuestLogin
              }
              disabled={
                loading ||
                guestLoading
              }
              className="btn btn-secondary w-full"
            >
              {guestLoading
                ? "Starting game..."
                : "Continue as Guest"}
            </button>
          </>
        )}

        {/*
         * ============================================================
         * REGISTRATION
         * ============================================================
         */}

        <div
          className={`text-center ${
            isChallengeLogin
              ? "mt-8"
              : "mt-6"
          }`}
        >
          {isChallengeLogin && (
            <p className="mb-3 text-sm text-[var(--muted)]">
              Don&apos;t have an account yet?
            </p>
          )}

          <Link
            href={`/register?next=${encodeURIComponent(
              nextPath
            )}`}
            className="font-bold text-[var(--accent)] hover:underline"
          >
            {isChallengeLogin
              ? "Create an account to play"
              : "Create an account"}
          </Link>
        </div>
      </section>
    </main>
  );
}

/*
 * ============================================================
 * PAGE
 * ============================================================
 *
 * useSearchParams() is inside LoginContent, which is now
 * safely wrapped by Suspense.
 */

export default function Login() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center grid-bg px-6">
          <section className="card w-full max-w-md p-8 text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />

            <p className="mt-4 text-sm font-bold">
              Loading login...
            </p>
          </section>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}