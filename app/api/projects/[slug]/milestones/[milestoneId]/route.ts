import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProjects } from "@/lib/career-data";
import { recordEvidence, removeEvidence } from "@/lib/evidence";
import { projectSkills } from "@/lib/skills-engine";
import { parseGithubRepoUrl } from "@/lib/github-url";

// PATCH { isComplete: boolean, submissionUrl?: string }
//
// Completing a milestone creates evidence for the skills that milestone is
// mapped to — it does NOT mark them mastered. Self-reported evidence is worth
// little (lib/skills-engine.ts#EVIDENCE_POINTS); a valid GitHub repo link adds
// a bit more; only a server-graded assessment can make a skill "demonstrated".
export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string; milestoneId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (typeof body?.isComplete !== "boolean") {
    return NextResponse.json({ error: "isComplete (boolean) is required" }, { status: 400 });
  }

  let submissionUrl: string | null = null;
  if (body.submissionUrl !== undefined && body.submissionUrl !== null && body.submissionUrl !== "") {
    submissionUrl = parseGithubRepoUrl(body.submissionUrl);
    if (!submissionUrl) {
      return NextResponse.json(
        { error: "Submission must be a GitHub repository link like https://github.com/you/repo" },
        { status: 400 }
      );
    }
  }

  try {
    const projects = await loadProjects(supabase);
    const project = projects.find((p) => p.slug === params.slug);
    const milestone = project?.milestones.find((m) => m.id === params.milestoneId);
    if (!project || !milestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    // The student must have started the project (starts it implicitly if not).
    const { error: startError } = await supabase
      .from("user_projects")
      .upsert(
        { user_id: user.id, project_id: project.id },
        { onConflict: "user_id,project_id", ignoreDuplicates: true }
      );
    if (startError) throw new Error(startError.message);

    if (body.isComplete) {
      const { error } = await supabase.from("user_milestone_progress").upsert(
        {
          user_id: user.id,
          milestone_id: milestone.id,
          submission_url: submissionUrl,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,milestone_id" }
      );
      if (error) throw new Error(error.message);

      await recordEvidence(
        user.id,
        milestone.skills.map((s) => ({
          skill_id: s.id,
          evidence_type: "project_milestone" as const,
          source_key: milestone.id,
          verified: false,
          detail: `${project.name}: ${milestone.title}`,
        }))
      );
      if (submissionUrl) {
        await recordEvidence(
          user.id,
          milestone.skills.map((s) => ({
            skill_id: s.id,
            evidence_type: "github_submission" as const,
            source_key: milestone.id,
            verified: false,
            detail: submissionUrl,
          }))
        );
      } else {
        await removeEvidence(user.id, { evidence_type: "github_submission", source_key: milestone.id });
      }
    } else {
      const { error } = await supabase
        .from("user_milestone_progress")
        .delete()
        .eq("user_id", user.id)
        .eq("milestone_id", milestone.id);
      if (error) throw new Error(error.message);
      await removeEvidence(user.id, { evidence_type: "project_milestone", source_key: milestone.id });
      await removeEvidence(user.id, { evidence_type: "github_submission", source_key: milestone.id });
    }

    // Recompute project completion from what is actually stored.
    const { data: done, error: doneError } = await supabase
      .from("user_milestone_progress")
      .select("milestone_id")
      .eq("user_id", user.id)
      .in("milestone_id", project.milestones.map((m) => m.id));
    if (doneError) throw new Error(doneError.message);

    const completedIds = (done ?? []).map((d: { milestone_id: string }) => d.milestone_id);
    const allDone = completedIds.length === project.milestones.length;

    const { error: statusError } = await supabase
      .from("user_projects")
      .update({
        status: allDone ? "completed" : "in_progress",
        completed_at: allDone ? new Date().toISOString() : null,
      })
      .eq("user_id", user.id)
      .eq("project_id", project.id);
    if (statusError) throw new Error(statusError.message);

    if (allDone) {
      await recordEvidence(
        user.id,
        projectSkills(project).map((s) => ({
          skill_id: s.id,
          evidence_type: "project_completed" as const,
          source_key: project.id,
          verified: false,
          detail: project.name,
        }))
      );
    } else {
      await removeEvidence(user.id, { evidence_type: "project_completed", source_key: project.id });
    }

    return NextResponse.json({
      ok: true,
      completedMilestoneIds: completedIds,
      percent: Math.round((100 * completedIds.length) / project.milestones.length),
      status: allDone ? "completed" : "in_progress",
      skills: milestone.skills.map((s) => s.name),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to update milestone" }, { status: 500 });
  }
}
