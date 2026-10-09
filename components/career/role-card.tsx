import type { RoleSuggestion } from "@/lib/role-suggestions";

export function RoleCard({
  role,
  selected,
  busy,
  onSelect,
}: {
  role: RoleSuggestion;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`rounded border p-5 transition-colors duration-150 ${
        selected
          ? "border-teal bg-teal/5 dark:border-teal-bright dark:bg-teal-bright/5"
          : "border-mist-line dark:border-ink-line"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
            {role.domain} · {role.difficulty}
          </p>
          <h3 className="mt-1 font-display text-lg leading-snug">{role.name}</h3>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl tabular-nums text-teal dark:text-teal-bright">
            {role.matchPercent}%
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
            match
          </p>
        </div>
      </div>

      <p className="mt-2 text-sm text-charcoal/60 dark:text-mist/55">{role.description}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
            Core technologies
          </p>
          <ul className="space-y-1 text-sm">
            {role.core.slice(0, 5).map((n) => (
              <li key={n} className="flex gap-2">
                <span className="text-teal dark:text-teal-bright" aria-hidden>✓</span>
                {n}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
            Missing skills
          </p>
          {role.missing.length === 0 ? (
            <p className="text-sm text-charcoal/55 dark:text-mist/50">Nothing missing.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {role.missing.slice(0, 5).map((n) => (
                <li key={n} className="flex gap-2">
                  <span className="text-amber-dim dark:text-amber-bright" aria-hidden>⚠</span>
                  {n}
                </li>
              ))}
              {role.missing.length > 5 && (
                <li className="text-xs text-charcoal/45 dark:text-mist/40">
                  +{role.missing.length - 5} more
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <details className="mt-4 text-xs text-charcoal/55 dark:text-mist/50">
        <summary className="cursor-pointer select-none hover:text-charcoal dark:hover:text-mist">
          How is this match calculated?
        </summary>
        <p className="mt-2 leading-relaxed">
          Each skill for this role has an importance (core = 3, expected = 2, nice-to-have = 1).
          Match = importance of the skills you already have ÷ total importance of the role&apos;s
          skills. Skills implied by what you picked (React implies JavaScript) count as covered.
        </p>
      </details>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-xs text-charcoal/50 dark:text-mist/45">
          {role.projectCount} recommended project{role.projectCount === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={onSelect}
          disabled={busy || selected}
          aria-pressed={selected}
          className={`rounded px-4 py-2 text-sm font-medium transition-colors disabled:cursor-default ${
            selected
              ? "border border-teal text-teal dark:border-teal-bright dark:text-teal-bright"
              : "bg-charcoal text-mist hover:bg-teal disabled:opacity-40 dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
          }`}
        >
          {selected ? "Your target role" : busy ? "Saving…" : "Choose as target role"}
        </button>
      </div>
    </div>
  );
}
