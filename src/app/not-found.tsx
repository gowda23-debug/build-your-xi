import Link from "next/link";
import {
  ArrowLeft,
  Home,
  SearchX,
} from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <section className="card w-full max-w-lg p-8 text-center md:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
          <SearchX size={34} />
        </div>

        <p className="mt-6 text-sm font-black tracking-[0.2em] text-[var(--accent)]">
          ERROR 404
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
          Page not found
        </h1>

        <p className="mx-auto mt-4 max-w-md leading-7 text-[var(--muted)]">
          The page you're looking for doesn't exist, may have been moved,
          or the link you followed is incorrect.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {/* <Link
            href="/"
            className="btn btn-primary inline-flex flex-1 items-center justify-center gap-2"
          >
            <Home size={18} />
            Go to home
          </Link> */}

          <Link
            href="/home"
            className="btn inline-flex flex-1 items-center justify-center gap-2"
          >
            <ArrowLeft size={18} />
            Return to game
          </Link>
        </div>
      </section>
    </main>
  );
}