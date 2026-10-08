"use client";

import { useState, useTransition } from "react";

export function DeleteRoadmapButton({
  roadmapId,
  onDeleted,
}: {
  roadmapId: string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirming) {
      setConfirming(true);
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/roadmap/${roadmapId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDeleted();
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Could not delete this roadmap.");
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-label={confirming ? `Confirm delete` : `Delete roadmap`}
        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
          confirming
            ? "bg-rust text-mist hover:bg-rust/85"
            : "text-charcoal/40 hover:bg-rust/10 hover:text-rust dark:text-mist/40 dark:hover:text-rust"
        }`}
      >
        {isPending ? "Deleting..." : confirming ? "Confirm delete?" : "Delete"}
      </button>
      {confirming && !isPending && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirming(false);
          }}
          className="text-xs text-charcoal/40 hover:text-charcoal dark:text-mist/40 dark:hover:text-mist"
        >
          Cancel
        </button>
      )}
      {error && <p className="text-xs text-rust">{error}</p>}
    </div>
  );
}
