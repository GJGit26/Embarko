import Link from "next/link";
import { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink p-10 text-mist md:flex">
        <Link href="/" className="font-display text-xl">
          Embarko
        </Link>
        <blockquote className="max-w-sm font-display text-2xl leading-snug text-mist/90">
          "The plan isn't generic — it's built from what I actually know and
          how much time I actually have."
        </blockquote>
        <p className="font-mono text-xs text-mist/40">knowledge-base · pgvector · gemini</p>
      </div>

      <div className="flex items-center justify-center px-6 py-16 md:px-12">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-charcoal/65 dark:text-mist/60">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-8 text-center text-sm text-charcoal/60 dark:text-mist/55">{footer}</p>
        </div>
      </div>
    </div>
  );
}
