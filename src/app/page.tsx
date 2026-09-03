"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Trophy, Users, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LandingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState("");

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
    <main className="min-h-screen grid-bg px-6 py-6 md:px-12">
      <nav className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="text-xl font-black tracking-tight">
          BUILD YOUR <span className="text-[var(--accent)]">XI</span>
        </div>

        <div className="flex gap-3">
          <Link className="btn btn-secondary" href="/login">
            Log in
          </Link>

          <Link className="btn btn-primary" href="/register">
            Sign up
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-7xl gap-12 py-20 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/5 px-4 py-2 text-sm text-[var(--muted)]">
            <Zap size={15} className="text-[var(--accent2)]" />
            A cricket strategy game
          </div>

          <h1 className="max-w-4xl text-5xl font-black leading-[.95] tracking-tight md:text-7xl">
            ADAPT TO THE PITCH.
            <br />
            <span className="text-[var(--accent)]">BUILD YOUR XI.</span>
            <br />
            CONQUER THE RUN.
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            Spin the conditions. Accept the squad fate. Study the players.
            Build your strongest Playing XI and survive the ultimate undefeated
            cricket challenge.
          </p>

          <div className="mt-9 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={guestLoading}
              className="btn btn-primary"
            >
              {guestLoading ? "Starting..." : "Play as Guest"}
              <ArrowRight size={18} />
            </button>

            <Link className="btn btn-secondary" href="/register">
              Create account
            </Link>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="mt-12 grid max-w-2xl grid-cols-3 gap-3">
            <Stat
              icon={<Trophy />}
              title="14–0"
              text="One loss ends the run"
            />
            <Stat
              icon={<Users />}
              title="Build 11"
              text="Every choice matters"
            />
            <Stat
              icon={<Zap />}
              title="3 Respins"
              text="Use them wisely"
            />
          </div>
        </div>

        <div className="card overflow-hidden p-6 shadow-2xl shadow-black/30">
          <div className="flex items-center justify-between text-sm text-[var(--muted)]">
            <span>FEATURED CHALLENGE</span>

            <span className="rounded-full bg-[var(--accent)]/15 px-3 py-1 text-[var(--accent)]">
              LIVE SOON
            </span>
          </div>

          <div className="mt-7 rounded-[28px] border border-white/10 bg-gradient-to-br from-[#1d4d35] to-[#081610] p-8">
            <div className="text-sm font-bold tracking-[.2em] text-[var(--accent2)]">
              THE LAUNCH RUN
            </div>

            <div className="mt-3 text-5xl font-black">14–0</div>

            <div className="mt-2 text-xl font-bold">CHALLENGE</div>

            <p className="mt-5 text-[var(--muted)]">
              Random pitch. Random team. Random season. Your strategy decides
              what happens next.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
              <Mini label="Pitch" value="Random" />
              <Mini label="Respins" value="3 Total" />
              <Mini label="Squad" value="Team + Year" />
              <Mini label="Goal" value="14 Wins" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[var(--accent)]">{icon}</div>
      <div className="mt-3 text-lg font-black">{title}</div>
      <div className="text-xs text-[var(--muted)]">{text}</div>
    </div>
  );
}

function Mini({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-black/20 p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-1 font-bold">{value}</div>
    </div>
  );
}