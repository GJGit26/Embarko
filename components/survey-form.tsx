"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GOALS,
  Goal,
  INTEREST_DOMAINS,
  InterestDomain,
  LEARNING_STYLES,
  LearningStyle,
} from "@/lib/types";

const YEAR_OPTIONS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "Final Year",
  "Postgraduate",
];

const TOTAL_STEPS = 6;

const LOADING_MESSAGES = [
  "Reading your survey...",
  "Searching the knowledge base...",
  "Matching free and paid resources...",
  "Charting your phases...",
];

export function SurveyForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [yearSemester, setYearSemester] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [knownSkills, setKnownSkills] = useState<string[]>([]);
  const [interestDomain, setInterestDomain] = useState<InterestDomain | "">("");
  const [weeklyHours, setWeeklyHours] = useState(8);
  const [goal, setGoal] = useState<Goal | "">("");
  const [learningStyle, setLearningStyle] = useState<LearningStyle | "">("");

  function addSkill() {
    const trimmed = skillInput.trim();
    if (trimmed && !knownSkills.includes(trimmed)) {
      setKnownSkills([...knownSkills, trimmed]);
    }
    setSkillInput("");
  }

  function canAdvance(): boolean {
    switch (step) {
      case 0:
        return yearSemester !== "";
      case 1:
        return true; // skills are optional — a true beginner may have none
      case 2:
        return interestDomain !== "";
      case 3:
        return weeklyHours > 0;
      case 4:
        return goal !== "";
      case 5:
        return learningStyle !== "";
      default:
        return false;
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const messageTimer = setInterval(() => {
      setLoadingMsg((m) => (m + 1) % LOADING_MESSAGES.length);
    }, 2200);

    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yearSemester,
          knownSkills,
          interestDomain,
          weeklyHours,
          goal,
          learningStyle,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong");
      router.push(`/roadmap/${json.roadmapId}`);
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    } finally {
      clearInterval(messageTimer);
    }
  }

  if (submitting) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-mist-line border-t-teal dark:border-ink-line dark:border-t-teal-bright" />
        </div>
        <p className="mt-6 font-mono text-sm text-charcoal/70 dark:text-mist/65">
          {LOADING_MESSAGES[loadingMsg]}
        </p>
        <p className="mt-1 text-xs text-charcoal/45 dark:text-mist/40">
          This usually takes 10–20 seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-14 md:py-20">
      {/* Progress: a trail line with waypoints, not a generic percentage bar */}
      <div className="mb-12 flex items-center gap-1.5">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i <= step ? "bg-teal dark:bg-teal-bright" : "bg-mist-line dark:bg-ink-line"
            }`}
          />
        ))}
      </div>

      <p className="font-mono text-xs uppercase tracking-widest text-teal dark:text-teal-bright">
        Step {step + 1} of {TOTAL_STEPS}
      </p>

      {step === 0 && (
        <StepBlock title="Where are you in college?">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {YEAR_OPTIONS.map((y) => (
              <OptionCard key={y} selected={yearSemester === y} onClick={() => setYearSemester(y)}>
                {y}
              </OptionCard>
            ))}
          </div>
        </StepBlock>
      )}

      {step === 1 && (
        <StepBlock title="What do you already know?" hint="Optional — leave blank if you're starting fresh.">
          <div className="flex gap-2">
            <input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill();
                }
              }}
              placeholder="e.g. Python, HTML/CSS"
              className="flex-1 rounded border border-mist-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-teal dark:border-ink-line dark:focus:border-teal-bright"
            />
            <button
              type="button"
              onClick={addSkill}
              className="rounded border border-charcoal px-4 text-sm font-medium transition-colors hover:bg-charcoal hover:text-mist dark:border-mist/40 dark:hover:bg-mist/10 dark:hover:text-mist"
            >
              Add
            </button>
          </div>
          {knownSkills.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {knownSkills.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-1.5 rounded-full border border-mist-line px-3 py-1 text-xs dark:border-ink-line"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => setKnownSkills(knownSkills.filter((k) => k !== s))}
                    aria-label={`Remove ${s}`}
                    className="text-charcoal/40 hover:text-rust dark:text-mist/40"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </StepBlock>
      )}

      {step === 2 && (
        <StepBlock title="What do you want to get good at?">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {INTEREST_DOMAINS.map((d) => (
              <OptionCard key={d} selected={interestDomain === d} onClick={() => setInterestDomain(d)}>
                {d}
              </OptionCard>
            ))}
          </div>
        </StepBlock>
      )}

      {step === 3 && (
        <StepBlock title="How many hours a week can you realistically commit?">
          <div className="flex items-center gap-6">
            <input
              type="range"
              min={2}
              max={40}
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(Number(e.target.value))}
              className="flex-1 accent-teal"
            />
            <span className="font-mono text-2xl tabular-nums text-teal dark:text-teal-bright">
              {weeklyHours}h
            </span>
          </div>
          <p className="mt-3 text-xs text-charcoal/50 dark:text-mist/45">
            Be honest — the roadmap's phase count and pacing are built around this number.
          </p>
        </StepBlock>
      )}

      {step === 4 && (
        <StepBlock title="What's this roadmap for?">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {GOALS.map((g) => (
              <OptionCard key={g} selected={goal === g} onClick={() => setGoal(g)}>
                {g}
              </OptionCard>
            ))}
          </div>
        </StepBlock>
      )}

      {step === 5 && (
        <StepBlock title="How do you learn best?">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {LEARNING_STYLES.map((l) => (
              <OptionCard key={l} selected={learningStyle === l} onClick={() => setLearningStyle(l)}>
                {l}
              </OptionCard>
            ))}
          </div>
        </StepBlock>
      )}

      {error && <p className="mt-6 text-sm text-rust">{error}</p>}

      <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="text-sm text-charcoal/50 transition-colors hover:text-charcoal disabled:opacity-0 dark:text-mist/45 dark:hover:text-mist"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!canAdvance()}
          onClick={() => (step === TOTAL_STEPS - 1 ? handleSubmit() : setStep((s) => s + 1))}
          className="rounded bg-charcoal px-6 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-30 dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
        >
          {step === TOTAL_STEPS - 1 ? "Generate my roadmap" : "Continue"}
        </button>
      </div>
    </div>
  );
}

function StepBlock({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <h2 className="font-display text-2xl tracking-tight">{title}</h2>
      {hint && <p className="mt-1 text-sm text-charcoal/50 dark:text-mist/45">{hint}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-4 py-3.5 text-left text-sm transition-colors duration-150 ${
        selected
          ? "border-teal bg-teal/10 text-charcoal dark:border-teal-bright dark:bg-teal-bright/10 dark:text-mist"
          : "border-mist-line hover:border-charcoal/30 dark:border-ink-line dark:hover:border-mist/30"
      }`}
    >
      {children}
    </button>
  );
}
