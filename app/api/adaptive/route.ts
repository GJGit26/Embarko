import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProfile, loadRoles } from "@/lib/career-data";
import { retrieveTopicContext, TopicContext } from "@/lib/rag";
import { planRevision, WeakTopicInput } from "@/lib/adaptive";
import { AiError } from "@/lib/ai-json";
import { TopicScore } from "@/lib/career-types";

export const maxDuration = 60;

const REC_COLUMNS = "id, roadmap_id, phase_id, topic, kind, title, description, steps, resources, target_step_ids, status, created_at";

// POST { attemptId } — turns an assessment attempt into adaptive recommendations
// layered ON TOP of the roadmap (the roadmap rows are never modified):
//   weak topics   -> revise (+ practice, + one mini-project) with RAG-backed resources
//   strong topics -> skip/reduce hint on not-yet-done roadmap steps for that skill
// Idempotent: calling again for the same attempt returns what was already made.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (typeof body?.attemptId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.attemptId)) {
    return NextResponse.json({ error: "attemptId is required" }, { status: 400 });
  }

  const { data: attempt } = await supabase
    .from("assessment_attempts")
    .select("id, assessment_id, weak_topics, strong_topics, topic_scores, assessments(roadmap_id, role_id)")
    .eq("id", body.attemptId)
    .maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  const link = (Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments) as { roadmap_id: string | null; role_id: string | null } | null;
  const roadmapId = link?.roadmap_id;
  if (!roadmapId) return NextResponse.json({ recommendations: [], note: "This assessment isn't linked to a roadmap." });

  const { data: already } = await supabase.from("adaptive_recommendations").select(REC_COLUMNS).eq("attempt_id", attempt.id);
  if (already && already.length > 0) return NextResponse.json({ recommendations: already, reused: true });

  try {
    const { data: roadmap } = await supabase.from("roadmaps").select("id, domain").eq("id", roadmapId).maybeSingle();
    if (!roadmap) return NextResponse.json({ recommendations: [] });

    const [{ data: qRows }, roles, profile, { data: phases }] = await Promise.all([
      supabase.from("assessment_questions").select("topic, skill_id").eq("assessment_id", attempt.assessment_id),
      loadRoles(supabase),
      loadProfile(supabase, user.id),
      supabase.from("roadmap_phases").select("id, roadmap_steps(id, skill_id, is_complete)").eq("roadmap_id", roadmapId),
    ]);
    const role = roles.find((r) => r.id === link?.role_id) ?? null;
    const skillNames = new Map((role?.skills ?? []).map((rs) => [rs.skill.id, rs.skill.name]));

    const topicSkill = new Map<string, string>();
    const topicCount = new Map<string, number>();
    for (const q of (qRows ?? []) as { topic: string; skill_id: string | null }[]) {
      topicCount.set(q.topic, (topicCount.get(q.topic) ?? 0) + 1);
      if (q.skill_id && !topicSkill.has(q.topic)) topicSkill.set(q.topic, q.skill_id);
    }

    const scores = attempt.topic_scores as Record<string, TopicScore>;
    const weak = (attempt.weak_topics as string[]).slice(0, 3);
    // "Strong" needs at least two questions on the topic, so one lucky answer can't trigger a skip.
    const strong = (attempt.strong_topics as string[]).filter((t) => (topicCount.get(t) ?? 0) >= 2);

    // RAG per weak topic (best-effort each).
    const inputs: WeakTopicInput[] = await Promise.all(
      weak.map(async (topic) => {
        let ctx: TopicContext | null = null;
        try {
          ctx = await retrieveTopicContext(supabase, {
            domain: roadmap.domain,
            topic,
            skillName: skillNames.get(topicSkill.get(topic) ?? ""),
            roleName: role?.name,
            level: profile.experience,
          });
        } catch (err) {
          console.error(`[adaptive] retrieval failed for "${topic}":`, err);
        }
        return {
          topic,
          pct: scores[topic]?.pct ?? 0,
          skillName: skillNames.get(topicSkill.get(topic) ?? "") ?? null,
          candidates: ctx?.candidateResources ?? [],
          fragments: ctx?.fragments ?? [],
        };
      })
    );
    const plans = await planRevision(inputs, { roleName: role?.name ?? null, level: profile.experience });

    const rows: Record<string, unknown>[] = [];
    const base = { user_id: user.id, roadmap_id: roadmapId, attempt_id: attempt.id };
    plans.forEach((p, i) => {
      const skill_id = topicSkill.get(p.topic) ?? null;
      rows.push({ ...base, skill_id, topic: p.topic, kind: "revise", title: p.title, description: p.description, steps: p.steps, resources: p.resources });
      rows.push({ ...base, skill_id, topic: p.topic, kind: "practice", title: `Practice: ${p.topic}`, description: p.practiceTask });
      if (i === 0 && p.miniProjectTask) {
        rows.push({ ...base, skill_id, topic: p.topic, kind: "mini_project", title: `Mini project: ${p.topic}`, description: p.miniProjectTask });
      }
    });

    // Reduce/skip: unfinished roadmap steps tagged with a skill the student just showed strength in.
    const allSteps = (phases ?? []).flatMap((p) => (p.roadmap_steps ?? []) as { id: string; skill_id: string | null; is_complete: boolean }[]);
    for (const topic of strong) {
      const skill_id = topicSkill.get(topic);
      if (!skill_id) continue;
      const targets = allSteps.filter((s) => s.skill_id === skill_id && !s.is_complete).map((s) => s.id);
      if (targets.length === 0) continue;
      rows.push({
        ...base,
        skill_id,
        topic,
        kind: "skip",
        title: `You can move faster through ${topic}`,
        description: `You scored ${Math.round((scores[topic]?.pct ?? 0) * 100)}% on ${topic}. Skim the matching roadmap steps and spend the time on your weak areas.`,
        target_step_ids: targets,
      });
    }

    const db = createAdminClient();
    // The previous guidance for these topics is replaced by this newer evidence.
    const touched = [...new Set([...weak, ...strong])];
    if (touched.length > 0) {
      await db
        .from("adaptive_recommendations")
        .update({ status: "superseded" })
        .eq("user_id", user.id)
        .eq("roadmap_id", roadmapId)
        .eq("status", "pending")
        .in("topic", touched);
    }

    if (rows.length === 0) return NextResponse.json({ recommendations: [] });
    const { data: inserted, error: insErr } = await db.from("adaptive_recommendations").insert(rows).select(REC_COLUMNS);
    if (insErr) throw new Error(insErr.message);
    return NextResponse.json({ recommendations: inserted, usedFallback: plans.some((p) => p.source === "fallback") });
  } catch (err: any) {
    if (err instanceof AiError) {
      console.error(`[adaptive] AI failure (${err.kind}): ${err.message}`);
      return NextResponse.json({ error: err.userMessage }, { status: 502 });
    }
    console.error("[adaptive] failed:", err);
    return NextResponse.json({ error: err.message ?? "Could not build your revision plan" }, { status: 500 });
  }
}
