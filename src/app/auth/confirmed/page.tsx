import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
} from "lucide-react";

export default function EmailConfirmedPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <section className="card w-full max-w-md p-8 text-center md:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
          <CheckCircle2 size={34} />
        </div>

        <h1 className="mt-6 text-3xl font-black tracking-tight">
          Email Confirmed!
        </h1>

        <p className="mt-3 leading-7 text-[var(--muted)]">
          Your email address has been successfully confirmed.
          Your Build Your XI account is now ready to use.
        </p>

        <Link
          href="/home"
          className="btn btn-primary mt-8 inline-flex w-full items-center justify-center gap-2"
        >
          Continue to Build Your XI
          <ChevronRight size={18} />
        </Link>
      </section>
    </main>
  );
}