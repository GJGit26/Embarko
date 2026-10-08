export function ResourceCard({
  title,
  url,
  provider,
  isFree,
  priceUsd,
  format,
}: {
  title: string;
  url: string | null;
  provider: string | null;
  isFree: boolean;
  priceUsd: number | null;
  format: string | null;
}) {
  const content = (
    <div className="group flex h-full flex-col justify-between rounded border border-mist-line p-3.5 transition-colors duration-150 hover:border-charcoal/30 dark:border-ink-line dark:hover:border-mist/30">
      <div>
        <p className="text-sm font-medium leading-snug text-charcoal group-hover:text-teal dark:text-mist dark:group-hover:text-teal-bright">
          {title}
        </p>
        {provider && (
          <p className="mt-1 text-xs text-charcoal/50 dark:text-mist/45">{provider}</p>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
            isFree
              ? "bg-teal/10 text-teal dark:bg-teal-bright/10 dark:text-teal-bright"
              : "bg-amber/15 text-amber-dim dark:bg-amber/15 dark:text-amber-bright"
          }`}
        >
          {isFree ? "Free" : priceUsd ? `$${priceUsd}` : "Paid"}
        </span>
        {format && (
          <span className="font-mono text-[10px] uppercase tracking-wide text-charcoal/40 dark:text-mist/35">
            {format}
          </span>
        )}
      </div>
    </div>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block h-full">
        {content}
      </a>
    );
  }
  return content;
}
