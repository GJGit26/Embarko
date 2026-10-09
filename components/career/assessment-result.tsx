"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AdaptiveRecommendation, AssessmentBreakdown, QuestionResult, TopicScore } from "@/lib/career-types";
import { ProgressBar } from "@/components/progress-bar";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

export function AssessmentResult({
  attemptId,
  title,
  roadmapId,
  overall,
  breakdown,
  topicScores,
  weakTopics,
  strongTopics,
  passed,
  perQuestion,
  questionPrompts,
  initialRecs,
}: {
  attemptId: string;
  title: string;
  roadmapId: string | null;
  overall: number;
  breakdown: AssessmentBreakdown;
  topicScores: Record<string, TopicScore>;
  weakTopics: string[];
  strongTopics: string[];
  passed: boolean;
  perQuestion: QuestionResult[];
  questionPrompts: Record<string, string>;
  initialRecs: AdaptiveRecommendation[];
}) {
  const [recs, setRecs] = useState(initialRecs);
  const [adapting, setAdapting] = useState(false);
  const [adaptError, setAdaptError] = useState<string | null>(null);
  const tried = useRef(false);

  async function adapt() {
    setAdapting(true);
    setAdaptError(null);
    try {
      const res = await fetch("/api/adaptive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not build your revision plan");
      setRecs(json.recommendations ?? []);
    } catch (e: any) {
      setAdaptError(e.message);
    } finally {
      setAdapting(false);
    }
  }

  // Build the revision plan once, after the score is already on screen, so an AI
  // failure can never hide the result.
  useEffect(() => {
    if (tried.current || recs.length > 0 || !roadmapId) return;
    if (weakTopics.length === 0 && strongTopics.length === 0) return;
    tried.current = true;
    void adapt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topics = Object.entries(topicScores).sort((a, b) => a[1].pct - b[1].pct);

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-teal dark:text-teal-bright">Assessment result</p>
      <h1 className="mt-2 font-display text-3xl tracking-tight">{title}</h1>

      <div className="mt-8 rounded border border-mist-line p-6 dark:border-ink-line">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-mono text-4xl tabular-nums text-teal dark:text-teal-bright">{pct(overall)}</p>
            <p className="mt-1 text-sm text-charcoal/60 dark:text-mist/55">
              {passed ? "Passed" : "Below the 60% pass mark"} · weighted by question type
            </p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-4 text-sm">
          {([["Concept understanding", breakdown.concept], ["Problem solving", breakdown.problem_solving], ["Debugging", breakdown.debugging]] as const).map(([label, v]) => (
            <div key={label}>
              <dt className="text-xs text-charcoal/50 dark:text-mist/45">{label}</dt>
              <dd className="mt-0.5 font-mono tabular-nums">{pct(v)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-charcoal/50 dark:text-mist/45">
          Calculated from your answers: multiple-choice and debugging are checked against the answer key, coding by test cases
          run in your browser, and short answers by AI against fixed key points.
        </p>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">Weak areas</p>
          {weakTopics.length === 0 ? <p className="text-sm text-charcoal/55 dark:text-mist/50">None below 60%.</p> : (
            <ul className="space-y-1 text-sm">{weakTopics.map((t) => <li key={t}><span className="text-amber-dim dark:text-amber-bright">⚠</span> {t}</li>)}</ul>
          )}
        </div>
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">Strong areas</p>
          {strongTopics.length === 0 ? <p className="text-sm text-charcoal/55 dark:text-mist/50">None at 80% or above yet.</p> : (
            <ul className="space-y-1 text-sm">{strongTopics.map((t) => <li key={t}><span className="text-teal dark:text-teal-bright">✓</span> {t}</li>)}</ul>
          )}
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {topics.map(([t, s]) => (
          <div key={t}>
            <div className="flex justify-between text-xs"><span>{t}</span><span className="font-mono">{Math.round(s.pct * 100)}%</span></div>
            <div className="mt-1"><ProgressBar percent={Math.round(s.pct * 100)} /></div>
          </div>
        ))}
      </div>

      {roadmapId && (
        <section className="mt-12">
          <h2 className="font-display text-xl">What to do next</h2>
          {adapting && <p className="mt-3 text-sm text-charcoal/55 dark:text-mist/50">Building your revision plan…</p>}
          {adaptError && (
            <div className="mt-3 text-sm">
              <p className="text-rust">{adaptError}</p>
              <button type="button" onClick={adapt} className="mt-2 underline">Try again</button>
            </div>
          )}
          {!adapting && !adaptError && recs.length === 0 && (
            <p className="mt-3 text-sm text-charcoal/55 dark:text-mist/50">Nothing to revise — keep going with your roadmap.</p>
          )}
          {recs.length > 0 && (
            <p className="mt-3 text-sm text-charcoal/60 dark:text-mist/55">
              {recs.filter((r) => r.kind === "revise").length > 0 && <>Revise: {recs.filter((r) => r.kind === "revise").map((r) => r.topic).join(", ")}. </>}
              {recs.some((r) => r.kind === "skip") && <>Skim: {[...new Set(recs.filter((r) => r.kind === "skip").map((r) => r.topic))].join(", ")}. </>}
              Full steps and resources are on your roadmap page.
            </p>
          )}
          <Link href={`/roadmap/${roadmapId}`} className="mt-4 inline-block rounded bg-charcoal px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal dark:bg-amber dark:text-ink dark:hover:bg-amber-bright">
            Back to roadmap →
          </Link>
        </section>
      )}

      <details className="mt-12 text-sm">
        <summary className="cursor-pointer select-none font-mono text-xs uppercase tracking-wide text-charcoal/55 hover:text-charcoal dark:text-mist/50 dark:hover:text-mist">Question-by-question review</summary>
        <ul className="mt-4 space-y-4">
          {perQuestion.map((q) => (
            <li key={q.question_id} className="border-t border-mist-line/70 pt-3 dark:border-ink-line/70">
              <p className="font-mono text-[11px] text-charcoal/45 dark:text-mist/40">{q.topic} · {Math.round((q.earned / q.possible) * 100)}%</p>
              <p className="mt-1 line-clamp-2">{questionPrompts[q.question_id]}</p>
              {q.feedback && <p className="mt-1 text-xs text-charcoal/60 dark:text-mist/55">{q.feedback}</p>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
