import type { SkillGap } from "@/lib/skills-engine";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/career/status-badge";

export function SkillGapPanel({ roleName, gap }: { roleName: string; gap: SkillGap }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">Skill gap for {roleName}</h3>
        <span className="font-mono text-xs text-charcoal/50 dark:text-mist/45">
          {gap.demonstrated.length} demonstrated · {gap.gaps.length} to go
        </span>
      </div>
      <div className="mt-3">
        <ProgressBar percent={gap.coveragePercent} />
        <p className="mt-1.5 text-xs text-charcoal/50 dark:text-mist/45">
          Coverage is the importance-weighted average of your evidence-based proficiency in each skill
          the role needs. Selecting a skill gives you a head start; only assessments you pass can mark
          it as demonstrated.
        </p>
      </div>

      {gap.gaps.length > 0 && (
        <ul className="mt-5 divide-y divide-mist-line/70 border-t border-mist-line/70 dark:divide-ink-line/70 dark:border-ink-line/70">
          {gap.gaps.slice(0, 10).map((g) => (
            <li key={g.skill.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex items-center gap-2">
                {g.skill.name}
                {g.importance === 3 && (
                  <span className="font-mono text-[10px] uppercase tracking-wide text-charcoal/40 dark:text-mist/35">
                    core
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-xs tabular-nums text-charcoal/50 dark:text-mist/45">
                  {g.state.proficiency}%
                </span>
                <StatusBadge status={g.state.status} />
              </span>
            </li>
          ))}
          {gap.gaps.length > 10 && (
            <li className="py-2.5 text-xs text-charcoal/45 dark:text-mist/40">
              +{gap.gaps.length - 10} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
