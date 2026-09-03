import Link from "next/link";
import {
    ArrowLeft,
    ShieldCheck,
    Database,
    UserRound,
    Mail,
    Lock,
} from "lucide-react";

export default function PrivacyPage() {
    return (
        <main className="min-h-screen grid-bg">
            <section className="mx-auto w-full max-w-4xl px-6 py-12">
                <Link
                    href="/home"
                    className="inline-flex items-center gap-2 text-sm font-black text-[var(--accent)] transition hover:opacity-80"
                >
                    <ArrowLeft className="h-4 w-4" />
                    BACK TO HOME
                </Link>

                {/* Hero */}
                <div className="mt-10 max-w-3xl">
                    <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--accent)]/15">
                            <ShieldCheck className="h-6 w-6 text-[var(--accent)]" />
                        </div>

                        <span className="text-xs font-black tracking-[0.2em] text-[var(--accent)]">
                            LEGAL
                        </span>
                    </div>

                    <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
                        Privacy Policy
                    </h1>

                    <p className="mt-4 text-base leading-7 text-[var(--muted)]">
                        Your privacy matters to us. This Privacy Policy explains
                        what information Build Your XI collects, how it is used,
                        and how it is handled.
                    </p>

                    <p className="mt-4 text-sm text-[var(--muted)]">
                        Last updated: September 2, 2026
                    </p>
                </div>

                {/* Content */}
                <div className="mt-12 space-y-6">
                    {/* Information we collect */}
                    <section className="card p-6 sm:p-8">
                        <div className="flex items-center gap-3">
                            <Database className="h-5 w-5 text-[var(--accent)]" />

                            <h2 className="text-xl font-black">
                                Information We Collect
                            </h2>
                        </div>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            Depending on how you use Build Your XI, we may collect
                            information necessary to provide and improve the
                            service.
                        </p>

                        <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
                            <li>
                                <strong className="text-white">
                                    Account information:
                                </strong>{" "}
                                such as your email address when you create an
                                account.
                            </li>

                            <li>
                                <strong className="text-white">
                                    Profile information:
                                </strong>{" "}
                                such as your display name and gamer tag.
                            </li>

                            <li>
                                <strong className="text-white">
                                    Gameplay information:
                                </strong>{" "}
                                such as scores, rankings, game activity and
                                participation in supported game modes.
                            </li>

                            <li>
                                <strong className="text-white">
                                    Challenge information:
                                </strong>{" "}
                                such as challenge participation and scores when
                                using multiplayer challenge features.
                            </li>
                        </ul>
                    </section>

                    {/* How we use information */}
                    <section className="card p-6 sm:p-8">
                        <div className="flex items-center gap-3">
                            <UserRound className="h-5 w-5 text-[var(--accent)]" />

                            <h2 className="text-xl font-black">
                                How We Use Your Information
                            </h2>
                        </div>

                        <ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--muted)]">
                            <li>
                                • To create and manage your account.
                            </li>

                            <li>
                                • To save your gameplay progress and scores.
                            </li>

                            <li>
                                • To display rankings and leaderboards.
                            </li>

                            <li>
                                • To enable challenge and multiplayer features.
                            </li>

                            <li>
                                • To respond to support requests and feedback.
                            </li>

                            <li>
                                • To maintain, improve and protect the service.
                            </li>
                        </ul>
                    </section>

                    {/* Public information */}
                    <section className="card p-6 sm:p-8">
                        <h2 className="text-xl font-black">
                            Public Information
                        </h2>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            Your gamer tag and gameplay-related information may
                            be visible to other users when participating in
                            leaderboards, challenges or other public game
                            features.
                        </p>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            Your email address is not intended to be displayed
                            publicly through leaderboards or public gameplay
                            features.
                        </p>
                    </section>

                    {/* Data security */}
                    <section className="card p-6 sm:p-8">
                        <div className="flex items-center gap-3">
                            <Lock className="h-5 w-5 text-[var(--accent)]" />

                            <h2 className="text-xl font-black">
                                Data Security
                            </h2>
                        </div>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            We take reasonable steps to protect account and
                            gameplay information. However, no online service can
                            guarantee absolute security.
                        </p>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            You are responsible for keeping your account
                            credentials secure and should not share your password
                            with others.
                        </p>
                    </section>

                    {/* Third-party services */}
                    <section className="card p-6 sm:p-8">
                        <h2 className="text-xl font-black">
                            Third-Party Services
                        </h2>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            Build Your XI may rely on third-party services to
                            provide features such as authentication, database
                            storage and application hosting. These services may
                            process information as necessary to provide their
                            services.
                        </p>
                    </section>

                    {/* Contact */}
                    <section className="card p-6 sm:p-8">
                        <div className="flex items-center gap-3">
                            <Mail className="h-5 w-5 text-[var(--accent)]" />

                            <h2 className="text-xl font-black">
                                Contact Us
                            </h2>
                        </div>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            If you have questions about this Privacy Policy or
                            how your information is handled, please contact us
                            through our Contact Us page.
                        </p>

                        <Link
                            href="/contact"
                            className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:opacity-80"
                        >
                            Contact Us →
                        </Link>
                    </section>

                    {/* Changes */}
                    <section className="card p-6 sm:p-8">
                        <h2 className="text-xl font-black">
                            Changes to This Privacy Policy
                        </h2>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            We may update this Privacy Policy from time to time
                            as Build Your XI evolves. Any changes will be posted
                            on this page with an updated revision date.
                        </p>
                    </section>
                </div>
            </section>
        </main>
    );
}