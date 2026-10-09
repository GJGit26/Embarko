import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCareerState, loadPendingRecommendations, loadRecentAttempts } from "@/lib/career-data";
import { ReadinessPanel } from "@/components/career/readiness-panel";
import { ProgressBar } from "@/components/progress-bar";

const cardLabel = "font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40";

/**
 * Career summary for the dashboard. Reads stored data only — no AI calls and no
 * regeneration. If the career tables aren't set up (adaptive.sql not applied),
 * renders nothing so the original dashboard is unchanged.
 */
export async function DashboardSnapshot({ userId }: { userId: string }) {
  const supabase = createClient();
  let data;
  try {
    const state = await loadCareerState(supabase, userId);
    if (state.roles.length === 0) {
      return (
        <section className="mt-10 rounded border border-dashed border-mist-line p-6 dark:border-ink-line">
          <p className="font-display text-lg">The career catalog is empty</p>
          <p className="mt-1 text-sm text-charcoal/60 dark:text-mist/55">
            Run <code className="font-mono">npm run seed:career</code> to load roles, skills and projects.
          </p>
        </section>
      );
    }
    const [attempts, recs, roadmap] = await Promise.all([
      loadRecentAttempts(supabase, userId, 1),
      state.targetRole ? loadPendingRecommendations(supabase, userId) : Promise.resolve([]),
      state.targetRole
        ? supabase.from("roadmaps").select("id, title").eq("role_id", state.targetRole.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    data = { state, attempts, recs, roadmap: roadmap.data };
  } catch (err: any) {
    // Previously this returned null, so the whole career section silently
    // vanished after login. Log the cause and show a visible notice instead.
    console.error("[dashboard] career snapshot failed:", err);
    return (
      <section className="mt-10 rounded border border-dashed border-mist-line p-6 dark:border-ink-line">
        <p className="font-display text-lg">Career features aren&apos;t available yet</p>
        <p className="mt-1 text-sm text-charcoal/60 dark:text-mist/55">
          Apply <code className="font-mono">supabase/adaptive.sql</code> in Supabase, then run{" "}
          <code className="font-mono">npm run seed:career</code>.
          {process.env.NODE_ENV === "development" && err?.message ? ` (${err.message})` : ""}
        </p>
      </section>
    );
  }
  const { state, attempts, recs, roadmap } = data;

  if (!state.targetRole || !state.gap || !state.readiness) {
    return (
      <section className="mt-10 rounded border border-dashed border-mist-line p-6 dark:border-ink-line">
        <p className="font-display text-lg">Turn your roadmaps into a career plan</p>
        <p className="mt-1 text-sm text-charcoal/60 dark:text-mist/55">
          Pick the technologies you know, see which roles they open up, and choose a target. Embarko will track your skill gap, projects and readiness.
        </p>
        <Link href="/career" className="mt-4 inline-block rounded bg-charcoal px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal dark:bg-amber dark:text-ink dark:hover:bg-amber-bright">
          Explore career paths
        </Link>
      </section>
    );
  }

  const current = [...state.projectProgress.entries()]
    .map(([projectId, p]) => ({ project: state.projects.find((x) => x.id === projectId)!, p }))
    .find((x) => x.project && x.p.status === "in_progress");
  const weakTopics = [...new Set(recs.filter((r) => r.kind === "revise").map((r) => r.topic))];
  const last = attempts[0];
  const demonstrated = state.gap.demonstrated.length;

  return (
    <section className="mt-10 space-y-8" aria-label="Career progress">
      <div className="rounded border border-teal p-6 dark:border-teal-bright">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-teal dark:text-teal-bright">Target role</p>
            <p className="mt-1 font-display text-xl">{state.targetRole.name}</p>
          </div>
          <Link href="/career" className="text-sm underline hover:text-teal dark:hover:text-teal-bright">Career details →</Link>
        </div>
        <div className="mt-6"><ReadinessPanel roleName={state.targetRole.name} readiness={state.readiness} compact /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-mist-line p-5 dark:border-ink-line">
          <p className={cardLabel}>Skill gap</p>
          <p className="mt-2 text-sm">
            <span className="font-mono text-lg tabular-nums">{demonstrated}</span> of {state.targetRole.skills.length} skills demonstrated
          </p>
          <div className="mt-2"><ProgressBar percent={state.gap.coveragePercent} /></div>
          {state.gap.gaps[0] && <p className="mt-3 text-xs text-charcoal/55 dark:text-mist/50">Biggest gap: {state.gap.gaps.slice(0, 3).map((g) => g.skill.name).join(", ")}</p>}
        </div>

        <div className="rounded border border-mist-line p-5 dark:border-ink-line">
          <p className={cardLabel}>Current project</p>
          {current ? (
            <>
              <Link href={`/projects/${current.project.slug}`} className="mt-2 block text-sm font-medium hover:text-teal dark:hover:text-teal-bright">{current.project.name}</Link>
              <div className="mt-2"><ProgressBar percent={current.p.percent} /></div>
            </>
          ) : (
            <p className="mt-2 text-sm text-charcoal/60 dark:text-mist/55">
              None started. <Link href="/career" className="underline">Pick a project</Link>
            </p>
          )}
        </div>

        <div className="rounded border border-mist-line p-5 dark:border-ink-line">
          <p className={cardLabel}>Latest assessment</p>
          {last ? (
            <Link href={`/assessment/${last.assessmentId}`} className="mt-2 block hover:text-teal dark:hover:text-teal-bright">
              <span className="font-mono text-lg tabular-nums">{Math.round(last.overall * 100)}%</span>
              <span className="ml-2 text-sm">{last.title}</span>
            </Link>
          ) : (
            <p className="mt-2 text-sm text-charcoal/60 dark:text-mist/55">None yet — take a phase assessment from a roadmap.</p>
          )}
        </div>

        <div className="rounded border border-mist-line p-5 dark:border-ink-line">
          <p className={cardLabel}>Weak skills to revise</p>
          {weakTopics.length > 0 ? (
            <>
              <p className="mt-2 text-sm">{weakTopics.join(", ")}</p>
              {roadmap && <Link href={`/roadmap/${roadmap.id}`} className="mt-2 inline-block text-xs underline">Open revision plan</Link>}
            </>
          ) : (
            <p className="mt-2 text-sm text-charcoal/60 dark:text-mist/55">Nothing flagged right now.</p>
          )}
        </div>
      </div>
    </section>
  );
}
