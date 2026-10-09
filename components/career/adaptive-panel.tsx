"use client";

import { useState } from "react";
import type { AdaptiveRecommendation } from "@/lib/career-types";
import { TakeAssessmentButton } from "@/components/career/take-assessment-button";

const KIND_LABEL: Record<AdaptiveRecommendation["kind"], string> = {
  revise: "Revise",
  practice: "Practice",
  mini_project: "Mini project",
  skip: "Move faster",
};

export function AdaptivePanel({
  roadmapId,
  initial,
}: {
  roadmapId: string;
  initial: AdaptiveRecommendation[];
}) {
  const [recs, setRecs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  if (recs.length === 0) return null;

  async function setStatus(id: string, status: "done" | "dismissed") {
    setError(null);
    const res = await fetch(`/api/adaptive/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Could not update that recommendation");
      return;
    }
    setRecs((r) => r.filter((x) => x.id !== id));
  }

  const hasRevise = recs.some((r) => r.kind === "revise");

  return (
    <section className="mt-8 rounded border border-amber/60 p-5" aria-label="Adaptive recommendations">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg">Based on your assessment</h2>
        <span className="font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
          your roadmap below is unchanged
        </span>
      </div>

      <ul className="mt-4 space-y-5">
        {recs.map((r) => (
          <li key={r.id} className="border-t border-mist-line/70 pt-4 first:border-t-0 first:pt-0 dark:border-ink-line/70">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-amber-dim dark:text-amber-bright">
                  {KIND_LABEL[r.kind]}
                </p>
                <p className="mt-0.5 text-sm font-medium">{r.title}</p>
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                <button type="button" onClick={() => setStatus(r.id, "done")} className="underline hover:text-teal dark:hover:text-teal-bright">
                  Done
                </button>
                <button type="button" onClick={() => setStatus(r.id, "dismissed")} className="text-charcoal/50 underline hover:text-charcoal dark:text-mist/45 dark:hover:text-mist">
                  Dismiss
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-sm text-charcoal/65 dark:text-mist/60">{r.description}</p>

            {r.steps.length > 0 && (
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
                {r.steps.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{s.title}</span>
                    {s.description && <span className="text-charcoal/55 dark:text-mist/50"> — {s.description}</span>}
                  </li>
                ))}
              </ol>
            )}

            {r.resources.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {r.resources.map((res, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    {res.url ? (
                      <a href={res.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-teal dark:hover:text-teal-bright">
                        {res.title}
                      </a>
                    ) : (
                      res.title
                    )}
                    <span className="font-mono text-[10px] uppercase text-charcoal/45 dark:text-mist/40">
                      {res.provider ? `${res.provider} · ` : ""}
                      {res.is_free ? "free" : res.price_usd != null ? `$${res.price_usd}` : "paid"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 text-xs text-rust">{error}</p>}

      {hasRevise && (
        <div className="mt-5 border-t border-mist-line/70 pt-4 dark:border-ink-line/70">
          <p className="mb-2 text-xs text-charcoal/55 dark:text-mist/50">Finished revising? Check the gap has closed.</p>
          <TakeAssessmentButton roadmapId={roadmapId} focusWeak label="Reassess weak topics" />
        </div>
      )}
    </section>
  );
}
