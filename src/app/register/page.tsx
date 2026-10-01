"use client";

import Link from "next/link";
import {
  FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function getRegisterErrorMessage(
  message: string
) {
  const error =
    message.toLowerCase();

  if (
    error.includes(
      "already registered"
    ) ||
    error.includes(
      "user already registered"
    )
  ) {
    return "An account with this email already exists. Try logging in instead.";
  }

  if (
    error.includes(
      "too many requests"
    )
  ) {
    return "Too many attempts. Please wait a moment before trying again.";
  }

  if (
    error.includes("password")
  ) {
    return "Your password doesn't meet the required security requirements. Please choose a stronger password.";
  }

  if (
    error.includes("email")
  ) {
    return "Please enter a valid email address.";
  }

  if (
    error.includes("network")
  ) {
    return "Connection problem. Please check your internet connection and try again.";
  }

  return "We couldn't create your account right now. Please try again.";
}

function getSafeNextPath() {
  if (
    typeof window ===
    "undefined"
  ) {
    return "/home";
  }

  const next =
    new URLSearchParams(
      window.location.search
    ).get("next");

  /*
   * Only allow internal paths.
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

function getEmailRedirectTo() {
  const next =
    getSafeNextPath();

  return (
    `${window.location.origin}` +
    `/auth/callback?next=${encodeURIComponent(
      next
    )}`
  );
}

export default function Register() {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] =
    useState("");

  const [gamerTag, setGamerTag] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  async function handleRegister(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      /*
       * ============================================================
       * GET CURRENT USER
       * ============================================================
       */

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser();

      const hasMissingSession =
        userError?.name ===
        "AuthSessionMissingError";

      if (
        userError &&
        !hasMissingSession
      ) {
        throw userError;
      }

      /*
       * Preserve the challenge path
       * through email confirmation.
       */

      const emailRedirectTo =
        getEmailRedirectTo();

      /*
       * ============================================================
       * ANONYMOUS GUEST → REGISTERED ACCOUNT
       * ============================================================
       *
       * This keeps the existing anonymous
       * user's Supabase ID.
       */

      if (
        user?.is_anonymous
      ) {
        const {
          data,
          error: updateError,
        } =
          await supabase.auth.updateUser(
            {
              email,
              password,

              data: {
                display_name:
                  displayName,

                gamer_tag:
                  gamerTag,
              },
            },
            {
              emailRedirectTo,
            }
          );

        if (updateError) {
          setError(
            getRegisterErrorMessage(
              updateError.message
            )
          );

          setLoading(false);
          return;
        }

        /*
         * Save public profile information.
         */

        const {
          error: profileError,
        } =
          await supabase
            .from("profiles")
            .upsert(
              {
                id:
                  user.id,

                display_name:
                  displayName,

                gamer_tag:
                  gamerTag,

                email,

                updated_at:
                  new Date().toISOString(),
              },
              {
                onConflict:
                  "id",
              }
            );

        if (profileError) {
          console.error(
            "Profile update error:",
            profileError
          );

          setError(
            "Your account was created, but we couldn't save your profile details. Please try updating your profile."
          );

          setLoading(false);
          return;
        }

        /*
         * Email confirmation may still be required.
         */

        if (
          !data.user
            ?.email_confirmed_at
        ) {
          setMessage(
            "Your account has been upgraded! Please check your email and confirm your address."
          );

          setLoading(false);
          return;
        }

        router.push(
          getSafeNextPath()
        );

        router.refresh();

        return;
      }

      /*
       * ============================================================
       * NORMAL NEW USER
       * ============================================================
       */

      const {
        data,
        error: signUpError,
      } =
        await supabase.auth.signUp(
          {
            email,
            password,

            options: {
              data: {
                display_name:
                  displayName,

                gamer_tag:
                  gamerTag,
              },

              emailRedirectTo,
            },
          }
        );

      if (signUpError) {
        setError(
          getRegisterErrorMessage(
            signUpError.message
          )
        );

        setLoading(false);
        return;
      }

      if (!data.user) {
        setError(
          "We couldn't create your account. Please try again."
        );

        setLoading(false);
        return;
      }

      /*
       * Create public profile.
       */

      const {
        error: profileError,
      } =
        await supabase
          .from("profiles")
          .upsert(
            {
              id:
                data.user.id,

              display_name:
                displayName,

              gamer_tag:
                gamerTag,

              email,

              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                "id",
            }
          );

      if (profileError) {
        console.error(
          "Profile creation error:",
          profileError
        );

        setError(
          "Your account was created, but we couldn't save your profile details. Please contact support if this problem continues."
        );

        setLoading(false);
        return;
      }

      /*
       * ============================================================
       * EMAIL CONFIRMATION
       * ============================================================
       */

      if (!data.session) {
        setMessage(
          "Account created! Please check your email and confirm your account. After confirmation, you'll be returned to your challenge."
        );

        setLoading(false);
        return;
      }

      /*
       * ============================================================
       * ALREADY AUTHENTICATED
       * ============================================================
       */

      router.push(
        getSafeNextPath()
      );

      router.refresh();
    } catch (err) {
      console.error(
        "Registration error:",
        err
      );

      setError(
        "Something went wrong while creating your account. Please try again."
      );

      setLoading(false);
    }
  }

  const nextPath =
    getSafeNextPath();

  return (
    <main className="grid min-h-screen place-items-center grid-bg px-6">
      <section className="card w-full max-w-md p-8">
        <Link
          href="/"
          className="text-sm font-black text-[var(--accent)]"
        >
          ← BUILD YOUR XI
        </Link>

        <h1 className="mt-8 text-3xl font-black">
          Create your account
        </h1>

        <p className="mt-2 text-[var(--muted)]">
          Save your progress, compete and
          build your record.
        </p>

        <form
          onSubmit={
            handleRegister
          }
          className="mt-8 space-y-4"
        >
          <input
            type="text"
            placeholder="Display name"
            value={
              displayName
            }
            onChange={(event) =>
              setDisplayName(
                event.target.value
              )
            }
            disabled={loading}
            required
          />

          <input
            type="text"
            placeholder="Gamer tag"
            value={
              gamerTag
            }
            onChange={(event) =>
              setGamerTag(
                event.target.value
              )
            }
            disabled={loading}
            required
          />

          <input
            type="email"
            placeholder="Email address"
            value={
              email
            }
            onChange={(event) =>
              setEmail(
                event.target.value
              )
            }
            disabled={loading}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={
              password
            }
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            disabled={loading}
            minLength={6}
            required
          />

          {error && (
            <p
              role="alert"
              className="text-sm text-red-400"
            >
              {error}
            </p>
          )}

          {message && (
            <p
              role="status"
              className="text-sm text-green-400"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading
              ? "Creating account..."
              : "Create account"}
          </button>
        </form>

        {nextPath !==
          "/home" && (
          <p className="mt-4 text-center text-xs text-[var(--muted)]">
            After registration, you'll
            return to your challenge.
          </p>
        )}

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          Already playing?{" "}

          <Link
            href={`/login?next=${encodeURIComponent(
              nextPath
            )}`}
            className="font-bold text-[var(--accent)]"
          >
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}