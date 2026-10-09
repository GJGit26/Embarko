"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TakeAssessmentButton({
  roadmapId,
  phaseId,
  focusWeak,
  label,
}: {
  roadmapId: string;
  phaseId?: string;
  focusWeak?: boolean;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roadmapId, phaseId, focusWeak }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not create the assessment");
      router.push(`/assessment/${json.assessmentId}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="rounded border border-charcoal px-4 py-2 text-sm font-medium transition-colors hover:bg-charcoal hover:text-mist disabled:cursor-wait disabled:opacity-50 dark:border-mist/40 dark:hover:bg-mist/10"
      >
        {busy ? "Preparing your questions… (up to a minute)" : label}
      </button>
      {error && <p className="mt-2 text-xs text-rust">{error}</p>}
    </div>
  );
}
