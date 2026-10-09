"use client";

import { useState } from "react";
import { ProgressBar } from "@/components/progress-bar";

interface MilestoneView {
  id: string;
  position: number;
  title: string;
  description: string;
  skills: string[];
}

export function MilestoneList({
  projectSlug,
  milestones,
  initialCompleted,
  initialUrls,
  initiallyStarted,
}: {
  projectSlug: string;
  milestones: MilestoneView[];
  initialCompleted: string[];
  initialUrls: Record<string, string>;
  initiallyStarted: boolean;
}) {
  const [started, setStarted] = useState(initiallyStarted);
  const [completed, setCompleted] = useState<Set<string>>(new Set(initialCompleted));
  const [urls, setUrls] = useState<Record<string, string>>(initialUrls);
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>(initialUrls);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const percent = milestones.length ? Math.round((100 * completed.size) / milestones.length) : 0;
  const firstOpen = milestones.find((m) => !completed.has(m.id))?.id;

  async function start() {
    setBusy("start");
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/start`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not start the project");
      setStarted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function update(m: MilestoneView, isComplete: boolean, submissionUrl?: string) {
    setBusy(m.id);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/milestones/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isComplete, submissionUrl: submissionUrl || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not update the milestone");
      setCompleted(new Set<string>(json.completedMilestoneIds));
      setUrls((u) => {
        const next = { ...u };
        if (isComplete && submissionUrl) next[m.id] = submissionUrl;
        else delete next[m.id];
        return next;
      });
      if (isComplete) {
        setNote(
          `Evidence recorded for ${(json.skills as string[]).join(", ")}. Passing an assessment is what marks a skill as demonstrated.`
        );
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="rounded border border-mist-line p-4 dark:border-ink-line">
        <div className="flex items-center justify-between text-xs text-charcoal/55 dark:text-mist/50">
          <span>Project progress</span>
          <span className="font-mono">
            {completed.size} / {milestones.length} milestones
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar percent={percent} />
        </div>
        {!started && (
          <button
            type="button"
            onClick={start}
            disabled={busy === "start"}
            className="mt-4 rounded bg-charcoal px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal disabled:opacity-40 dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
          >
            {busy === "start" ? "Starting…" : "Start this project"}
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-rust">{error}</p>}
      {note && <p className="mt-4 text-sm text-teal dark:text-teal-bright">{note}</p>}

      <ol className="mt-8 divide-y divide-mist-line/70 border-t border-mist-line/70 dark:divide-ink-line/70 dark:border-ink-line/70">
        {milestones.map((m) => {
          const done = completed.has(m.id);
          const current = started && m.id === firstOpen;
          return (
            <li key={m.id} className="py-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => update(m, !done)}
                  disabled={!started || busy !== null}
                  aria-pressed={done}
                  aria-label={done ? `Mark "${m.title}" incomplete` : `Mark "${m.title}" complete`}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                    done
                      ? "border-teal bg-teal dark:border-teal-bright dark:bg-teal-bright"
                      : current
                        ? "border-amber"
                        : "border-mist-line dark:border-ink-line"
                  }`}
                >
                  {done && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M20 6 9 17l-5-5" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm ${
                      done ? "text-charcoal/45 line-through dark:text-mist/40" : "text-charcoal dark:text-mist"
                    }`}
                  >
                    <span className="mr-2 font-mono text-xs text-charcoal/40 dark:text-mist/35">
                      {m.position}
                    </span>
                    {m.title}
                    {current && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-amber-dim dark:text-amber-bright">
                        up next
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-charcoal/50 dark:text-mist/45">{m.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.skills.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-mist-line px-2 py-0.5 text-[11px] text-charcoal/55 dark:border-ink-line dark:text-mist/50"
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  {done && (
                    <div className="mt-3">
                      {urls[m.id] ? (
                        <p className="text-xs text-charcoal/55 dark:text-mist/50">
                          Submitted:{" "}
                          <a
                            href={urls[m.id]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-teal dark:hover:text-teal-bright"
                          >
                            {urls[m.id].replace("https://", "")}
                          </a>
                        </p>
                      ) : null}
                      <div className="mt-1.5 flex gap-2">
                        <input
                          value={draftUrls[m.id] ?? ""}
                          onChange={(e) => setDraftUrls((d) => ({ ...d, [m.id]: e.target.value }))}
                          placeholder="https://github.com/you/repo (optional)"
                          aria-label={`GitHub link for ${m.title}`}
                          className="min-w-0 flex-1 rounded border border-mist-line bg-transparent px-2.5 py-1.5 text-xs outline-none focus:border-teal dark:border-ink-line dark:focus:border-teal-bright"
                        />
                        <button
                          type="button"
                          onClick={() => update(m, true, draftUrls[m.id])}
                          disabled={busy !== null || !(draftUrls[m.id] ?? "").trim()}
                          className="rounded border border-charcoal px-3 text-xs font-medium transition-colors hover:bg-charcoal hover:text-mist disabled:opacity-30 dark:border-mist/40 dark:hover:bg-mist/10"
                        >
                          Save link
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
