import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";
import { MilestoneList } from "@/components/career/milestone-list";
import { loadProjectProgress, loadProjects } from "@/lib/career-data";
import { projectSkills } from "@/lib/skills-engine";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  let projects;
  let progress;
  let urlRows: { milestone_id: string; submission_url: string | null }[] = [];
  try {
    projects = await loadProjects(supabase);
    progress = await loadProjectProgress(supabase, user.id, projects);
    const { data } = await supabase
      .from("user_milestone_progress")
      .select("milestone_id, submission_url")
      .eq("user_id", user.id);
    urlRows = data ?? [];
  } catch (err: any) {
    return (
      <div className="min-h-screen">
        <NavBar isAuthed />
        <div className="mx-auto max-w-3xl px-6 py-14 md:px-10">
          <p className="font-display text-lg">We couldn&apos;t load this project.</p>
          <p className="mt-2 text-sm text-charcoal/60 dark:text-mist/55">{err?.message}</p>
          <Link href="/career" className="mt-6 inline-block text-sm underline">
            Back to Career
          </Link>
        </div>
      </div>
    );
  }

  const project = projects.find((p) => p.slug === params.slug);
  if (!project) notFound();

  const mine = progress.get(project.id);
  const ids = new Set(project.milestones.map((m) => m.id));
  const initialUrls = Object.fromEntries(
    urlRows
      .filter((r) => ids.has(r.milestone_id) && r.submission_url)
      .map((r) => [r.milestone_id, r.submission_url as string])
  );

  return (
    <div className="min-h-screen">
      <NavBar isAuthed />
      <div className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <Link
          href="/career"
          className="font-mono text-xs uppercase tracking-widest text-teal hover:underline dark:text-teal-bright"
        >
          ← Career
        </Link>
        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-charcoal/45 dark:text-mist/40">
          {project.difficulty} · ~{project.estimatedHours} hours
        </p>
        <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl">{project.name}</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-charcoal/70 dark:text-mist/65">
          {project.description}
        </p>

        <dl className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
              Skills developed
            </dt>
            <dd className="mt-2 flex flex-wrap gap-1.5">
              {projectSkills(project).map((s) => (
                <span
                  key={s.id}
                  className="rounded-full border border-mist-line px-2 py-0.5 text-[11px] dark:border-ink-line"
                >
                  {s.name}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
              Prerequisites
            </dt>
            <dd className="mt-2 text-sm text-charcoal/70 dark:text-mist/65">
              {project.prerequisites.join(" · ") || "None"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
              Expected outcome
            </dt>
            <dd className="mt-2 text-sm text-charcoal/70 dark:text-mist/65">{project.expectedOutcome}</dd>
          </div>
        </dl>

        <div className="mt-10">
          <MilestoneList
            projectSlug={project.slug}
            milestones={project.milestones.map((m) => ({
              id: m.id,
              position: m.position,
              title: m.title,
              description: m.description,
              skills: m.skills.map((s) => s.name),
            }))}
            initialCompleted={mine ? [...mine.completedMilestoneIds] : []}
            initialUrls={initialUrls}
            initiallyStarted={Boolean(mine)}
          />
        </div>
      </div>
    </div>
  );
}
