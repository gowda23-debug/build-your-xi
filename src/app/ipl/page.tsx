"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Pitch = {
  id: string;
  stadium: string;
  city: string;
  type: string;
  description: string;
  batting: number;
  pace: number;
  spin: number;
  dew: string;
};

const pitches: Pitch[] = [
  {
    id: "wankhede",
    stadium: "Wankhede Stadium",
    city: "Mumbai",
    type: "Batting Friendly",
    description:
      "A high-scoring surface with good bounce and pace. Fast bowlers can get assistance early, but batters are rewarded once settled.",
    batting: 92,
    pace: 78,
    spin: 45,
    dew: "High",
  },
  {
    id: "chepauk",
    stadium: "M. A. Chidambaram Stadium",
    city: "Chennai",
    type: "Spin Friendly",
    description:
      "A slower surface where spin and intelligent bowling variations can heavily influence the game.",
    batting: 68,
    pace: 42,
    spin: 94,
    dew: "Medium",
  },
  {
    id: "eden-gardens",
    stadium: "Eden Gardens",
    city: "Kolkata",
    type: "Balanced",
    description:
      "A generally balanced wicket offering opportunities for both batters and bowlers depending on match conditions.",
    batting: 80,
    pace: 70,
    spin: 72,
    dew: "Medium",
  },
  {
    id: "narendra-modi",
    stadium: "Narendra Modi Stadium",
    city: "Ahmedabad",
    type: "Balanced",
    description:
      "A large ground with variable surfaces. Team composition and player adaptability can become extremely important.",
    batting: 76,
    pace: 74,
    spin: 70,
    dew: "Medium",
  },
  {
    id: "sawai-mansingh",
    stadium: "Sawai Mansingh Stadium",
    city: "Jaipur",
    type: "Balanced",
    description:
      "A surface where adaptable players can thrive. Bowlers with variations and batters who rotate strike are valuable.",
    batting: 74,
    pace: 65,
    spin: 78,
    dew: "Low",
  },
];

