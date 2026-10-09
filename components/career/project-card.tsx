import Link from "next/link";
import type { ProjectRecommendation } from "@/lib/skills-engine";
import { ProgressBar } from "@/components/progress-bar";

export function ProjectCard({
  rec,
  percent,
  status,
}: {
  rec: ProjectRecommendation;
  percent: number | null; // null = not started
  status: "in_progress" | "completed" | null;
}) {
  const p = rec.project;
  return (
    <Link
      href={`/projects/${p.slug}`}
      className="group block rounded border border-mist-line p-5 transition-colors duration-150 hover:border-charcoal/30 dark:border-ink-line dark:hover:border-mist/30"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
          {p.difficulty} · ~{p.estimatedHours}h · {p.milestones.length} milestones
        </p>
        {status === "completed" && (
          <span className="font-mono text-[10px] uppercase tracking-wide text-teal dark:text-teal-bright">
            Completed
          </span>
        )}
      </div>
      <h3 className="mt-1.5 font-display text-lg leading-snug group-hover:text-teal dark:group-hover:text-teal-bright">
        {p.name}
      </h3>
      <p className="mt-2 text-sm text-charcoal/60 dark:text-mist/55">{p.description}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {rec.allSkills.map((s) => (
          <span
            key={s.slug}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              rec.gapSkills.includes(s.name)
                ? "border-amber/50 text-amber-dim dark:text-amber-bright"
                : "border-mist-line text-charcoal/55 dark:border-ink-line dark:text-mist/50"
            }`}
          >
            {s.name}
          </span>
        ))}
      </div>
      {rec.gapSkills.length > 0 && (
        <p className="mt-2 text-xs text-charcoal/50 dark:text-mist/45">
          Highlighted skills are gaps this project helps close.
        </p>
      )}

      {percent !== null && (
        <div className="mt-4">
          <ProgressBar percent={percent} />
        </div>
      )}
    </Link>
  );
}
