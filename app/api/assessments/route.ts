import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPendingRecommendations, loadProfile, loadRoles } from "@/lib/career-data";
import { retrieveTopicContext } from "@/lib/rag";
import { generateAssessment } from "@/lib/assessment-gen";
import { AiError } from "@/lib/ai-json";
import type { RetrievedChunk } from "@/lib/types";

export const maxDuration = 60;

// POST { roadmapId, phaseId?, focusWeak? } -> { assessmentId, reused }
// Reuses an existing un-attempted assessment for the same phase instead of
// spending another AI call. All writes use the service role (these tables are
// owner-read-only under RLS) after the session and ownership are verified.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const uuid = /^[0-9a-f-]{36}$/i;
  if (typeof body?.roadmapId !== "string" || !uuid.test(body.roadmapId)) {
    return NextResponse.json({ error: "roadmapId is required" }, { status: 400 });
  }
  if (body.phaseId !== undefined && body.phaseId !== null && !(typeof body.phaseId === "string" && uuid.test(body.phaseId))) {
    return NextResponse.json({ error: "Invalid phaseId" }, { status: 400 });
  }
  const phaseId: string | null = body.phaseId ?? null;
  const focusWeak = body.focusWeak === true;

  // Ownership: RLS on roadmaps/phases already restricts these reads to the caller.
  const { data: roadmap, error: roadmapError } = await supabase
    .from("roadmaps")
    .select("id, title, domain, role_id")
    .eq("id", body.roadmapId)
    .maybeSingle();
  if (roadmapError) return NextResponse.json({ error: roadmapError.message }, { status: 500 });
  if (!roadmap) return NextResponse.json({ error: "Roadmap not found" }, { status: 404 });

  const phaseQuery = supabase
    .from("roadmap_phases")
    .select("id, title, description, position, roadmap_steps(id, title, skill_id)")
    .eq("roadmap_id", roadmap.id)
    .order("position");
  const { data: phases, error: phaseError } = await phaseQuery;
  if (phaseError) return NextResponse.json({ error: phaseError.message }, { status: 500 });
  const phase = phaseId ? phases?.find((p) => p.id === phaseId) : null;
  if (phaseId && !phase) return NextResponse.json({ error: "Phase not found" }, { status: 404 });

  try {
    const pending = await loadPendingRecommendations(supabase, user.id, roadmap.id);
    const weakTopics = [...new Set(pending.filter((r) => r.kind === "revise").map((r) => r.topic))];
    if (focusWeak && weakTopics.length === 0) {
      return NextResponse.json({ error: "No weak topics to reassess yet. Take a phase assessment first." }, { status: 400 });
    }

    // Reuse an open (never attempted) assessment for this scope.
    if (!focusWeak) {
      let openQuery = supabase
        .from("assessments")
        .select("id, focus_topics")
        .eq("roadmap_id", roadmap.id)
        .eq("user_id", user.id);
      openQuery = phaseId ? openQuery.eq("phase_id", phaseId) : openQuery.is("phase_id", null);
      const { data: open } = await openQuery.order("created_at", { ascending: false }).limit(5);
      const candidates = (open ?? []).filter((a) => (a.focus_topics ?? []).length === 0);
      if (candidates.length > 0) {
        const { data: attempts } = await supabase
          .from("assessment_attempts")
          .select("assessment_id")
          .in("assessment_id", candidates.map((c) => c.id));
        const attempted = new Set((attempts ?? []).map((a: { assessment_id: string }) => a.assessment_id));
        const unattempted = candidates.find((c) => !attempted.has(c.id));
        if (unattempted) return NextResponse.json({ assessmentId: unattempted.id, reused: true });
      }
    }

    // Context for generation.
    const [roles, profile] = await Promise.all([loadRoles(supabase), loadProfile(supabase, user.id)]);
    const role = roles.find((r) => r.id === roadmap.role_id) ?? null;

    const scope = phase ? [phase] : (phases ?? []);
    const stepRows = scope.flatMap((p) => (p.roadmap_steps ?? []) as { id: string; title: string; skill_id: string | null }[]);
    const taggedIds = new Set(stepRows.map((s) => s.skill_id).filter((x): x is string => !!x));
    const roleSkills = role?.skills ?? [];
    // Phase-tagged skills first, then the role's most important ones.
    const skills = [
      ...roleSkills.filter((rs) => taggedIds.has(rs.skill.id)),
      ...[...roleSkills].filter((rs) => !taggedIds.has(rs.skill.id)).sort((a, b) => b.importance - a.importance),
    ]
      .slice(0, 6)
      .map((rs) => ({ slug: rs.skill.slug, name: rs.skill.name }));

    const phaseTitle = phase?.title ?? roadmap.title;
    const phaseDescription = phase?.description ?? `Overall roadmap: ${roadmap.title}`;

    // RAG grounding is best-effort: if Voyage/Supabase retrieval fails, generate without it.
    let fragments: RetrievedChunk[] = [];
    try {
      const topic = focusWeak ? weakTopics.slice(0, 3).join(", ") : phaseTitle;
      fragments = (
        await retrieveTopicContext(supabase, {
          domain: roadmap.domain,
          topic,
          skillName: skills[0]?.name,
          roleName: role?.name,
          level: profile.experience,
        })
      ).fragments;
    } catch (err) {
      console.error("[assessments] retrieval failed, continuing without it:", err);
    }

    const generated = await generateAssessment({
      roleName: role?.name ?? null,
      phaseTitle,
      phaseDescription,
      stepTitles: stepRows.map((s) => s.title).slice(0, 12),
      skills,
      level: profile.experience,
      weakTopics,
      focusWeak,
      fragments,
    });

    // Persist (service role; user_id always from the session).
    const db = createAdminClient();
    const skillIdBySlug = new Map(roleSkills.map((rs) => [rs.skill.slug, rs.skill.id]));
    const { data: assessment, error: aErr } = await db
      .from("assessments")
      .insert({
        user_id: user.id,
        roadmap_id: roadmap.id,
        phase_id: phaseId,
        role_id: role?.id ?? null,
        title: focusWeak ? `Reassessment — ${weakTopics.slice(0, 3).join(", ")}` : generated.title,
        focus_topics: focusWeak ? weakTopics : [],
      })
      .select("id")
      .single();
    if (aErr || !assessment) throw new Error(aErr?.message ?? "Could not save assessment");

    try {
      const { data: qRows, error: qErr } = await db
        .from("assessment_questions")
        .insert(
          generated.questions.map((q, i) => ({
            assessment_id: assessment.id,
            user_id: user.id,
            position: i + 1,
            type: q.type,
            topic: q.topic,
            skill_id: q.skillSlug ? (skillIdBySlug.get(q.skillSlug) ?? null) : null,
            prompt: q.prompt,
            payload: q.payload,
          }))
        )
        .select("id, position");
      if (qErr || !qRows) throw new Error(qErr?.message ?? "Could not save questions");

      const idByPos = new Map(qRows.map((r: { id: string; position: number }) => [r.position, r.id]));
      const { error: kErr } = await db.from("assessment_answer_keys").insert(
        generated.questions.map((q, i) => ({
          question_id: idByPos.get(i + 1)!,
          assessment_id: assessment.id,
          answer_key: q.answerKey,
        }))
      );
      if (kErr) throw new Error(kErr.message);
    } catch (err) {
      // Don't leave a half-written assessment behind (cascades to questions/keys).
      await db.from("assessments").delete().eq("id", assessment.id);
      throw err;
    }

    return NextResponse.json({ assessmentId: assessment.id, reused: false });
  } catch (err: any) {
    if (err instanceof AiError) {
      console.error(`[assessments] AI failure (${err.kind}): ${err.message}`);
      return NextResponse.json({ error: err.userMessage }, { status: err.kind === "rate_limited" ? 429 : 502 });
    }
    console.error("[assessments] failed:", err);
    return NextResponse.json({ error: err.message ?? "Could not create the assessment" }, { status: 500 });
  }
}