export default function IPLChallengePage() {
  const router = useRouter();

  const [started, setStarted] = useState(false);
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [loadingPitch, setLoadingPitch] = useState(false);

  function startChallenge() {
    setStarted(true);
    setLoadingPitch(true);
    setPitch(null);

    /*
     * Small delay makes the random selection
     * feel more like part of the game.
     */

    setTimeout(() => {
      const randomPitch =
        pitches[Math.floor(Math.random() * pitches.length)];

      setPitch(randomPitch);
      setLoadingPitch(false);
    }, 900);
  }

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 lg:px-16">

      {/* TOP BAR */}

      <div className="mx-auto flex max-w-7xl items-center justify-between">

        <button
          type="button"
          onClick={() => router.push("/home")}
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--accent)]"
        >
          ← Back to Home
        </button>

        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            Build Your XI
          </p>

          <p className="mt-1 text-sm text-[var(--muted)]">
            IPL Challenge
          </p>
        </div>

      </div>


      {/* INTRO SCREEN */}

      {!started && (
        <section className="mx-auto mt-16 max-w-4xl">

          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 md:p-12">

            <span className="inline-flex rounded-full border border-[var(--accent)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
              Featured Challenge
            </span>


            <div className="mt-10">

              <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">
                Challenge 01
              </p>

              <h1 className="mt-4 text-4xl font-black md:text-6xl">
                IPL Challenge
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">
                Build the strongest possible Playing XI from a
                randomly selected IPL team and season.
              </p>

            </div>


            {/* CHALLENGE FLOW */}

            <div className="mt-12 grid gap-4 md:grid-cols-4">

              <div className="rounded-2xl border border-[var(--border)] p-5">
                <p className="text-xs font-bold text-[var(--accent)]">
                  01
                </p>

                <p className="mt-3 font-semibold">
                  Random Pitch
                </p>
              </div>


              <div className="rounded-2xl border border-[var(--border)] p-5">
                <p className="text-xs font-bold text-[var(--accent)]">
                  02
                </p>

                <p className="mt-3 font-semibold">
                  Spin Team
                </p>
              </div>


              <div className="rounded-2xl border border-[var(--border)] p-5">
                <p className="text-xs font-bold text-[var(--accent)]">
                  03
                </p>

                <p className="mt-3 font-semibold">
                  Spin Season
                </p>
              </div>


              <div className="rounded-2xl border border-[var(--border)] p-5">
                <p className="text-xs font-bold text-[var(--accent)]">
                  04
                </p>

                <p className="mt-3 font-semibold">
                  Build Your XI
                </p>
              </div>

            </div>


            {/* RULES */}

            <div className="mt-10 rounded-2xl border border-[var(--border)] bg-black/10 p-6">

              <h2 className="text-lg font-bold">
                The Challenge Rules
              </h2>

              <ul className="mt-4 space-y-3 text-[var(--muted)]">

                <li>
                  • The pitch is randomly selected by the system.
                </li>

                <li>
                  • Your IPL team and season will be determined by spins.
                </li>

                <li>
                  • You receive 3 strategic respins for either the team or season.
                </li>

                <li>
                  • Pitch conditions should influence your Playing XI.
                </li>

              </ul>

            </div>


            <button
              type="button"
              onClick={startChallenge}
              className="mt-10 inline-flex items-center gap-3 rounded-full bg-[var(--accent)] px-8 py-4 text-lg font-black text-black transition hover:scale-[1.03]"
            >
              Start Challenge
              <span>→</span>
            </button>

          </div>

        </section>
      )}


      {/* PITCH SELECTION SCREEN */}

      {started && (
        <section className="mx-auto mt-16 max-w-5xl">

          <div className="mb-8">

            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              Stage 01
            </p>

            <h1 className="mt-3 text-4xl font-black md:text-5xl">
              Your Pitch Has Been Selected
            </h1>

            <p className="mt-3 text-[var(--muted)]">
              Study the conditions carefully. Your final Playing XI
              should be built with this pitch in mind.
            </p>

          </div>


          {/* LOADING STATE */}

          {loadingPitch && (
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-16 text-center">

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-[var(--border)] border-t-[var(--accent)] animate-spin" />

              <p className="mt-8 text-xl font-bold">
                Analyzing conditions...
              </p>

              <p className="mt-2 text-[var(--muted)]">
                The system is selecting your IPL battlefield.
              </p>

            </div>
          )}


          {/* PITCH CARD */}

          {pitch && !loadingPitch && (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">

              {/* MAIN PITCH INFORMATION */}

              <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 md:p-10">

                <span className="rounded-full border border-[var(--accent)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
                  {pitch.type}
                </span>


                <h2 className="mt-8 text-3xl font-black md:text-5xl">
                  {pitch.stadium}
                </h2>

                <p className="mt-3 text-lg text-[var(--muted)]">
                  {pitch.city}
                </p>


                <p className="mt-8 max-w-2xl leading-8 text-[var(--muted)]">
                  {pitch.description}
                </p>


                {/* CONDITIONS */}

                <div className="mt-10 grid gap-4 sm:grid-cols-3">

                  <PitchStat
                    label="Batting"
                    value={pitch.batting}
                  />

                  <PitchStat
                    label="Pace"
                    value={pitch.pace}
                  />

                  <PitchStat
                    label="Spin"
                    value={pitch.spin}
                  />

                </div>


                <div className="mt-6 rounded-2xl border border-[var(--border)] p-5">

                  <div className="flex items-center justify-between">

                    <div>
                      <p className="text-sm text-[var(--muted)]">
                        Dew Factor
                      </p>

                      <p className="mt-1 text-xl font-bold">
                        {pitch.dew}
                      </p>
                    </div>

                    <div className="text-3xl">
                      💧
                    </div>

                  </div>

                </div>

              </div>


              {/* STRATEGY PANEL */}

              <aside className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8">

                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
                  Strategy Insight
                </p>

                <h3 className="mt-6 text-2xl font-black">
                  Build For The Conditions
                </h3>

                <p className="mt-4 leading-7 text-[var(--muted)]">
                  The pitch selected for this challenge will remain
                  active throughout the game.
                </p>

                <p className="mt-4 leading-7 text-[var(--muted)]">
                  When selecting your Playing XI, you will be able
                  to compare player performance and pitch affinity.
                </p>


                <div className="mt-10 border-t border-[var(--border)] pt-8">

                  <p className="text-sm text-[var(--muted)]">
                    Next Stage
                  </p>

                  <p className="mt-2 text-xl font-bold">
                    Spin Your IPL Team
                  </p>

                </div>


                <button
                  type="button"
                  onClick={() => {
                    alert(
                      "Team Spin is the next stage. We will build this next."
                    );
                  }}
                  className="mt-8 w-full rounded-full bg-[var(--accent)] px-6 py-4 font-black text-black transition hover:scale-[1.02]"
                >
                  Continue to Team Spin →
                </button>

              </aside>

            </div>
          )}

        </section>
      )}

    </main>
  );
}


/* PITCH STAT COMPONENT */

function PitchStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] p-5">

      <div className="flex items-center justify-between">

        <p className="text-sm text-[var(--muted)]">
          {label}
        </p>

        <p className="font-bold">
          {value}
        </p>

      </div>


      <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/20">

        <div
          className="h-full rounded-full bg-[var(--accent)]"
          style={{
            width: `${value}%`,
          }}
        />

      </div>

    </div>
  );
}