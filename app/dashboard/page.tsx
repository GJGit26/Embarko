import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";
import { RoadmapList } from "@/components/roadmap-list";
import { DashboardSnapshot } from "@/components/career/dashboard-snapshot";

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

  const roadmapsForList = (roadmaps ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    domain: r.domain,
    percentComplete: progressByRoadmap.get(r.id)?.percent_complete ?? 0,
  }));

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
          <div className="flex flex-wrap gap-3">
            <Link
              href="/career"
              className="rounded border border-teal px-5 py-2.5 text-sm font-medium text-teal transition-colors hover:bg-teal hover:text-mist dark:border-teal-bright dark:text-teal-bright dark:hover:bg-teal-bright dark:hover:text-ink"
            >
              Career path
            </Link>
            <Link
              href="/survey"
              className="rounded bg-charcoal px-5 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
            >
              New roadmap
            </Link>
          </div>
        </div>

        {user && <DashboardSnapshot userId={user.id} />}

        <h2 className="mb-2 mt-14 font-display text-xl tracking-tight">Your roadmaps</h2>
        <RoadmapList initialRoadmaps={roadmapsForList} />
      </div>
    </div>
  );
}