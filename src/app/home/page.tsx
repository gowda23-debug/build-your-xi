"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  Globe2,
  Swords,
  Trophy,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // If there is no logged-in user or guest session,
      // send them back to the landing/login page.
      if (!user) {
        router.replace("/");
        return;
      }

      setLoading(false);
    };

    checkUser();
  }, [router, supabase]);

  // Prevent the page from appearing before authentication is checked
  if (loading) {
    return (
      <main className="flex flex-1" />
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      {/* =========================
          HOME CONTENT
      ========================= */}

      <section className="relative flex flex-1 overflow-hidden">
        {/* Background decoration */}

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[var(--accent)]/[0.04] blur-3xl" />

          <div className="absolute -bottom-64 -right-64 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.03] blur-3xl" />
        </div>

        <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-5 py-4 md:px-10 md:py-5">
          
          {/* =========================
              HERO
          ========================= */}

          <div className="mx-auto max-w-3xl -mt-12 text-center md:-mt-10">
            <h1 className="mt-10 text-4xl font-black leading-tight tracking-tight sm:text-5xl md:text-6xl">
              Can you build the{" "}
              <span className="text-[var(--accent)]">
                perfect XI?
              </span>
            </h1>

            <p className="mx-auto mt-2 max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
              Test your cricket knowledge, adapt to changing conditions,
              and build the strongest possible Playing XI.
            </p>

            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--accent)]">
                Choose Your Challenge
              </p>

              <div className="mx-auto mt-4 h-px w-24 bg-[var(--accent)]/40" />
            </div>
          </div>

          {/* =========================
              CHALLENGE CARDS
          ========================= */}

          <div className="mt-6 grid gap-5 md:grid-cols-3">

            {/* IPL CHALLENGE */}

            <article className="card group relative flex min-h-[280px] flex-col overflow-hidden p-7 transition duration-300 hover:-translate-y-1 hover:border-[var(--accent)]/50">
              <div className="absolute -right-10 -top-10 text-[10rem] font-black leading-none text-[var(--accent)]/[0.04]">
                XI
              </div>

              <div className="relative flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]">
                  <Trophy size={28} />
                </div>

                <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold text-[var(--accent)]">
                  FEATURED
                </span>
              </div>

              <div className="relative mt-8">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]/80">
                  Play Now
                </p>

                <h2 className="mt-3 text-3xl font-black">
                  IPL Challenge
                </h2>

                <p className="mt-4 leading-7 text-[var(--muted)]">
                  Adapt to the pitch, team and season you are given.
                  Study the conditions and build the strongest possible
                  Playing XI.
                </p>
              </div>

              <Link
                href="/ipl-challenge"
                className="btn btn-primary relative mt-auto inline-flex w-full items-center justify-center gap-2"
              >
                Play Challenge
                <ChevronRight size={19} />
              </Link>
            </article>

            {/* WORLD DOMINATION */}

            <article className="card relative flex min-h-[280px] flex-col overflow-hidden p-7 opacity-80">
              <div className="flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-white/80">
                  <Globe2 size={28} />
                </div>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-[var(--muted)]">
                  COMING SOON
                </span>
              </div>

              <div className="mt-8">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
                  Global Cricket
                </p>

                <h2 className="mt-3 text-3xl font-black">
                  World Domination
                </h2>

                <p className="mt-4 leading-7 text-[var(--muted)]">
                  Take your cricket knowledge beyond the IPL. Build
                  powerful XIs across international teams, tournaments,
                  eras and different conditions.
                </p>
              </div>

              <button
                type="button"
                disabled
                className="btn btn-secondary mt-auto w-full cursor-not-allowed opacity-50"
              >
                Coming Soon
              </button>
            </article>

            {/* 1V1 ONLINE */}

            <article className="card relative flex min-h-[280px] flex-col overflow-hidden p-7 opacity-80">
              <div className="flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-white/80">
                  <Swords size={28} />
                </div>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-[var(--muted)]">
                  COMING SOON
                </span>
              </div>

              <div className="mt-8">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
                  Multiplayer
                </p>

                <h2 className="mt-3 text-3xl font-black">
                  1v1 Online
                </h2>

                <p className="mt-4 leading-7 text-[var(--muted)]">
                  Challenge another player under the same conditions.
                  Build your XI, compare your selections and prove who
                  has the better cricket knowledge.
                </p>
              </div>

              <button
                type="button"
                disabled
                className="btn btn-secondary mt-auto w-full cursor-not-allowed opacity-50"
              >
                Coming Soon
              </button>
            </article>

          </div>
        </div>
      </section>
    </main>
  );
}