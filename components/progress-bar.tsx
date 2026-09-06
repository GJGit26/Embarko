export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-mist-line dark:bg-ink-line">
        <div
          className="h-full rounded-full bg-teal transition-all duration-500 ease-trail dark:bg-teal-bright"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-charcoal/60 dark:text-mist/55">
        {percent}%
      </span>
    </div>
  );
}
