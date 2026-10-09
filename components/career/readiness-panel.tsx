import type { Readiness } from "@/lib/skills-engine";
import { ProgressBar } from "@/components/progress-bar";

export function ReadinessPanel({ roleName, readiness, compact = false }: { roleName: string; readiness: Readiness; compact?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">Job readiness · {roleName}</p>
          <p className="mt-1 font-display text-2xl">{readiness.label}</p>
        </div>
        <p className="font-mono text-3xl tabular-nums text-teal dark:text-teal-bright">{readiness.overall}%</p>
      </div>

      <ul className="mt-5 space-y-3">
        {readiness.categories.map((c) => (
          <li key={c.name}>
            <div className="flex justify-between text-xs">
              <span>{c.name}</span>
              <span className="font-mono tabular-nums">{c.score}%</span>
            </div>
            <div className="mt-1"><ProgressBar percent={c.score} /></div>
          </li>
        ))}
      </ul>

      {!compact && (
        <details className="mt-5 text-xs text-charcoal/55 dark:text-mist/50">
          <summary className="cursor-pointer select-none hover:text-charcoal dark:hover:text-mist">How is this calculated?</summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>
              Each skill has a proficiency (0–100) built from your recorded evidence: self-declared skills and checked-off learning
              or project steps count a little; passing an assessment counts most; solved coding problems and GitHub links add more.
            </p>
            <p>
              A category is the importance-weighted average of its skills. Overall = 80% skill categories (weighted by importance)
              + 20% completed projects (full marks at 2 completed projects for this role). Under 35% is &ldquo;Getting
              started&rdquo;, under 60% &ldquo;Developing&rdquo;, under 80% &ldquo;Nearly ready&rdquo;, otherwise &ldquo;Job-ready&rdquo;.
            </p>
            <p>No AI model produces any of these numbers.</p>
          </div>
        </details>
      )}
    </div>
  );
}
