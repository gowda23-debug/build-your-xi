import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function EmailConfirmedPage() {
  return (
    <main className="grid min-h-screen place-items-center grid-bg px-6">
      <section className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
          <CheckCircle2 size={34} />
        </div>

        <h1 className="mt-6 text-3xl font-black">
          Email verified successfully!
        </h1>

        <p className="mt-3 leading-7 text-[var(--muted)]">
          Your Build Your XI account is now ready.
          You can log in and continue your cricket journey.
        </p>

        <Link
          href="/login"
          className="btn btn-primary mt-8 inline-flex w-full items-center justify-center"
        >
          Continue to login
        </Link>
      </section>
    </main>
  );
}