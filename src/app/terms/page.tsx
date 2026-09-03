import Link from "next/link";
import {
    ArrowLeft,
    FileText,
    UserRound,
    Trophy,
    ShieldAlert,
    Scale,
    Mail,
} from "lucide-react";

export default function TermsPage() {
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
                            <FileText className="h-6 w-6 text-[var(--accent)]" />
                        </div>

                        <span className="text-xs font-black tracking-[0.2em] text-[var(--accent)]">
                            LEGAL
                        </span>
                    </div>

                    <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
                        Terms of Use
                    </h1>

                    <p className="mt-4 text-base leading-7 text-[var(--muted)]">
                        These Terms of Use explain the rules and conditions for
                        using Build Your XI.
                    </p>

                    <p className="mt-4 text-sm text-[var(--muted)]">
                        Last updated: September 2, 2026
                    </p>
                </div>

                <div className="mt-12 space-y-6">
                    {/* Acceptance */}
                    <section className="card p-6 sm:p-8">
                        <div className="flex items-center gap-3">
                            <Scale className="h-5 w-5 text-[var(--accent)]" />

                            <h2 className="text-xl font-black">
                                Acceptance of These Terms
                            </h2>
                        </div>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            By accessing or using Build Your XI, you agree to
                            these Terms of Use. If you do not agree with these
                            terms, please do not use the service.
                        </p>
                    </section>

                    {/* Accounts */}
                    <section className="card p-6 sm:p-8">
                        <div className="flex items-center gap-3">
                            <UserRound className="h-5 w-5 text-[var(--accent)]" />

                            <h2 className="text-xl font-black">
                                Accounts and Profiles
                            </h2>
                        </div>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            You may need an account to access certain features of
                            Build Your XI. You are responsible for maintaining
                            the security of your account and for activity that
                            occurs through it.
                        </p>

                        <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
                            <li>
                                • Provide accurate information when creating or
                                updating your account.
                            </li>

                            <li>
                                • Keep your login credentials secure.
                            </li>

                            <li>
                                • Do not impersonate another person or use
                                misleading account information.
                            </li>

                            <li>
                                • Choose a gamer tag that does not violate
                                applicable laws or infringe on the rights of
                                others.
                            </li>
                        </ul>
                    </section>

                    {/* Gameplay */}
                    <section className="card p-6 sm:p-8">
                        <div className="flex items-center gap-3">
                            <Trophy className="h-5 w-5 text-[var(--accent)]" />

                            <h2 className="text-xl font-black">
                                Gameplay, Scores and Rankings
                            </h2>
                        </div>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            Build Your XI provides cricket-based gameplay and
                            competitive features. Scores, rankings and
                            leaderboard positions may change as new gameplay
                            activity is recorded.
                        </p>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            We may investigate, adjust or remove scores or
                            rankings where there is evidence of technical
                            errors, abuse, cheating or manipulation.
                        </p>
                    </section>

                    {/* Challenges */}
                    <section className="card p-6 sm:p-8">
                        <h2 className="text-xl font-black">
                            Challenges and Social Features
                        </h2>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            Build Your XI may allow users to create or join
                            challenges and other social gameplay features.
                            Please use these features responsibly and do not use
                            them to harass, abuse or intentionally disrupt other
                            users.
                        </p>
                    </section>

                    {/* Acceptable use */}
                    <section className="card p-6 sm:p-8">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="h-5 w-5 text-[var(--accent)]" />

                            <h2 className="text-xl font-black">
                                Acceptable Use
                            </h2>
                        </div>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            You agree not to misuse Build Your XI. This includes,
                            but is not limited to:
                        </p>

                        <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
                            <li>
                                • Attempting to manipulate scores, rankings or
                                gameplay results.
                            </li>

                            <li>
                                • Exploiting bugs or technical vulnerabilities.
                            </li>

                            <li>
                                • Attempting to gain unauthorized access to
                                accounts, systems or data.
                            </li>

                            <li>
                                • Interfering with the normal operation of the
                                service.
                            </li>

                            <li>
                                • Using offensive, abusive or illegal content
                                through available features.
                            </li>
                        </ul>
                    </section>

                    {/* Availability */}
                    <section className="card p-6 sm:p-8">
                        <h2 className="text-xl font-black">
                            Availability and Changes
                        </h2>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            Build Your XI may be updated, changed, suspended or
                            discontinued from time to time. Features, game modes
                            and functionality may change as the application
                            evolves.
                        </p>
                    </section>

                    {/* No guarantees */}
                    <section className="card p-6 sm:p-8">
                        <h2 className="text-xl font-black">
                            Service Disclaimer
                        </h2>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            Build Your XI is provided for entertainment and
                            gameplay purposes. While we aim to provide a reliable
                            experience, we cannot guarantee that the service will
                            always be available, uninterrupted or free from
                            errors.
                        </p>
                    </section>

                    {/* Changes */}
                    <section className="card p-6 sm:p-8">
                        <h2 className="text-xl font-black">
                            Changes to These Terms
                        </h2>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            We may update these Terms of Use as Build Your XI
                            evolves. Continued use of the service after changes
                            are posted may constitute acceptance of the updated
                            terms.
                        </p>
                    </section>

                    {/* Contact */}
                    <section className="card p-6 sm:p-8">
                        <div className="flex items-center gap-3">
                            <Mail className="h-5 w-5 text-[var(--accent)]" />

                            <h2 className="text-xl font-black">
                                Questions About These Terms
                            </h2>
                        </div>

                        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                            If you have questions about these Terms of Use,
                            please contact us through the Contact Us page.
                        </p>

                        <Link
                            href="/contact"
                            className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] transition hover:opacity-80"
                        >
                            Contact Us →
                        </Link>
                    </section>
                </div>
            </section>
        </main>
    );
}