import type { SkillStatus } from "@/lib/career-types";

const LABEL: Record<SkillStatus, string> = {
  none: "No evidence",
  claimed: "Claimed",
  practicing: "Practicing",
  demonstrated: "Demonstrated",
};

const STYLE: Record<SkillStatus, string> = {
  none: "text-charcoal/45 dark:text-mist/40",
  claimed: "bg-amber/15 text-amber-dim dark:text-amber-bright",
  practicing: "bg-teal/10 text-teal dark:bg-teal-bright/10 dark:text-teal-bright",
  demonstrated: "bg-teal text-mist dark:bg-teal-bright dark:text-ink",
};

export function StatusBadge({ status }: { status: SkillStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${STYLE[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}
