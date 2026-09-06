"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-8 w-16" aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      aria-pressed={isDark}
      className="group relative flex h-8 w-16 items-center rounded-full border border-ink-line/40 bg-mist-dim px-1 transition-colors duration-300 ease-trail dark:border-ink-line dark:bg-ink-soft"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-charcoal text-mist shadow-sm transition-transform duration-300 ease-trail dark:bg-amber dark:text-ink ${
          isDark ? "translate-x-8" : "translate-x-0"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          {isDark ? (
            <path
              d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
      </span>
    </button>
  );
}
