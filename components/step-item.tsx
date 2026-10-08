"use client";

import { useState, useTransition } from "react";

export function StepItem({
  roadmapId,
  stepId,
  title,
  description,
  initialComplete,
}: {
  roadmapId: string;
  stepId: string;
  title: string;
  description: string | null;
  initialComplete: boolean;
}) {
  const [isComplete, setIsComplete] = useState(initialComplete);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !isComplete;
    setIsComplete(next); // optimistic

    startTransition(async () => {
      const res = await fetch(`/api/roadmap/${roadmapId}/steps/${stepId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isComplete: next }),
      });
      if (!res.ok) setIsComplete(!next); // revert on failure
    });
  }

  return (
    <li className="flex gap-3 py-3">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={isComplete}
        aria-label={isComplete ? `Mark "${title}" incomplete` : `Mark "${title}" complete`}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
          isComplete
            ? "border-teal bg-teal dark:border-teal-bright dark:bg-teal-bright"
            : "border-mist-line dark:border-ink-line"
        }`}
      >
        {isComplete && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M20 6 9 17l-5-5"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <div>
        <p
          className={`text-sm transition-colors ${
            isComplete
              ? "text-charcoal/45 line-through dark:text-mist/40"
              : "text-charcoal dark:text-mist"
          }`}
        >
          {title}
        </p>
        {description && (
          <p className="mt-0.5 text-xs text-charcoal/50 dark:text-mist/45">{description}</p>
        )}
      </div>
    </li>
  );
}
