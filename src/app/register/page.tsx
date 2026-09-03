"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function getRegisterErrorMessage(message: string) {
  const error = message.toLowerCase();

  if (
    error.includes("already registered") ||
    error.includes("user already registered")
  ) {
    return "An account with this email already exists. Try logging in instead.";
  }

  if (error.includes("too many requests")) {
    return "Too many attempts. Please wait a moment before trying again.";
  }

  if (error.includes("password")) {
    return "Your password doesn't meet the required security requirements. Please choose a stronger password.";
  }

  if (error.includes("email")) {
    return "Please enter a valid email address.";
  }

  if (error.includes("network")) {
    return "Connection problem. Please check your internet connection and try again.";
  }

  return "We couldn't create your account right now. Please try again.";
}

export default function Register() {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] = useState("");
  const [gamerTag, setGamerTag] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleRegister(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      /*
       * ==========================================
       * GET CURRENT USER
       * ==========================================
       *
       * A visitor may be:
       *
       * 1. A logged-out visitor
       * 2. An anonymous guest
       * 3. A registered user
       *
       * getUser() can return AuthSessionMissingError
       * when there is no current session.
       *
       * That is NOT a registration failure.
       */
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      /*
       * Ignore missing-session errors.
       *
       * A visitor without a session is simply
       * registering as a normal new user.
       */
      const hasMissingSession =
        userError?.name === "AuthSessionMissingError";

      if (userError && !hasMissingSession) {
        throw userError;
      }

      /*
       * Build the confirmation callback URL.
       *
       * Automatically works for:
       *
       * Local:
       * http://localhost:3000
       *
       * Production:
       * https://build-your-xi.vercel.app
       */
      const emailRedirectTo =
        `${window.location.origin}` +
        "/auth/callback?next=/email-confirmed";

      /*
       * ==========================================
       * ANONYMOUS GUEST → REGISTERED ACCOUNT
       * ==========================================
       *
       * Upgrade the existing Supabase user.
       *
       * This preserves the user's ID and any
       * gameplay/stat relationships.
       */
      if (user?.is_anonymous) {
        const { data, error: updateError } =
          await supabase.auth.updateUser(
            {
              email,
              password,
              data: {
                display_name: displayName,
                gamer_tag: gamerTag,
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
         * Save the user's public profile.
         */
        const { error: profileError } =
          await supabase
            .from("profiles")
            .upsert(
              {
                id: user.id,
                display_name: displayName,
                gamer_tag: gamerTag,
                email,
                updated_at:
                  new Date().toISOString(),
              },
              {
                onConflict: "id",
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
         * If email confirmation is required,
         * Supabase may not have a confirmed email yet.
         */
        if (!data.user?.email_confirmed_at) {
          setMessage(
            "Your account has been upgraded! Please check your email and confirm your address."
          );

          setLoading(false);
          return;
        }

        /*
         * If immediately authenticated,
         * send the user home.
         */
        router.push("/home");
        router.refresh();

        return;
      }

      /*
       * ==========================================
       * NORMAL NEW USER
       * ==========================================
       */

      const { data, error: signUpError } =
        await supabase.auth.signUp({
          email,
          password,

          options: {
            data: {
              display_name: displayName,
              gamer_tag: gamerTag,
            },

            /*
             * After the user clicks the
             * confirmation email, Supabase
             * sends them to our callback.
             *
             * The callback exchanges the code
             * for a session and redirects to:
             *
             * /email-confirmed
             */
            emailRedirectTo,
          },
        });

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
       * Create the public profile.
       *
       * If email confirmation is enabled,
       * there may not yet be a browser
       * session depending on the Supabase
       * authentication configuration.
       *
       * The profile RLS policy must allow
       * this insert only when auth.uid()
       * matches the user's ID.
       */
      const { error: profileError } =
        await supabase
          .from("profiles")
          .upsert(
            {
              id: data.user.id,
              display_name: displayName,
              gamer_tag: gamerTag,
              email,
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict: "id",
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
       * Email confirmation is enabled.
       *
       * Supabase does not provide an active
       * session until the user confirms their
       * email.
       */
      if (!data.session) {
        setMessage(
          "Account created! Please check your email and confirm your account before logging in."
        );

        setLoading(false);
        return;
      }

      /*
       * Email confirmation is disabled.
       *
       * User is immediately authenticated.
       */
      router.push("/home");
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
          Save your progress, compete and build your record.
        </p>

        <form
          onSubmit={handleRegister}
          className="mt-8 space-y-4"
        >
          <input
            type="text"
            placeholder="Display name"
            value={displayName}
            onChange={(event) =>
              setDisplayName(event.target.value)
            }
            disabled={loading}
            required
          />

          <input
            type="text"
            placeholder="Gamer tag"
            value={gamerTag}
            onChange={(event) =>
              setGamerTag(event.target.value)
            }
            disabled={loading}
            required
          />

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            disabled={loading}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
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

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          Already playing?{" "}
          <Link
            href="/login"
            className="font-bold text-[var(--accent)]"
          >
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}