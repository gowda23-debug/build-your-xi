import Link from "next/link";
import {
    Trophy,
    Users,
    Gamepad2,
    Target,
    ArrowRight,
    Globe2,
} from "lucide-react";

export default function HowToPlayPage() {
    const steps = [
        {
            number: "01",
            title: "Choose your mode",
            description:
                "Pick IPL or World and choose the cricket challenge you want to play.",
            icon: Globe2,
        },
        {
            number: "02",
            title: "Build your XI",
            description:
                "Make your selections carefully and build the strongest possible playing XI.",
            icon: Users,
        },
        {
            number: "03",
            title: "Submit your team",
            description:
                "Once your XI is complete, submit your selections and lock in your attempt.",
            icon: Target,
        },
        {
            number: "04",
            title: "Get your score",
            description:
                "Your performance is scored based on the game rules and your final result.",
            icon: Trophy,
        },
    ];

    return (
        <main className="min-h-screen grid-bg">
            <section className="mx-auto w-full max-w-5xl px-6 py-12">
                <Link
                    href="/home"
                    className="text-sm font-black text-[var(--accent)] transition hover:opacity-80"
                >
                    ← BACK TO HOME
                </Link>

                {/* Hero */}
                <div className="mt-10 max-w-2xl">
                    <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--accent)]/15">
                            <Gamepad2 className="h-6 w-6 text-[var(--accent)]" />
                        </div>

                        <span className="text-xs font-black tracking-[0.2em] text-[var(--accent)]">
                            HOW IT WORKS
                        </span>
                    </div>

                    <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
                        How to Play
                    </h1>

                    <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">
                        Test your cricket knowledge, build your XI and compete
                        against players from around the world.
                    </p>
                </div>

                {/* Steps */}
                <div className="mt-12 grid gap-5 md:grid-cols-2">
                    {steps.map((step) => {
                        const Icon = step.icon;

                        return (
                            <article
                                key={step.number}
                                className="card relative overflow-hidden p-6"
                            >
                                <span className="absolute right-5 top-4 text-5xl font-black text-white/5">
                                    {step.number}
                                </span>

                                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent)]/15">
                                    <Icon className="h-5 w-5 text-[var(--accent)]" />
                                </div>

                                <h2 className="mt-5 text-xl font-black">
                                    {step.title}
                                </h2>

                                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                                    {step.description}
                                </p>
                            </article>
                        );
                    })}
                </div>

                {/* Modes */}
                <section className="mt-12">
                    <h2 className="text-2xl font-black">
                        Game Modes
                    </h2>

                    <div className="mt-5 grid gap-5 md:grid-cols-2">
                        <article className="card p-6">
                            <div className="text-3xl">🏏</div>

                            <h3 className="mt-4 text-lg font-black">
                                IPL
                            </h3>

                            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                                Test your knowledge of the Indian Premier League
                                and build your ultimate XI.
                            </p>
                        </article>

                        <article className="card p-6">
                            <Globe2 className="h-7 w-7 text-blue-400" />

                            <h3 className="mt-4 text-lg font-black">
                                World
                            </h3>

                            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                                Take your cricket knowledge global and compete
                                using players from around the world.
                            </p>
                        </article>
                    </div>
                </section>

                {/* Competition */}
                <section className="card mt-12 p-6 sm:p-8">
                    <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                        <div>
                            <h2 className="text-2xl font-black">
                                Ready to build your XI?
                            </h2>

                            <p className="mt-2 text-sm text-[var(--muted)]">
                                Choose a mode, start playing and see how you rank.
                            </p>
                        </div>

                        <Link
                            href="/home"
                            className="btn btn-primary inline-flex items-center justify-center gap-2"
                        >
                            PLAY NOW
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </section>
            </section>
        </main>
    );
}