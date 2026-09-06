import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";
import { ProgressBar } from "@/components/progress-bar";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

 const { data: roadmaps } = await supabase
   .from("roadmaps")
   .select("id, title, summary, domain, created_at")
   .order("created_at", { ascending: false });

 const { data: progressRows } = await supabase
   .from("roadmap_progress")
   .select("roadmap_id, percent_complete, total_steps, completed_steps");

 const progressByRoadmap = new Map(
   (progressRows ?? []).map((p) => [p.roadmap_id, p])
 );

  return (
    <div className="min-h-screen">
      <NavBar isAuthed />

      <div className="mx-auto max-w-4xl px-6 py-14 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-teal dark:text-teal-bright">
              Dashboard
            </p>
            <h1 className="mt-2 font-display text-3xl tracking-tight">
              {user?.user_metadata?.full_name ? `${user.user_metadata.full_name.split(" ")[0]}'s roadmaps` : "Your roadmaps"}
            </h1>
          </div>
          <Link
            href="/survey"
            className="rounded bg-charcoal px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
          >
            New roadmap
          </Link>
        </div>

        {(!roadmaps || roadmaps.length === 0) && (
          <div className="mt-16 rounded border border-dashed border-mist-line p-12 text-center dark:border-ink-line">
            <p className="font-display text-xl">No roadmap yet.</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal/60 dark:text-mist/55">
              Answer six questions and we'll retrieve a phased plan from the
              knowledge base, built around your actual time and goals.
            </p>
            <Link
              href="/survey"
              className="mt-6 inline-block rounded bg-charcoal px-6 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
            >
              Start the survey
            </Link>
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(roadmaps ?? []).map((r) => {
            const p = progressByRoadmap.get(r.id);
            return (
              <Link
                key={r.id}
                href={`/roadmap/${r.id}`}
                className="group rounded border border-mist-line p-5 transition-colors duration-150 hover:border-charcoal/30 dark:border-ink-line dark:hover:border-mist/30"
              >
                <p className="font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
                  {r.domain}
                </p>
                <h2 className="mt-1.5 font-display text-lg leading-snug group-hover:text-teal dark:group-hover:text-teal-bright">
                  {r.title}
                </h2>
                <p className="mt-2 line-clamp-2 text-sm text-charcoal/60 dark:text-mist/55">
                  {r.summary}
                </p>
                <div className="mt-4">
                  <ProgressBar percent={p?.percent_complete ?? 0} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
