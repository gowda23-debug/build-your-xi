"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
    ChevronRight,
    KeyRound,
    LogOut,
    Menu,
    Trophy,
    User,
    X,
    Home,
    Trophy as LeaderboardIcon,
    BarChart3,
    CircleHelp,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Player = {
    label: string;
    gamerTag: string;
    isGuest: boolean;
};

const PUBLIC_PATHS = [
    "/",
    "/login",
    "/register",
    "/signup",
    "/forgot-password",
];

export default function AppHeader() {
    const router = useRouter();
    const pathname = usePathname();

    const supabase = useMemo(() => createClient(), []);

    const [player, setPlayer] = useState<Player | null>(null);
    const [loading, setLoading] = useState(true);
    const [logoutLoading, setLogoutLoading] = useState(false);

    const [profileOpen, setProfileOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    /*
     * This reference wraps BOTH the profile button
     * and the profile dropdown.
     *
     * This fixes the profile bubble/dropdown issue.
     */
    const profileRef = useRef<HTMLDivElement>(null);

    /*
     * Public pages should never show the authenticated
     * application header.
     */
    const isPublicPage = PUBLIC_PATHS.includes(pathname);

    useEffect(() => {
        let mounted = true;
        setLogoutLoading(false);
        async function loadPlayer() {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!mounted) return;

            /*
             * No authenticated user.
             */
            if (!user) {
                setPlayer(null);
                setLogoutLoading(false);
                setLoading(false);
                return;
            }

            const isGuest = Boolean(user.is_anonymous);

            /*
             * Guest player.
             */
            if (isGuest) {
                setPlayer({
                    label: "GUEST PLAYER",
                    gamerTag: `GUEST-${user.id
                        .slice(0, 6)
                        .toUpperCase()}`,
                    isGuest: true,
                });

                setLoading(false);
                return;
            }

            /*
             * Registered player.
             */
            const {
                data: profileData,
                error: profileError,
            } = await supabase
                .from("profiles")
                .select("display_name, gamer_tag")
                .eq("id", user.id)
                .single();

            if (profileError) {
                console.error(
                    "Error loading profile:",
                    profileError
                );
            }

            if (!mounted) return;

            setPlayer({
                label:
                    profileData?.display_name ||
                    user.user_metadata?.display_name ||
                    "PLAYER",

                gamerTag:
                    profileData?.gamer_tag || "",

                isGuest: false,
            });

            setLoading(false);
        }

        loadPlayer();

        /*
         * Listen for authentication changes.
         *
         * This is important because after logout
         * we immediately remove the header.
         */
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return;

                if (
                    event === "SIGNED_OUT" ||
                    !session?.user
                ) {
                    setPlayer(null);
                    setProfileOpen(false);
                    setMobileMenuOpen(false);
                    setLogoutLoading(false);
                    setLoading(false);
                    return;
                }

                if (event === "SIGNED_IN") {
                    // A new session has started, so make sure a previous
                    // logout state does not carry into this session.
                    setLogoutLoading(false);

                    setLoading(true);
                    await loadPlayer();
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [supabase]);

    /*
     * Close profile dropdown when clicking outside.
     */
    useEffect(() => {
        function handleClickOutside(
            event: MouseEvent
        ) {
            if (
                profileRef.current &&
                !profileRef.current.contains(
                    event.target as Node
                )
            ) {
                setProfileOpen(false);
            }
        }

        document.addEventListener(
            "mousedown",
            handleClickOutside
        );

        return () => {
            document.removeEventListener(
                "mousedown",
                handleClickOutside
            );
        };
    }, []);

    /*
     * Logout.
     */
    async function handleLogout() {
        setLogoutLoading(true);

        try {
            const { error } =
                await supabase.auth.signOut();

            if (error) {
                console.error(
                    "Logout error:",
                    error
                );

                alert(
                    "We could not log you out. Please try again."
                );

                setLogoutLoading(false);
                return;
            }

            /*
             * Immediately clear local state.
             *
             * This prevents the old authenticated
             * navbar from remaining visible.
             */
            setPlayer(null);
            setProfileOpen(false);
            setMobileMenuOpen(false);

            router.replace("/");
            router.refresh();
        } catch (error) {
            console.error(
                "Unexpected logout error:",
                error
            );

            setLogoutLoading(false);

            alert(
                "We could not log you out. Please try again."
            );
        }
    }

    function getInitials(name?: string) {
        if (!name) {
            return "P";
        }

        return name
            .split(" ")
            .filter(Boolean)
            .map((word) =>
                word.charAt(0)
            )
            .join("")
            .slice(0, 2)
            .toUpperCase();
    }

    function closeMobileMenu() {
        setMobileMenuOpen(false);
    }

    function isActive(path: string) {
        return pathname === path;
    }

    /*
     * Don't render while authentication
     * state is being determined.
     */
    if (loading) {
        return null;
    }

    /*
     * Never show this header on public pages.
     *
     * Also don't show it if there is no player.
     */
    if (isPublicPage || !player) {
        return null;
    }

    const desktopNavClass = (
        path: string
    ) =>
        `rounded-lg border-b-2 px-4 py-2 text-xs font-bold uppercase tracking-wide transition ${isActive(path)
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-transparent text-[var(--muted)] hover:text-white"
        }`;

    const mobileNavClass = (
        path: string
    ) =>
        `flex items-center gap-3 rounded-xl px-4 py-4 font-semibold transition ${isActive(path)
            ? "bg-[var(--accent)]/10 text-[var(--accent)]"
            : "text-[var(--muted)] hover:bg-white/5 hover:text-white"
        }`;

    return (
        <>
            {/* =========================
          HEADER
      ========================= */}

            <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0d120f]/95 backdrop-blur-xl">
                <div className="flex h-[72px] w-full items-center px-4 sm:px-6 lg:px-8">

                    {/* LEFT SIDE */}

                    <div className="flex items-center gap-8">

                        {/* LOGO */}

                        <Link
                            href="/home"
                            className="shrink-0 text-lg font-black tracking-tight sm:text-xl"
                        >
                            BUILD YOUR{" "}
                            <span className="text-[var(--accent)]">
                                XI
                            </span>
                        </Link>

                        {/* DESKTOP NAVIGATION */}

                        <nav className="hidden items-center gap-1 lg:flex">

                            <Link
                                href="/home"
                                className={desktopNavClass(
                                    "/home"
                                )}
                            >
                                Home
                            </Link>

                            <Link
                                href="/challenges"
                                className={desktopNavClass(
                                    "/challenges"
                                )}
                            >
                                Challenges
                            </Link>

                            <Link
                                href="/leaderboard"
                                className={desktopNavClass(
                                    "/leaderboard"
                                )}
                            >
                                Leaderboard
                            </Link>

                            <Link
                                href="/stats"
                                className={desktopNavClass(
                                    "/stats"
                                )}
                            >
                                My Stats
                            </Link>

                            <Link
                                href="/how-to-play"
                                className={desktopNavClass(
                                    "/how-to-play"
                                )}
                            >
                                How to Play
                            </Link>

                        </nav>
                    </div>

                    {/* RIGHT SIDE */}

                    <div
                        ref={profileRef}
                        className="relative ml-auto flex items-center gap-3"
                    >

                        {/* DESKTOP PROFILE */}

                        <button
                            type="button"
                            onClick={() =>
                                setProfileOpen(
                                    (open) => !open
                                )
                            }
                            className="hidden items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2 pr-4 transition hover:bg-white/[0.08] sm:flex"
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/[0.08] text-xs font-black">
                                {getInitials(
                                    player.label
                                )}
                            </span>

                            <span className="max-w-[130px] truncate text-sm font-bold">
                                {player.gamerTag ||
                                    player.label}
                            </span>
                        </button>

                        {/* MOBILE PROFILE */}

                        <button
                            type="button"
                            onClick={() =>
                                setProfileOpen(
                                    (open) => !open
                                )
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--accent)]/50 bg-white/5 text-xs font-black transition hover:bg-white/10 sm:hidden"
                            aria-label="Open profile menu"
                        >
                            {getInitials(
                                player.label
                            )}
                        </button>

                        {/* MOBILE MENU */}

                        <button
                            type="button"
                            onClick={() =>
                                setMobileMenuOpen(true)
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition hover:bg-white/10 lg:hidden"
                            aria-label="Open navigation menu"
                        >
                            <Menu size={20} />
                        </button>

                        {/* PROFILE DROPDOWN */}

                        {profileOpen && (
                            <div className="absolute right-0 top-[58px] z-50 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#141614] shadow-2xl shadow-black/50">

                                {/* Player Information */}

                                <div className="border-b border-white/10 p-5">

                                    <div className="flex items-center gap-3">

                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/60 bg-white/5 font-black">
                                            {getInitials(
                                                player.label
                                            )}
                                        </div>

                                        <div className="min-w-0">

                                            <p className="truncate font-semibold">
                                                {player.label}
                                            </p>

                                            <p className="truncate text-sm text-[var(--muted)]">
                                                {player.isGuest
                                                    ? player.gamerTag
                                                    : player.gamerTag
                                                        ? `@${player.gamerTag}`
                                                        : "No Gamer Tag"}
                                            </p>

                                        </div>

                                        {player.isGuest && (
                                            <span className="rounded-md bg-[var(--accent)]/15 px-2 py-1 text-xs font-bold text-[var(--accent)]">
                                                GUEST
                                            </span>
                                        )}

                                    </div>

                                </div>

                                {/* Profile Options */}

                                <div className="p-2">

                                    <Link
                                        href="/profile"
                                        onClick={() =>
                                            setProfileOpen(false)
                                        }
                                        className="flex items-center justify-between rounded-xl px-4 py-3 transition hover:bg-white/5"
                                    >
                                        <span className="flex items-center gap-3">
                                            <User size={18} />
                                            Profile Settings
                                        </span>

                                        <ChevronRight
                                            size={18}
                                        />
                                    </Link>

                                    {!player.isGuest && (
                                        <Link
                                            href="/profile?tab=password"
                                            onClick={() =>
                                                setProfileOpen(false)
                                            }
                                            className="flex items-center justify-between rounded-xl px-4 py-3 transition hover:bg-white/5"
                                        >
                                            <span className="flex items-center gap-3">
                                                <KeyRound size={18} />
                                                Change Password
                                            </span>

                                            <ChevronRight
                                                size={18}
                                            />
                                        </Link>
                                    )}

                                </div>

                                {/* Logout */}

                                <div className="border-t border-white/10 p-2">

                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        disabled={logoutLoading}
                                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <LogOut size={18} />

                                        {logoutLoading
                                            ? "Logging out..."
                                            : "Log out"}
                                    </button>

                                </div>

                            </div>
                        )}

                    </div>

                </div>
            </header>

            {/* =========================
          MOBILE MENU
      ========================= */}

            {mobileMenuOpen && (
                <div className="fixed inset-0 z-[60] lg:hidden">

                    {/* Overlay */}

                    <button
                        type="button"
                        aria-label="Close navigation menu"
                        onClick={closeMobileMenu}
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                    />

                    {/* Side Menu */}

                    <aside className="relative ml-auto flex h-full w-[85%] max-w-sm flex-col border-l border-white/10 bg-[#101511] shadow-2xl">

                        {/* Header */}

                        <div className="flex items-center justify-between border-b border-white/10 p-5">

                            <div className="flex items-center gap-3">

                                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--accent)]/60 bg-white/5 font-black">
                                    {getInitials(
                                        player.label
                                    )}
                                </div>

                                <div className="min-w-0">

                                    <p className="truncate font-bold">
                                        {player.label}
                                    </p>

                                    <p className="truncate text-sm text-[var(--muted)]">
                                        {player.gamerTag ||
                                            "No Gamer Tag"}
                                    </p>

                                </div>

                            </div>

                            <button
                                type="button"
                                onClick={closeMobileMenu}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5"
                                aria-label="Close navigation menu"
                            >
                                <X size={20} />
                            </button>

                        </div>

                        {/* Navigation */}

                        <nav className="flex flex-col gap-2 p-4">

                            <Link
                                href="/home"
                                onClick={closeMobileMenu}
                                className={mobileNavClass(
                                    "/home"
                                )}
                            >
                                <Home size={19} />
                                Home
                            </Link>

                            <Link
                                href="/challenges"
                                onClick={closeMobileMenu}
                                className={mobileNavClass(
                                    "/challenges"
                                )}
                            >
                                <Trophy size={19} />
                                Challenges
                            </Link>

                            <Link
                                href="/leaderboard"
                                onClick={closeMobileMenu}
                                className={mobileNavClass(
                                    "/leaderboard"
                                )}
                            >
                                <LeaderboardIcon
                                    size={19}
                                />
                                Leaderboard
                            </Link>

                            <Link
                                href="/stats"
                                onClick={closeMobileMenu}
                                className={mobileNavClass(
                                    "/stats"
                                )}
                            >
                                <BarChart3 size={19} />
                                My Stats
                            </Link>

                            <Link
                                href="/how-to-play"
                                onClick={closeMobileMenu}
                                className={mobileNavClass(
                                    "/how-to-play"
                                )}
                            >
                                <CircleHelp
                                    size={19}
                                />
                                How to Play
                            </Link>

                        </nav>

                        {/* Profile Shortcut */}

                        <div className="border-t border-white/10 p-4">

                            <Link
                                href="/profile"
                                onClick={closeMobileMenu}
                                className="flex items-center gap-3 rounded-xl px-4 py-3 text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
                            >
                                <User size={19} />
                                Profile Settings
                            </Link>

                        </div>

                        {/* Logout */}

                        <div className="mt-auto border-t border-white/10 p-4">

                            <button
                                type="button"
                                onClick={handleLogout}
                                disabled={logoutLoading}
                                className="flex w-full items-center gap-3 rounded-xl border border-red-500/20 px-4 py-3 text-left font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                            >
                                <LogOut size={18} />

                                {logoutLoading
                                    ? "Logging out..."
                                    : "Log out"}
                            </button>

                        </div>

                    </aside>

                </div>
            )}
        </>
    );
}