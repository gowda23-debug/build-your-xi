"use client";

import Link from "next/link";
import {
  Camera,
  MessageCircle,
  Share2,
} from "lucide-react";

export default function AppFooter() {
  async function handleShare() {
    const shareData = {
      title: "Build Your XI",
      text: "Test your cricket knowledge and Build Your XI!",
      url: window.location.origin,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(window.location.origin);

      alert("Link copied to clipboard!");
    } catch (error) {
      console.error("Unable to share:", error);
    }
  }

  return (
    <footer className="relative border-t border-white/10 bg-[#0d120f]/95">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-5 text-center md:flex-row md:px-10 md:text-left">

        {/* Copyright */}

        <p className="text-xs text-[var(--muted)]">
          © {new Date().getFullYear()} Build Your XI.
          All rights reserved.
        </p>

        {/* Footer Navigation */}

        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
          <Link
            href="/privacy"
            className="text-[var(--muted)] transition hover:text-white"
          >
            Privacy Policy
          </Link>

          <Link
            href="/terms"
            className="text-[var(--muted)] transition hover:text-white"
          >
            Terms of Use
          </Link>

          <Link
            href="/contact"
            className="text-[var(--muted)] transition hover:text-white"
          >
            Contact Us
          </Link>
        </nav>

        {/* Footer Actions */}

        <div className="flex items-center gap-2">

          {/* Share */}

          <button
            type="button"
            onClick={handleShare}
            aria-label="Share Build Your XI"
            title="Share Build Your XI"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
          >
            <Share2 size={16} />
          </button>

          {/* Feedback / Contact */}

          <Link
            href="/contact"
            aria-label="Contact us"
            title="Contact us"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
          >
            <MessageCircle size={16} />
          </Link>

          {/* Instagram */}

          <a
            href="#"
            aria-label="Build Your XI Instagram"
            title="Instagram"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
          >
            <Camera size={16} />
          </a>

        </div>
      </div>
    </footer>
  );
}