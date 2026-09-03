"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    const { error } =
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

    if (error) {
      setError(
        "We couldn't send a password reset link. Please try again."
      );
      setLoading(false);
      return;
    }

    // Intentionally generic to avoid revealing account existence.
    setMessage(
      "If an account exists with this email, a password reset link has been sent."
    );

    setLoading(false);
  }

  return (
    <main className="grid min-h-screen place-items-center grid-bg px-6">
      <section className="card w-full max-w-md p-8">
        <Link
          href="/login"
          className="text-sm font-black text-[var(--accent)]"
        >
          ← Back to Login
        </Link>

        <h1 className="mt-8 text-3xl font-black">
          Forgot Password?
        </h1>

        <p className="mt-3 leading-7 text-[var(--muted)]">
          Enter your email address and we'll send you a link
          to reset your password.
        </p>

        <form
          onSubmit={handleReset}
          className="mt-8 space-y-4"
        >
          <div>
            <label className="mb-2 block text-sm text-[var(--muted)]">
              Email address
            </label>

            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">
              {error}
            </p>
          )}

          {message && (
            <p className="text-sm text-green-400">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading
              ? "Sending..."
              : "Send reset link"}
          </button>
        </form>

        <Link
          href="/login"
          className="mt-6 block text-center text-sm font-medium text-[var(--accent)] hover:underline"
        >
          Back to login
        </Link>
      </section>
    </main>
  );
}