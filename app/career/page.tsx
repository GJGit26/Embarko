import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";
import { CareerExplorer } from "@/components/career/career-explorer";
import { SkillGapPanel } from "@/components/career/skill-gap-panel";
import { ProjectCard } from "@/components/career/project-card";
import { ReadinessPanel } from "@/components/career/readiness-panel";
import { SkillEvidenceList } from "@/components/career/skill-evidence-list";
import { buildEvidenceViews } from "@/lib/evidence-view";
import { loadCareerState, loadSkills } from "@/lib/career-data";
import { buildRoleSuggestions } from "@/lib/role-suggestions";

export const dynamic = "force-dynamic";

export default async function CareerPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let content: React.ReactNode;
  try {
    if (!user) throw new Error("Not signed in");
    const [state, skills] = await Promise.all([loadCareerState(supabase, user.id), loadSkills(supabase)]);

    if (state.roles.length === 0 || skills.length === 0) {
      content = (
        <Notice title="The career catalog isn't set up yet.">
          Apply <code className="font-mono">supabase/adaptive.sql</code> and run{" "}
          <code className="font-mono">npm run seed:career</code>, then reload this page.
        </Notice>
      );
    } else {
      const [{ data: survey }, { data: roadmap }] = await Promise.all([
        supabase
          .from("survey_responses")
          .select("interest_domain")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        state.targetRole
          ? supabase
              .from("roadmaps")
              .select("id, title")
              .eq("role_id", state.targetRole.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const initialRoles = state.profile.declaredSlugs.length
        ? buildRoleSuggestions({
            roles: state.roles,
            projects: state.projects,
            skills,
            selectedSlugs: state.profile.declaredSlugs,
            experience: state.profile.experience,
            preferredDomain: survey?.interest_domain ?? null,
          })
        : [];

      content = (
        <>
          {state.targetRole && state.gap && (
            <section className="mb-16 space-y-12">
              <div className="rounded border border-teal p-6 dark:border-teal-bright">
                <p className="font-mono text-xs uppercase tracking-widest text-teal dark:text-teal-bright">
                  Target role
                </p>
                <h2 className="mt-2 font-display text-2xl tracking-tight">{state.targetRole.name}</h2>
                <p className="mt-2 max-w-xl text-sm text-charcoal/60 dark:text-mist/55">
                  {state.targetRole.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {roadmap ? (
                    <Link
                      href={`/roadmap/${roadmap.id}`}
                      className="rounded bg-charcoal px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
                    >
                      Open your roadmap →
                    </Link>
                  ) : (
                    <Link
                      href={`/survey?role=${state.targetRole.slug}`}
                      className="rounded bg-charcoal px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
                    >
                      Generate my roadmap
                    </Link>
                  )}
                </div>
              </div>

              {state.readiness && <ReadinessPanel roleName={state.targetRole.name} readiness={state.readiness} />}

              <SkillGapPanel roleName={state.targetRole.name} gap={state.gap} />

              <div>
                <h3 className="font-display text-lg">Skill evidence</h3>
                <p className="mb-4 mt-1 text-sm text-charcoal/55 dark:text-mist/50">
                  What backs up each skill. Only items marked ✓ were verified by Embarko; the rest are self-reported.
                </p>
                <SkillEvidenceList skills={buildEvidenceViews(state.targetRole, state.states)} />
              </div>

              <div>
                <h3 className="font-display text-lg">Recommended projects</h3>
                <p className="mt-1 text-sm text-charcoal/55 dark:text-mist/50">
                  Ordered by how much of your skill gap each one closes. Finishing a milestone adds
                  evidence for the skills it exercises.
                </p>
                {state.recommendedProjects.length === 0 ? (
                  <p className="mt-4 text-sm text-charcoal/55 dark:text-mist/50">
                    No projects are linked to this role yet.
                  </p>
                ) : (
                  <div className="mt-5 grid gap-4">
                    {state.recommendedProjects.map((rec) => {
                      const prog = state.projectProgress.get(rec.project.id);
                      return (
                        <ProjectCard
                          key={rec.project.id}
                          rec={rec}
                          percent={prog ? prog.percent : null}
                          status={prog ? prog.status : null}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {state.targetRole && (
            <h2 className="mb-8 border-t border-mist-line pt-10 font-display text-xl tracking-tight dark:border-ink-line">
              Change your path
            </h2>
          )}
          <CareerExplorer
            skills={skills}
            initialSelected={state.profile.declaredSlugs}
            initialExperience={state.profile.experience}
            initialRoles={initialRoles}
            targetSlug={state.targetRole?.slug ?? null}
          />
        </>
      );
    }
  } catch (err: any) {
    content = (
      <Notice title="We couldn't load your career data.">
        {err?.message ?? "Please try again in a moment."}
      </Notice>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar isAuthed />
      <div className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <p className="font-mono text-xs uppercase tracking-widest text-teal dark:text-teal-bright">Career</p>
        <h1 className="mb-10 mt-2 font-display text-3xl tracking-tight">Where are you headed?</h1>
        {content}
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-mist-line p-8 dark:border-ink-line">
      <p className="font-display text-lg">{title}</p>
      <p className="mt-2 text-sm text-charcoal/60 dark:text-mist/55">{children}</p>
    </div>
  );
}
