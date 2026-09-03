"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkRecoverySession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError(
          "This password reset link is invalid or has expired. Please request a new one."
        );
      }

      setChecking(false);
    }

    checkRecoverySession();
  }, [supabase]);

  async function handleReset(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (newPassword.length < 6) {
      setError(
        "Your password must be at least 6 characters long."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } =
      await supabase.auth.updateUser({
        password: newPassword,
      });

    if (error) {
      setError(
        "We couldn't reset your password. The link may have expired."
      );
      setLoading(false);
      return;
    }

    setMessage(
      "Your password has been reset successfully. Redirecting to login..."
    );

    setTimeout(() => {
      router.replace("/login");
    }, 2000);
  }

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center grid-bg">
        <p className="text-sm text-[var(--muted)]">
          Verifying reset link...
        </p>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center grid-bg px-6">
      <section className="card w-full max-w-md p-8">
        <Link
          href="/login"
          className="text-sm font-black text-[var(--accent)]"
        >
          ← BUILD YOUR XI
        </Link>

        <h1 className="mt-8 text-3xl font-black">
          Reset Password
        </h1>

        <p className="mt-3 text-[var(--muted)]">
          Choose a new password for your account.
        </p>

        <form
          onSubmit={handleReset}
          className="mt-8 space-y-4"
        >
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(event) =>
              setNewPassword(event.target.value)
            }
            minLength={6}
            required
          />

          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(event.target.value)
            }
            minLength={6}
            required
          />

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
            disabled={loading || Boolean(error && !newPassword)}
            className="btn btn-primary w-full"
          >
            {loading
              ? "Updating password..."
              : "Update Password"}
          </button>
        </form>
      </section>
    </main>
  );
}