import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";
import { StepItem } from "@/components/step-item";
import { ProgressBar } from "@/components/progress-bar";
import { ResourceCard } from "@/components/resource-card";
import { AdaptivePanel } from "@/components/career/adaptive-panel";
import { TakeAssessmentButton } from "@/components/career/take-assessment-button";
import { loadPendingRecommendations } from "@/lib/career-data";
import type { AdaptiveRecommendation } from "@/lib/career-types";

export default async function RoadmapPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: roadmap } = await supabase
    .from("roadmaps")
    .select("id, title, summary, domain, created_at")
    .eq("id", params.id)
    .single();

  if (!roadmap) notFound();

  const { data: progress } = await supabase
    .from("roadmap_progress")
    .select("percent_complete, total_steps, completed_steps")
    .eq("roadmap_id", params.id)
    .maybeSingle();

  const { data: phases } = await supabase
    .from("roadmap_phases")
    .select(
      "id, position, title, description, estimated_weeks, roadmap_steps(id, position, title, description, is_complete), phase_resources(id, title, url, provider, is_free, price_usd, format)"
    )
    .eq("roadmap_id", params.id)
    .order("position");

  // Adaptive layer. If supabase/adaptive.sql hasn't been applied this query
  // fails; the page then renders exactly as it did before (no buttons, no panel).
  let recs: AdaptiveRecommendation[] = [];
  let adaptiveReady = true;
  try {
    recs = await loadPendingRecommendations(supabase, user.id, params.id);
  } catch (err) {
    // Don't hide this silently: a missing adaptive.sql / RLS problem shows up here.
    console.error("[roadmap] adaptive recommendations failed to load:", err);
    adaptiveReady = false;
  }
  const skipHint = new Map<string, string>();
  for (const r of recs) if (r.kind === "skip") for (const id of r.target_step_ids) skipHint.set(id, `Strong result on ${r.topic} — skim this`);
  const visibleRecs = recs.filter((r) => r.kind !== "skip" || r.target_step_ids.length > 0);

  return (
    <div className="min-h-screen">
      <NavBar isAuthed />

      <div className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-mono text-xs uppercase tracking-widest text-teal dark:text-teal-bright">
          {roadmap.domain}
        </p>
        <h1 className="mt-3 font-display text-3xl tracking-tight md:text-4xl">
          {roadmap.title}
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-charcoal/70 dark:text-mist/65">
          {roadmap.summary}
        </p>

        <div className="mt-8 rounded border border-mist-line p-4 dark:border-ink-line">
          <div className="flex items-center justify-between text-xs text-charcoal/55 dark:text-mist/50">
            <span>Overall progress</span>
            <span className="font-mono">
              {progress?.completed_steps ?? 0} / {progress?.total_steps ?? 0} steps
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar percent={progress?.percent_complete ?? 0} />
          </div>
        </div>

        {adaptiveReady && <AdaptivePanel roadmapId={roadmap.id} initial={visibleRecs} />}

        <ol className="relative mt-14 space-y-14 border-l border-mist-line pl-8 dark:border-ink-line md:pl-10">
          {(phases ?? []).map((phase) => {
            const steps = [...(phase.roadmap_steps ?? [])].sort(
              (a, b) => a.position - b.position
            );
            const resources = phase.phase_resources ?? [];

            return (
              <li key={phase.id} className="relative">
                <span className="absolute -left-[41px] top-0 flex h-8 w-8 items-center justify-center rounded-full border border-teal bg-mist font-mono text-xs text-teal dark:border-teal-bright dark:bg-ink dark:text-teal-bright md:-left-[49px]">
                  {phase.position}
                </span>

                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-xl tracking-tight">{phase.title}</h2>
                  {phase.estimated_weeks && (
                    <span className="font-mono text-xs text-charcoal/45 dark:text-mist/40">
                      ~{phase.estimated_weeks} weeks
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-charcoal/70 dark:text-mist/65">
                  {phase.description}
                </p>

                {steps.length > 0 && (
                  <ul className="mt-5 divide-y divide-mist-line/70 border-t border-mist-line/70 dark:divide-ink-line/70 dark:border-ink-line/70">
                    {steps.map((step) => (
                      <StepItem
                        key={step.id}
                        roadmapId={roadmap.id}
                        stepId={step.id}
                        title={step.title}
                        description={step.description}
                        initialComplete={step.is_complete}
                        hint={skipHint.get(step.id)}
                      />
                    ))}
                  </ul>
                )}

                {/* Always shown. If the career tables are missing, clicking surfaces the
                    API error instead of the button vanishing. */}
                <div className="mt-6">
                  <TakeAssessmentButton roadmapId={roadmap.id} phaseId={phase.id} label="Take phase assessment" />
                </div>

                {resources.length > 0 && (
                  <div className="mt-6">
                    <p className="mb-3 font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
                      Resources for this phase
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {resources.map((r) => (
                        <ResourceCard
                          key={r.id}
                          title={r.title}
                          url={r.url}
                          provider={r.provider}
                          isFree={r.is_free}
                          priceUsd={r.price_usd}
                          format={r.format}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
