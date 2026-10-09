"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientQuestion, CodingPayload, DebugPayload, McqPayload } from "@/lib/career-types";
import { runCodingTests, RunResult } from "@/lib/code-runner";

const LETTERS = ["A", "B", "C", "D"];
const TYPE_LABEL = { mcq: "Multiple choice", concept: "Short answer", coding: "Coding", debug: "Debugging" } as const;

function Options({ options, value, onChange, name }: { options: string[]; value: number | undefined; onChange: (i: number) => void; name: string }) {
  return (
    <div role="radiogroup" className="mt-3 space-y-2">
      {options.map((o, i) => (
        <label
          key={i}
          className={`flex cursor-pointer gap-3 rounded border px-3 py-2.5 text-sm transition-colors ${
            value === i
              ? "border-teal bg-teal/5 dark:border-teal-bright dark:bg-teal-bright/5"
              : "border-mist-line hover:border-charcoal/30 dark:border-ink-line dark:hover:border-mist/30"
          }`}
        >
          <input type="radio" name={name} checked={value === i} onChange={() => onChange(i)} className="sr-only" />
          <span className="font-mono text-xs text-charcoal/50 dark:text-mist/45">{LETTERS[i]}</span>
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}

export function AssessmentRunner({ assessmentId, title, questions }: { assessmentId: string; title: string; questions: ClientQuestion[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [code, setCode] = useState<Record<string, string>>(
    Object.fromEntries(questions.filter((q) => q.type === "coding").map((q) => [q.id, (q.payload as CodingPayload).starter_code]))
  );
  const [runs, setRuns] = useState<Record<string, RunResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answered = questions.filter((q) => {
    if (q.type === "coding") return Boolean(runs[q.id]);
    const a = answers[q.id];
    return typeof a === "number" || (typeof a === "string" && a.trim().length > 0);
  }).length;

  async function run(q: ClientQuestion) {
    const p = q.payload as CodingPayload;
    setRunning(q.id);
    const r = await runCodingTests(code[q.id] ?? "", p.function_name, p.tests);
    setRuns((prev) => ({ ...prev, [q.id]: r }));
    setRunning(null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const coding = Object.fromEntries(
        Object.entries(runs).map(([id, r]) => [id, { passed: r.passed, total: r.total }])
      );
      const res = await fetch(`/api/assessments/${assessmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, coding }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) return router.refresh(); // already submitted -> show the result
      if (!res.ok) throw new Error(json.error || "Could not submit your answers");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-teal dark:text-teal-bright">Assessment</p>
      <h1 className="mt-2 font-display text-3xl tracking-tight">{title}</h1>
      <p className="mt-3 text-sm text-charcoal/60 dark:text-mist/55">
        {questions.length} questions. Unanswered questions score zero, so answer what you can. Coding questions run your code
        against the tests in your browser — run them before you submit.
      </p>

      <ol className="mt-10 space-y-10">
        {questions.map((q, n) => (
          <li key={q.id}>
            <p className="font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
              {n + 1} · {TYPE_LABEL[q.type]} · {q.topic}
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed">{q.prompt}</p>

            {q.type === "mcq" && (
              <Options name={q.id} options={(q.payload as McqPayload).options} value={answers[q.id] as number | undefined} onChange={(i) => setAnswers((a) => ({ ...a, [q.id]: i }))} />
            )}

            {q.type === "debug" && (
              <>
                <pre className="mt-3 overflow-x-auto rounded border border-mist-line bg-charcoal/[0.03] p-3 font-mono text-xs leading-relaxed dark:border-ink-line dark:bg-mist/[0.03]">
                  <code>{(q.payload as DebugPayload).code}</code>
                </pre>
                <Options name={q.id} options={(q.payload as DebugPayload).options} value={answers[q.id] as number | undefined} onChange={(i) => setAnswers((a) => ({ ...a, [q.id]: i }))} />
              </>
            )}

            {q.type === "concept" && (
              <textarea
                value={(answers[q.id] as string) ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                maxLength={1500}
                rows={4}
                placeholder="Answer in a few sentences…"
                aria-label={`Answer for question ${n + 1}`}
                className="mt-3 w-full rounded border border-mist-line bg-transparent p-3 text-sm outline-none focus:border-teal dark:border-ink-line dark:focus:border-teal-bright"
              />
            )}

            {q.type === "coding" && (() => {
              const p = q.payload as CodingPayload;
              const r = runs[q.id];
              return (
                <div className="mt-3">
                  <p className="whitespace-pre-wrap text-sm text-charcoal/70 dark:text-mist/65">{p.problem}</p>
                  <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                    <div><dt className="font-mono uppercase tracking-wide text-charcoal/45 dark:text-mist/40">Input</dt><dd className="mt-0.5">{p.input_description}</dd></div>
                    <div><dt className="font-mono uppercase tracking-wide text-charcoal/45 dark:text-mist/40">Output</dt><dd className="mt-0.5">{p.output_description}</dd></div>
                  </dl>
                  <div className="mt-3 space-y-1 font-mono text-xs">
                    {p.examples.map((ex, i) => (
                      <p key={i}>
                        <span className="text-charcoal/45 dark:text-mist/40">Example {i + 1}:</span> {p.function_name}({ex.args.map((a) => JSON.stringify(a)).join(", ")}) → {JSON.stringify(ex.expected)}
                      </p>
                    ))}
                  </div>
                  {p.constraints.length > 0 && (
                    <ul className="mt-3 list-disc pl-5 text-xs text-charcoal/60 dark:text-mist/55">
                      {p.constraints.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  )}
                  <textarea
                    value={code[q.id] ?? ""}
                    onChange={(e) => { setCode((c) => ({ ...c, [q.id]: e.target.value })); setRuns((x) => { const { [q.id]: _drop, ...rest } = x; return rest; }); }}
                    spellCheck={false}
                    rows={10}
                    aria-label={`Code for question ${n + 1}`}
                    className="mt-3 w-full rounded border border-mist-line bg-transparent p-3 font-mono text-xs leading-relaxed outline-none focus:border-teal dark:border-ink-line dark:focus:border-teal-bright"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => run(q)} disabled={running !== null} className="rounded border border-charcoal px-4 py-1.5 text-xs font-medium transition-colors hover:bg-charcoal hover:text-mist disabled:opacity-40 dark:border-mist/40 dark:hover:bg-mist/10">
                      {running === q.id ? "Running…" : "Run tests"}
                    </button>
                    {r && !r.error && (
                      <span className={`font-mono text-xs ${r.passed === r.total ? "text-teal dark:text-teal-bright" : "text-amber-dim dark:text-amber-bright"}`}>
                        {r.passed}/{r.total} tests passed
                      </span>
                    )}
                    {r?.error && <span className="text-xs text-rust">{r.error}</span>}
                  </div>
                </div>
              );
            })()}
          </li>
        ))}
      </ol>

      {error && <p className="mt-8 text-sm text-rust">{error}</p>}

      <div className="mt-12 flex items-center gap-4 border-t border-mist-line pt-6 dark:border-ink-line">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded bg-charcoal px-6 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal disabled:cursor-wait disabled:opacity-40 dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
        >
          {submitting ? "Grading… (short answers are graded by AI)" : "Submit answers"}
        </button>
        <span className="font-mono text-xs text-charcoal/45 dark:text-mist/40">{answered} / {questions.length} answered</span>
      </div>
    </div>
  );
}
