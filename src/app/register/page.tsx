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

  if (error.includes("password")) {
    return "Your password doesn't meet the required security requirements. Please choose a stronger password.";
  }

  if (error.includes("invalid email")) {
    return "Please enter a valid email address.";
  }

  if (
    error.includes("too many requests") ||
    error.includes("rate limit")
  ) {
    return "Too many attempts. Please wait a moment before trying again.";
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
       * This is where Supabase should send the user
       * after they click the confirmation email.
       *
       * Example:
       *
       * localhost:
       * http://localhost:3000/auth/callback?next=/email-confirmed
       *
       * production:
       * https://build-your-xi.vercel.app/auth/callback?next=/email-confirmed
       */
      const emailRedirectTo =
        `${window.location.origin}/auth/callback?next=/email-confirmed`;

      /*
       * ==========================================
       * CHECK FOR AN EXISTING SESSION
       * ==========================================
       *
       * A normal visitor will not have a session.
       *
       * That is completely normal and should NOT
       * prevent registration.
       *
       * Anonymous guests will have a valid session.
       */
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      /*
       * AuthSessionMissingError is expected when
       * someone visits the register page normally.
       *
       * Only throw other unexpected errors.
       */
      if (
        userError &&
        userError.name !== "AuthSessionMissingError"
      ) {
        throw userError;
      }

      /*
       * ==========================================
       * GUEST → REGISTERED ACCOUNT
       * ==========================================
       *
       * Upgrade the SAME anonymous Supabase user.
       *
       * This preserves:
       *
       * - User ID
       * - Future gameplay
       * - Scores
       * - Challenge relationships
       */
      if (user?.is_anonymous) {
        const {
          data: updateData,
          error: updateError,
        } = await supabase.auth.updateUser(
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
         * Create or update the user's public profile.
         *
         * The anonymous user is authenticated,
         * so your authenticated RLS policies apply.
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
                updated_at: new Date().toISOString(),
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
            "Your account was updated, but we couldn't save your profile details. Please try again."
          );

          setLoading(false);
          return;
        }

        /*
         * If the email still requires confirmation,
         * keep the user on this page and show the
         * confirmation message.
         */
        if (!updateData.user?.email_confirmed_at) {
          setMessage(
            "Your account has been upgraded! Please check your email and confirm your address."
          );

          setLoading(false);
          return;
        }

        /*
         * In case email confirmation is disabled.
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

      const {
        data,
        error: signUpError,
      } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            gamer_tag: gamerTag,
          },

          /*
           * IMPORTANT:
           *
           * For signUp(), emailRedirectTo belongs
           * inside the options object.
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
       * If a session exists, the user can immediately
       * write their profile using the authenticated
       * RLS policy.
       *
       * This normally happens when email confirmation
       * is disabled.
       */
      if (data.session) {
        const { error: profileError } =
          await supabase
            .from("profiles")
            .upsert(
              {
                id: data.user.id,
                display_name: displayName,
                gamer_tag: gamerTag,
                email,
                updated_at: new Date().toISOString(),
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
         * User is immediately authenticated.
         */
        router.push("/home");
        router.refresh();

        return;
      }

      /*
       * ==========================================
       * EMAIL CONFIRMATION ENABLED
       * ==========================================
       *
       * With email confirmation enabled, Supabase
       * normally returns:
       *
       * data.user    → exists
       * data.session → null
       *
       * This is expected.
       *
       * The confirmation email contains the callback
       * redirect configured above.
       */
      setMessage(
        "Account created! Please check your email and confirm your account before logging in."
      );

      setLoading(false);
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
          {/* DISPLAY NAME */}

          <input
            type="text"
            placeholder="Display name"
            value={displayName}
            onChange={(event) =>
              setDisplayName(event.target.value)
            }
            required
          />

          {/* GAMER TAG */}

          <input
            type="text"
            placeholder="Gamer tag"
            value={gamerTag}
            onChange={(event) =>
              setGamerTag(event.target.value)
            }
            required
          />

          {/* EMAIL */}

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />

          {/* PASSWORD */}

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            minLength={6}
            required
          />

          {/* ERROR */}

          {error && (
            <p className="text-sm text-red-400">
              {error}
            </p>
          )}

          {/* SUCCESS MESSAGE */}

          {message && (
            <p className="text-sm text-green-400">
              {message}
            </p>
          )}

          {/* SUBMIT */}

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