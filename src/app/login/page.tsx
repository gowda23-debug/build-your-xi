"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function getLoginErrorMessage(message: string) {
  const error = message.toLowerCase();

  if (
    error.includes("invalid login credentials") ||
    error.includes("invalid credentials")
  ) {
    return "We couldn't find an account with that email and password.";
  }

  if (error.includes("email not confirmed")) {
    return "Please confirm your email before logging in. Check your inbox for the confirmation link.";
  }

  if (error.includes("too many requests")) {
    return "Too many login attempts. Please wait a moment and try again.";
  }

  if (error.includes("network")) {
    return "Connection problem. Please check your internet connection and try again.";
  }

  return "We couldn't log you in right now. Please check your details and try again.";
}

export default function Login() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
  setError(getLoginErrorMessage(error.message));
  setLoading(false);
  return;
}

    router.push("/home");
    router.refresh();
  }

  async function handleGuestLogin() {
    setError("");
    setGuestLoading(true);

    const { error } = await supabase.auth.signInAnonymously();

    if (error) {
  setError(
    "We couldn't start a guest session right now. Please check your connection and try again."
  );

  setGuestLoading(false);
  return;
}

    router.push("/home");
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

        <h1 className="mt-8 text-3xl font-black">Welcome back</h1>

        <p className="mt-2 text-[var(--muted)]">
          Continue your challenge run.
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
            <p className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || guestLoading}
            className="btn btn-primary w-full"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-[var(--muted)]">
          <span className="h-px flex-1 bg-white/10" />
          OR
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          onClick={handleGuestLogin}
          disabled={loading || guestLoading}
          className="btn btn-secondary w-full"
        >
          {guestLoading ? "Starting game..." : "Continue as Guest"}
        </button>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          New to Build Your XI?{" "}
          <Link
            href="/register"
            className="font-bold text-[var(--accent)]"
          >
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}