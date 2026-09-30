"use client";

import {
  useSearchParams,
} from "next/navigation";

import {
  Suspense,
} from "react";

import XISelectionGame from "@/components/ipl/XISelectionGame";

function GamesContent() {
  const searchParams =
    useSearchParams();

  const challengeId =
    searchParams.get(
      "challenge"
    );

  const mode =
    searchParams.get(
      "mode"
    );

  /*
   * For now the only playable
   * challenge mode is IPL.
   *
   * World Domination will be
   * wired separately.
   */
  if (
    mode &&
    mode !== "ipl"
  ) {
    return (
      <main className="flex min-h-[calc(100dvh-72px)] items-center justify-center px-4">
        <section className="card w-full max-w-md p-8 text-center">
          <h1 className="text-xl font-black">
            Challenge mode unavailable
          </h1>

          <p className="mt-3 text-sm text-[var(--muted)]">
            This game mode is not available yet.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="h-[calc(100dvh-72px)] min-h-0 overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <XISelectionGame
          challengeId={
            challengeId
          }
        />
      </div>
    </main>
  );
}

export default function GamesPage() {
  return (
    <Suspense
      fallback={ 
        <main className="flex min-h-[calc(100dvh-72px)] items-center justify-center">
          <p className="text-sm text-[var(--muted)]">
            Loading game…
          </p>
        </main>
      }
    >
      <GamesContent />
    </Suspense>
  );
}