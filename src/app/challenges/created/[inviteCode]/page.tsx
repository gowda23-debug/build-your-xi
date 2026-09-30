"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Pencil,
  Share2,
  Trophy,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type GameMode = "ipl" | "world";

type Challenge = {
  id: string;
  creator_id: string;
  title: string;
  game_mode: GameMode;
  invite_code: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export default function CreatedChallengePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();

  const inviteCode =
    typeof params.inviteCode === "string"
      ? params.inviteCode
      : "";

  const [
    challenge,
    setChallenge,
  ] = useState<Challenge | null>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingTitle,
    setSavingTitle,
  ] = useState(false);

  const [
    editingTitle,
    setEditingTitle,
  ] = useState(false);

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    copied,
    setCopied,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    if (!inviteCode) {
      return;
    }

    loadChallenge();
  }, [inviteCode]);

  async function loadChallenge() {
    setLoading(true);
    setError("");

    try {
      const {
        data: {
          user,
        },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        router.replace("/login");
        return;
      }

      if (user.is_anonymous) {
        setError(
          "Registered authentication is required for challenges."
        );
        return;
      }

      const {
        data,
        error: challengeError,
      } = await supabase
        .from("challenges")
        .select(
          "id, creator_id, title, game_mode, invite_code, status, created_at, updated_at"
        )
        .eq(
          "invite_code",
          inviteCode
        )
        .single();

      if (challengeError) {
        throw challengeError;
      }

      if (!data) {
        throw new Error(
          "The challenge could not be found."
        );
      }

      if (
        data.creator_id !==
        user.id
      ) {
        throw new Error(
          "You are not the creator of this challenge."
        );
      }

      const loadedChallenge =
        data as Challenge;

      setChallenge(
        loadedChallenge
      );

      setTitle(
        loadedChallenge.title
      );
    } catch (err) {
      console.error(
        "Created challenge loading error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load the challenge."
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveTitle() {
    const cleanedTitle =
      title.trim();

    if (!challenge) {
      return;
    }

    if (!cleanedTitle) {
      setError(
        "Challenge name cannot be empty."
      );
      return;
    }

    if (cleanedTitle.length > 60) {
      setError(
        "Challenge name must be 60 characters or fewer."
      );
      return;
    }

    setSavingTitle(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/challenges/rename",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            cache: "no-store",

            body: JSON.stringify({
              challengeId:
                challenge.id,
              title:
                cleanedTitle,
            }),
          }
        );

      const data =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ??
          "Unable to rename the challenge."
        );
      }

      const updatedTitle =
        data?.challenge?.title ??
        cleanedTitle;

      setChallenge(
        (current) =>
          current
            ? {
                ...current,
                title:
                  updatedTitle,
              }
            : current
      );

      setTitle(
        updatedTitle
      );

      setEditingTitle(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to rename the challenge."
      );
    } finally {
      setSavingTitle(false);
    }
  }

  async function copyInviteLink() {
    if (!challenge) {
      return;
    }

    const link =
      `${window.location.origin}/challenges/${encodeURIComponent(
        challenge.invite_code
      )}`;

    try {
      await navigator.clipboard.writeText(
        link
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setError(
        "Unable to copy the invite link."
      );
    }
  }

  async function shareChallenge() {
    if (!challenge) {
      return;
    }

    const link =
      `${window.location.origin}/challenges/${encodeURIComponent(
        challenge.invite_code
      )}`;

    try {
      if (
        navigator.share
      ) {
        await navigator.share({
          title:
            challenge.title,
          text:
            "Join my Build Your XI challenge!",
          url:
            link,
        });

        return;
      }

      await navigator.clipboard.writeText(
        link
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // The user may cancel the native share dialog.
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <section className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />

            <p className="mt-4 text-sm font-bold text-[var(--muted)]">
              Creating your challenge...
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (
    error ||
    !challenge
  ) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <section className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/challenges"
              )
            }
            className="mb-8 flex items-center gap-2 text-sm font-bold text-[var(--muted)] transition hover:text-white"
          >
            <ArrowLeft
              className="h-4 w-4"
            />

            Back to Challenges
          </button>

          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <h1 className="text-xl font-black">
              Challenge unavailable
            </h1>

            <p className="mt-2 text-sm text-red-300">
              {error ||
                "The challenge could not be loaded."}
            </p>
          </div>
        </section>
      </main>
    );
  }

  const isIpl =
    challenge.game_mode ===
    "ipl";

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-2xl">
        <button
          type="button"
          onClick={() =>
            router.push(
              "/challenges"
            )
          }
          className="mb-8 flex items-center gap-2 text-sm font-bold text-[var(--muted)] transition hover:text-white"
        >
          <ArrowLeft
            className="h-4 w-4"
          />

          Back to Challenges
        </button>

        <section className="card overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-6 text-center sm:px-8">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--accent)]/15">
              {isIpl ? (
                <span className="text-3xl">
                  🏏
                </span>
              ) : (
                <Trophy
                  className="h-8 w-8 text-[var(--accent)]"
                />
              )}
            </div>

            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-[var(--accent)]">
              Challenge Created
            </p>

            <div className="mt-4">
              {editingTitle ? (
                <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row">
                  <input
                    value={title}
                    onChange={(event) =>
                      setTitle(
                        event.target.value
                      )
                    }
                    maxLength={60}
                    autoFocus
                    className="min-w-0 flex-1"
                    onKeyDown={(event) => {
                      if (
                        event.key ===
                        "Enter"
                      ) {
                        event.preventDefault();
                        saveTitle();
                      }

                      if (
                        event.key ===
                        "Escape"
                      ) {
                        setTitle(
                          challenge.title
                        );
                        setEditingTitle(
                          false
                        );
                      }
                    }}
                  />

                  <button
                    type="button"
                    disabled={
                      savingTitle
                    }
                    onClick={
                      saveTitle
                    }
                    className="btn btn-primary min-h-10"
                  >
                    {savingTitle
                      ? "Saving..."
                      : "Save"}
                  </button>

                  <button
                    type="button"
                    disabled={
                      savingTitle
                    }
                    onClick={() => {
                      setTitle(
                        challenge.title
                      );
                      setEditingTitle(
                        false
                      );
                    }}
                    className="btn btn-secondary min-h-10"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <h1 className="text-2xl font-black sm:text-3xl">
                    {challenge.title}
                  </h1>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingTitle(
                        true
                      )
                    }
                    aria-label="Rename challenge"
                    className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
                  >
                    <Pencil
                      className="h-4 w-4"
                    />
                  </button>
                </div>
              )}
            </div>

            <p className="mt-3 text-sm text-[var(--muted)]">
              Your challenge is ready.
              Share the invite code with
              your friends and let them try
              to beat your score.
            </p>
          </div>

          <div className="px-5 py-6 sm:px-8">
            <div className="rounded-2xl border border-[var(--line)] bg-black/10 p-5 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--muted)]">
                Invite Code
              </p>

              <p className="mt-3 text-4xl font-black tracking-[0.18em] text-[var(--accent)]">
                {challenge.invite_code}
              </p>

              <p className="mt-2 text-xs text-[var(--muted)]">
                Friends can use this code to
                join your challenge.
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={
                  shareChallenge
                }
                className="btn btn-primary min-h-11"
              >
                <Share2
                  className="h-4 w-4"
                />

                SHARE WITH FRIENDS
              </button>

              <button
                type="button"
                onClick={
                  copyInviteLink
                }
                className="btn btn-secondary min-h-11"
              >
                {copied ? (
                  <Check
                    className="h-4 w-4"
                  />
                ) : (
                  <Copy
                    className="h-4 w-4"
                  />
                )}

                {copied
                  ? "COPIED"
                  : "COPY LINK"}
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/challenges"
                )
              }
              className="btn btn-secondary mt-3 min-h-11 w-full"
            >
              SEE IN CHALLENGES
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}