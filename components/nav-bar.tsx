"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";

export function NavBar({ isAuthed }: { isAuthed: boolean }) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-mist-line/70 bg-mist/85 backdrop-blur dark:border-ink-line/70 dark:bg-ink/85">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl tracking-tight">Embarko</span>
          <span className="hidden font-mono text-[11px] text-teal dark:text-teal-bright sm:inline">
            /roadmap
          </span>
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          {isAuthed ? (
            <>
              <Link
                href="/dashboard"
                className="hidden text-charcoal/70 transition-colors hover:text-charcoal dark:text-mist/70 dark:hover:text-mist sm:inline"
              >
                Dashboard
              </Link>
              <Link
                href="/survey"
                className="hidden text-charcoal/70 transition-colors hover:text-charcoal dark:text-mist/70 dark:hover:text-mist sm:inline"
              >
                New roadmap
              </Link>
              <button
                onClick={signOut}
                className="text-charcoal/70 transition-colors hover:text-charcoal dark:text-mist/70 dark:hover:text-mist"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-charcoal/70 transition-colors hover:text-charcoal dark:text-mist/70 dark:hover:text-mist"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded border border-charcoal bg-charcoal px-4 py-1.5 text-mist transition-colors hover:bg-transparent hover:text-charcoal dark:border-amber dark:bg-amber dark:text-ink dark:hover:bg-transparent dark:hover:text-amber"
              >
                Get started
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
