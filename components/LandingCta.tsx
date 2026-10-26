"use client";

import { LayoutDashboard, LogIn } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { cx } from "./ui";

/**
 * Landing-page call to action: "Open Dashboard" when signed in, otherwise "Sign In".
 * `tone` picks the colours ("ash" for dark bands) — pass colours this way, not in className, since
 * a second bg-* class would clash with the green one instead of replacing it.
 */
export function LandingCta({ size = "md", tone = "brand", className }: { size?: "md" | "lg"; tone?: "brand" | "ash"; className?: string }) {
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;
  return (
    <Link
      href={signedIn ? "/dashboard" : "/login"}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2",
        tone === "ash"
          ? "bg-[#d1d1d1] text-[#1f2421] hover:bg-[#c2c2c2] focus-visible:ring-white/50"
          : "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500/40",
        size === "lg" ? "h-12 px-6 text-base" : "h-9 px-4 text-sm",
        className,
      )}
    >
      {signedIn ? <LayoutDashboard className="size-4 shrink-0" /> : <LogIn className="size-4 shrink-0" />}
      {signedIn ? (
        <span>
          {/* Small header button on phones: just "Dashboard", so it stays on one line beside the logo */}
          <span className={size === "md" ? "hidden min-[400px]:inline" : undefined}>Open </span>Dashboard
        </span>
      ) : (
        "Sign In"
      )}
    </Link>
  );
}

/** The current year, worked out in the browser (a server-rendered `new Date()` would make the page dynamic) */
export function CurrentYear() {
  return <span suppressHydrationWarning>{new Date().getFullYear()}</span>;
}
