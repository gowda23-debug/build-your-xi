import Link from "next/link";
import {
    ArrowLeft,
    Mail,
    MessageCircle,
    HelpCircle,
    Send,
} from "lucide-react";

export default function ContactPage() {
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
                <div className="mt-10 max-w-2xl">
                    <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--accent)]/15">
                            <MessageCircle className="h-6 w-6 text-[var(--accent)]" />
                        </div>

                        <span className="text-xs font-black tracking-[0.2em] text-[var(--accent)]">
                            SUPPORT
                        </span>
                    </div>

                    <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
                        Contact Us
                    </h1>

                    <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">
                        Need help, found an issue, or have an idea for Build Your
                        XI? We'd love to hear from you.
                    </p>
                </div>

                {/* Contact options */}
                <div className="mt-12 grid gap-5 md:grid-cols-2">
                    <article className="card p-6">
                        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent)]/15">
                            <Mail className="h-5 w-5 text-[var(--accent)]" />
                        </div>

                        <h2 className="mt-5 text-xl font-black">
                            Email Support
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                            For account issues, feedback, questions, or technical
                            problems, contact us by email.
                        </p>

                        {/* Replace with your actual support email */}
                        <a
                            href="mailto:support@buildyourxi.com"
                            className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:opacity-80"
                        >
                            <Send className="h-4 w-4" />
                            support@buildyourxi.com
                        </a>
                    </article>

                    <article className="card p-6">
                        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent)]/15">
                            <HelpCircle className="h-5 w-5 text-[var(--accent)]" />
                        </div>

                        <h2 className="mt-5 text-xl font-black">
                            Before You Contact Us
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                            If you're experiencing a problem, include as much
                            information as possible so we can understand and help
                            resolve the issue.
                        </p>

                        <ul className="mt-5 space-y-2 text-sm text-[var(--muted)]">
                            <li>• Your gamer tag</li>
                            <li>• What you were trying to do</li>
                            <li>• What went wrong</li>
                            <li>• Screenshots, if available</li>
                        </ul>
                    </article>
                </div>

                {/* Support note */}
                <section className="card mt-6 p-6 sm:p-8">
                    <h2 className="text-xl font-black">
                        Help us improve Build Your XI
                    </h2>

                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                        Build Your XI is continuously evolving. Feedback, bug
                        reports and suggestions help us improve the experience
                        for everyone.
                    </p>
                </section>
            </section>
        </main>
    );
}