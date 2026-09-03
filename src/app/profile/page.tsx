"use client";

import Link from "next/link";
import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Copy,
  KeyRound,
  User,
  Trophy,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type ProfileData = {
  id: string;
  displayName: string;
  gamerTag: string;
  email: string;
  isGuest: boolean;
};

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] =
    useState<ProfileData | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [gamerTag, setGamerTag] = useState("");

  const [activeTab, setActiveTab] =
    useState<"profile" | "password">("profile");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [copied, setCopied] = useState(false);

  // Password states

  const [currentPassword, setCurrentPassword] =
    useState("");

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [passwordLoading, setPasswordLoading] =
    useState(false);

  const [passwordMessage, setPasswordMessage] =
    useState("");

  const [passwordError, setPasswordError] =
    useState("");

  /*
   * Open the password tab when arriving from:
   *
   * /profile?tab=password
   */

  useEffect(() => {
    if (searchParams.get("tab") === "password") {
      setActiveTab("password");
    } else {
      setActiveTab("profile");
    }
  }, [searchParams]);

  /*
   * Load user and profile.
   */

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const isGuest = Boolean(user.is_anonymous);

      // Guest users don't need a permanent public profile.
      if (isGuest) {
        const guestProfile: ProfileData = {
          id: user.id,
          displayName: "GUEST PLAYER",
          gamerTag: `GUEST-${user.id.slice(0, 6).toUpperCase()}`,
          email: "",
          isGuest: true,
        };

        setProfile(guestProfile);
        setDisplayName(guestProfile.displayName);
        setGamerTag(guestProfile.gamerTag);

        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } =
        await supabase
          .from("profiles")
          .select("display_name, gamer_tag")
          .eq("id", user.id)
          .single();

      if (profileError) {
        setError(
          "We couldn't load your profile. Please refresh and try again."
        );
      }

      const loadedProfile: ProfileData = {
        id: user.id,

        displayName:
          profileData?.display_name ||
          user.user_metadata?.display_name ||
          "PLAYER",

        gamerTag:
          profileData?.gamer_tag || "",

        email: user.email || "",

        isGuest: false,
      };

      setProfile(loadedProfile);

      setDisplayName(
        loadedProfile.displayName
      );

      setGamerTag(
        loadedProfile.gamerTag
      );

      setLoading(false);
    }

    loadProfile();
  }, [router, supabase]);

  /*
   * Update profile.
   */

  async function handleProfileUpdate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!profile || profile.isGuest) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const cleanedDisplayName =
      displayName.trim();

    const cleanedGamerTag =
      gamerTag.trim();

    /*
     * Gamer Tag validation.
     */

    if (
      cleanedGamerTag.length < 3 ||
      cleanedGamerTag.length > 20
    ) {
      setError(
        "Gamer Tag must be between 3 and 20 characters."
      );

      setSaving(false);
      return;
    }

    if (
      !/^[A-Za-z0-9_]+$/.test(
        cleanedGamerTag
      )
    ) {
      setError(
        "Gamer Tag can only contain letters, numbers, and underscores."
      );

      setSaving(false);
      return;
    }

    /*
     * Update public profile.
     *
     * The database UNIQUE constraint protects against
     * duplicate Gamer Tags.
     */

    const { error: profileUpdateError } =
      await supabase
        .from("profiles")
        .update({
          display_name:
            cleanedDisplayName,

          gamer_tag:
            cleanedGamerTag,
        })
        .eq(
          "id",
          profile.id
        );

    if (profileUpdateError) {
      /*
       * PostgreSQL unique violation.
       */

      if (
        profileUpdateError.code ===
        "23505"
      ) {
        setError(
          "That Gamer Tag is already taken. Please choose another one."
        );
      } else {
        setError(
          "We couldn't update your profile. Please try again."
        );
      }

      setSaving(false);
      return;
    }

    /*
     * Keep Supabase auth metadata in sync
     * with the display name.
     */

    const { error: authUpdateError } =
      await supabase.auth.updateUser({
        data: {
          display_name:
            cleanedDisplayName,
        },
      });

    if (authUpdateError) {
      setError(
        "Your profile was updated, but we couldn't sync your display name everywhere. Please refresh."
      );

      setSaving(false);
      return;
    }

    const updatedProfile: ProfileData = {
      ...profile,

      displayName:
        cleanedDisplayName,

      gamerTag:
        cleanedGamerTag,
    };

    setProfile(updatedProfile);

    setMessage(
      "Profile updated successfully."
    );

    setSaving(false);
  }

  /*
   * Copy User ID.
   */

  async function handleCopyUserId() {
    if (!profile) {
      return;
    }

    await navigator.clipboard.writeText(
      profile.id
    );

    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  /*
   * Change password.
   */

  async function handlePasswordChange(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!profile || profile.isGuest) {
      return;
    }

    setPasswordError("");
    setPasswordMessage("");

    if (newPassword.length < 6) {
      setPasswordError(
        "Your new password must be at least 6 characters long."
      );

      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setPasswordError(
        "Your new passwords do not match."
      );

      return;
    }

    setPasswordLoading(true);

    /*
     * Verify current password.
     */

    const {
      error: verificationError,
    } =
      await supabase.auth.signInWithPassword({
        email:
          profile.email,

        password:
          currentPassword,
      });

    if (verificationError) {
      setPasswordError(
        "Your current password is incorrect."
      );

      setPasswordLoading(false);
      return;
    }

    /*
     * Update password.
     */

    const {
      error: updateError,
    } =
      await supabase.auth.updateUser({
        password:
          newPassword,
      });

    if (updateError) {
      setPasswordError(
        "We couldn't update your password. Please try again."
      );

      setPasswordLoading(false);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");

    setPasswordMessage(
      "Your password has been updated successfully."
    );

    setPasswordLoading(false);
  }

  /*
   * Loading state.
   */

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center grid-bg">
        <p className="text-sm font-bold text-[var(--muted)]">
          Loading profile...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid-bg px-6 py-6 md:px-12">

      {/* HEADER */}

      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link
          href="/home"
          className="text-xl font-black"
        >
          BUILD YOUR{" "}
          <span className="text-[var(--accent)]">
            XI
          </span>
        </Link>

        <Link
          href="/home"
          className="btn btn-secondary"
        >
          ← Back to Game Hub
        </Link>
      </header>

      {/* PROFILE */}

      <section className="mx-auto mt-12 max-w-6xl">
        <div className="card overflow-hidden">

          <div className="border-b border-white/10 px-8 py-6">
            <h1 className="text-3xl font-black">
              Profile Settings
            </h1>

            <p className="mt-2 text-sm text-[var(--muted)]">
              Manage your Build Your XI account.
            </p>
          </div>

          <div className="grid min-h-[560px] md:grid-cols-[240px_1fr]">

            {/* SIDEBAR */}

            <aside className="border-b border-white/10 p-4 md:border-b-0 md:border-r">

              <button
                type="button"
                onClick={() =>
                  setActiveTab("profile")
                }
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                  activeTab === "profile"
                    ? "bg-[var(--accent)]/15 text-white"
                    : "text-[var(--muted)] hover:bg-white/5"
                }`}
              >
                <User size={18} />

                Profile
              </button>

              {!profile?.isGuest && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveTab("password")
                  }
                  className={`mt-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                    activeTab === "password"
                      ? "bg-[var(--accent)]/15 text-white"
                      : "text-[var(--muted)] hover:bg-white/5"
                  }`}
                >
                  <KeyRound size={18} />

                  Change Password
                </button>
              )}
            </aside>

            {/* CONTENT */}

            <div className="p-6 md:p-10">

              {/* PROFILE TAB */}

              {activeTab === "profile" && (
                <div className="max-w-xl">

                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
                      <Trophy size={22} />
                    </div>

                    <div>
                      <h2 className="text-xl font-black">
                        Player Identity
                      </h2>

                      <p className="text-sm text-[var(--muted)]">
                        Your account and competitive identity.
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={
                      handleProfileUpdate
                    }
                    className="mt-8 space-y-6"
                  >

                    {/* DISPLAY NAME */}

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
                        Display Name
                      </label>

                      <input
                        value={
                          displayName
                        }
                        onChange={(event) =>
                          setDisplayName(
                            event.target.value
                          )
                        }
                        disabled={
                          profile?.isGuest
                        }
                        required
                      />

                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Your personal display name.
                      </p>
                    </div>

                    {/* GAMER TAG */}

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
                        Gamer Tag
                      </label>

                      <input
                        value={
                          gamerTag
                        }
                        onChange={(event) =>
                          setGamerTag(
                            event.target.value
                          )
                        }
                        disabled={
                          profile?.isGuest
                        }
                        placeholder="Choose a unique Gamer Tag"
                        minLength={3}
                        maxLength={20}
                        required={
                          !profile?.isGuest
                        }
                      />

                      <p className="mt-2 text-xs text-[var(--muted)]">
                        Must be unique. 3–20 characters. Letters,
                        numbers, and underscores only.
                      </p>
                    </div>

                    {/* USER ID */}

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
                        User ID
                      </label>

                      <div className="flex gap-2">
                        <input
                          value={
                            profile?.id || ""
                          }
                          disabled
                          className="font-mono text-xs"
                        />

                        <button
                          type="button"
                          onClick={
                            handleCopyUserId
                          }
                          className="flex shrink-0 items-center justify-center rounded-xl border border-white/10 px-4 transition hover:bg-white/5"
                          aria-label="Copy User ID"
                        >
                          {copied ? (
                            <Check
                              size={18}
                            />
                          ) : (
                            <Copy
                              size={18}
                            />
                          )}
                        </button>
                      </div>

                      <p className="mt-2 text-xs text-[var(--muted)]">
                        System generated and cannot be changed.
                      </p>
                    </div>

                    {/* EMAIL */}

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
                        Email
                      </label>

                      <input
                        value={
                          profile?.isGuest
                            ? "Guest account"
                            : profile?.email
                        }
                        disabled
                      />

                      <p className="mt-2 text-xs text-[var(--muted)]">
                        {profile?.isGuest
                          ? "Guest accounts do not have an email address."
                          : "Your authentication email is currently read-only."}
                      </p>
                    </div>

                    {/* GUEST MESSAGE */}

                    {profile?.isGuest && (
                      <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4 text-sm text-[var(--muted)]">
                        You are playing as a guest. Your Gamer Tag
                        is temporary and cannot be edited.
                      </div>
                    )}

                    {/* ERRORS */}

                    {error && (
                      <p className="text-sm text-red-400">
                        {error}
                      </p>
                    )}

                    {/* SUCCESS */}

                    {message && (
                      <p className="text-sm text-green-400">
                        {message}
                      </p>
                    )}

                    {/* SAVE */}

                    {!profile?.isGuest && (
                      <button
                        type="submit"
                        disabled={
                          saving
                        }
                        className="btn btn-primary"
                      >
                        {saving
                          ? "Saving..."
                          : "Save Changes"}
                      </button>
                    )}
                  </form>
                </div>
              )}

              {/* PASSWORD TAB */}

              {activeTab === "password" &&
                !profile?.isGuest && (
                  <div className="max-w-xl">

                    <h2 className="text-xl font-black">
                      Change Password
                    </h2>

                    <p className="mt-2 text-sm text-[var(--muted)]">
                      Keep your account secure with a strong password.
                    </p>

                    <form
                      onSubmit={
                        handlePasswordChange
                      }
                      className="mt-8 space-y-5"
                    >

                      <div>
                        <label className="mb-2 block text-sm text-[var(--muted)]">
                          Current Password
                        </label>

                        <input
                          type="password"
                          value={
                            currentPassword
                          }
                          onChange={(event) =>
                            setCurrentPassword(
                              event.target.value
                            )
                          }
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[var(--muted)]">
                          New Password
                        </label>

                        <input
                          type="password"
                          value={
                            newPassword
                          }
                          onChange={(event) =>
                            setNewPassword(
                              event.target.value
                            )
                          }
                          minLength={6}
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[var(--muted)]">
                          Confirm New Password
                        </label>

                        <input
                          type="password"
                          value={
                            confirmPassword
                          }
                          onChange={(event) =>
                            setConfirmPassword(
                              event.target.value
                            )
                          }
                          minLength={6}
                          required
                        />
                      </div>

                      {passwordError && (
                        <p className="text-sm text-red-400">
                          {passwordError}
                        </p>
                      )}

                      {passwordMessage && (
                        <p className="text-sm text-green-400">
                          {passwordMessage}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={
                          passwordLoading
                        }
                        className="btn btn-primary"
                      >
                        {passwordLoading
                          ? "Updating..."
                          : "Update Password"}
                      </button>
                    </form>
                  </div>
                )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/*
 * Suspense wrapper required by Next.js because
 * ProfilePageContent uses useSearchParams().
 *
 * All existing profile functionality remains inside
 * ProfilePageContent unchanged.
 */
export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center grid-bg">
          <p className="text-sm font-bold text-[var(--muted)]">
            Loading profile...
          </p>
        </main>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}