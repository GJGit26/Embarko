import type { SkillStatus } from "@/lib/career-types";
import { StatusBadge } from "@/components/career/status-badge";

export interface EvidenceView {
  skill: string;
  proficiency: number;
  status: SkillStatus;
  items: { label: string; verified: boolean }[];
}

export function SkillEvidenceList({ skills }: { skills: EvidenceView[] }) {
  if (skills.length === 0) {
    return (
      <p className="text-sm text-charcoal/55 dark:text-mist/50">
        No evidence yet. Check off roadmap steps, complete project milestones, or take an assessment to start building it.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {skills.map((s) => (
        <li key={s.skill} className="rounded border border-mist-line dark:border-ink-line">
          <details>
            <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium">{s.skill}</span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-xs tabular-nums text-charcoal/50 dark:text-mist/45">{s.proficiency}%</span>
                <StatusBadge status={s.status} />
              </span>
            </summary>
            <ul className="space-y-1 border-t border-mist-line/70 px-4 py-3 text-xs dark:border-ink-line/70">
              {s.items.map((i, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className={i.verified ? "text-teal dark:text-teal-bright" : "text-charcoal/40 dark:text-mist/35"} aria-hidden>
                    {i.verified ? "✓" : "○"}
                  </span>
                  <span>
                    {i.label}
                    {!i.verified && <span className="text-charcoal/40 dark:text-mist/35"> · self-reported</span>}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
