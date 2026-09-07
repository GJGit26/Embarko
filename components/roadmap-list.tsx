"use client";

import { useState } from "react";
import Link from "next/link";
import { ProgressBar } from "@/components/progress-bar";
import { DeleteRoadmapButton } from "@/components/delete-roadmap-button";

export interface DashboardRoadmap {
  id: string;
  title: string;
  summary: string;
  domain: string;
  percentComplete: number;
}

export function RoadmapList({
  initialRoadmaps,
}: {
  initialRoadmaps: DashboardRoadmap[];
}) {
  const [roadmaps, setRoadmaps] = useState(initialRoadmaps);

  if (roadmaps.length === 0) {
    return (
      <div className="mt-16 rounded border border-dashed border-mist-line p-12 text-center dark:border-ink-line">
        <p className="font-display text-xl">No roadmap yet.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal/60 dark:text-mist/55">
          Answer six questions and we'll retrieve a phased plan from the
          knowledge base, built around your actual time and goals.
        </p>
        <Link
          href="/survey"
          className="mt-6 inline-block rounded bg-charcoal px-6 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
        >
          Start the survey
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {roadmaps.map((r) => (
        <Link
          key={r.id}
          href={`/roadmap/${r.id}`}
          className="group rounded border border-mist-line p-5 transition-colors duration-150 hover:border-charcoal/30 dark:border-ink-line dark:hover:border-mist/30"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
              {r.domain}
            </p>
            <DeleteRoadmapButton
              roadmapId={r.id}
              onDeleted={() =>
                setRoadmaps((prev) => prev.filter((x) => x.id !== r.id))
              }
            />
          </div>
          <h2 className="mt-1.5 font-display text-lg leading-snug group-hover:text-teal dark:group-hover:text-teal-bright">
            {r.title}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm text-charcoal/60 dark:text-mist/55">
            {r.summary}
          </p>
          <div className="mt-4">
            <ProgressBar percent={r.percentComplete} />
          </div>
        </Link>
      ))}
    </div>
  );
}
