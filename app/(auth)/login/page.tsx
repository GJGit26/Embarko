"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth-shell";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.push(searchParams.get("next") || "/dashboard");
    router.refresh();
  }

  async function handleGoogle() {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback`,
      },
    });
  }

  return (
    <AuthShell
      title="Welcome back."
      subtitle="Log in to pick up where your roadmap left off."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="text-teal underline dark:text-teal-bright">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-charcoal/70 dark:text-mist/70">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded border border-mist-line bg-transparent px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal dark:border-ink-line dark:focus:border-teal-bright"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm text-charcoal/70 dark:text-mist/70">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded border border-mist-line bg-transparent px-3 py-2.5 text-sm outline-none transition-colors focus:border-teal dark:border-ink-line dark:focus:border-teal-bright"
          />
        </div>

        {error && <p className="text-sm text-rust">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-charcoal py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal disabled:opacity-60 dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-charcoal/40 dark:text-mist/40">
        <div className="h-px flex-1 bg-mist-line dark:bg-ink-line" />
        or
        <div className="h-px flex-1 bg-mist-line dark:bg-ink-line" />
      </div>

      <button
        onClick={handleGoogle}
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded border border-mist-line py-2.5 text-sm font-medium transition-colors hover:bg-mist-dim dark:border-ink-line dark:hover:bg-ink-soft"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
          />
        </svg>
        Continue with Google
      </button>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
