import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeConceptAnswers } from "@/lib/assessment-grade";
import { recordEvidence, removeEvidence } from "@/lib/evidence";
import {
  ASSESSMENT_PASS_SCORE,
  objectiveSkillScores,
  scoreAssessment,
  ScoredQuestion,
} from "@/lib/skills-engine";
import { QuestionType } from "@/lib/career-types";

export const maxDuration = 60;

const LETTERS = ["A", "B", "C", "D"];

// POST { answers: { [questionId]: number | string }, coding: { [questionId]: { passed, total, code } } }
//
// Grading:
//   mcq / debug  -> compared with the stored key here on the server (objective)
//   concept      -> Gemini marks each stored key point hit/miss; credit = hits / points
//   coding       -> test results reported by the student's browser (self-reported)
// The overall score is arithmetic over those (scoreAssessment), not an LLM number.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.answers !== "object" || body.answers === null || Array.isArray(body.answers)) {
    return NextResponse.json({ error: "answers (object) is required" }, { status: 400 });
  }
  const answers = body.answers as Record<string, unknown>;
  const codingReports = (typeof body.coding === "object" && body.coding && !Array.isArray(body.coding) ? body.coding : {}) as Record<string, any>;

  // Ownership via RLS: only the owner can read their assessment/questions.
  const { data: assessment } = await supabase.from("assessments").select("id, roadmap_id, title").eq("id", params.id).maybeSingle();
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  const { data: existing } = await supabase.from("assessment_attempts").select("id").eq("assessment_id", assessment.id).maybeSingle();
  if (existing) return NextResponse.json({ error: "This assessment was already submitted.", attemptId: existing.id }, { status: 409 });

  const { data: questions, error: qErr } = await supabase
    .from("assessment_questions")
    .select("id, position, type, topic, skill_id, prompt, payload")
    .eq("assessment_id", assessment.id)
    .order("position");
  if (qErr || !questions || questions.length === 0) {
    return NextResponse.json({ error: qErr?.message ?? "Assessment has no questions" }, { status: 500 });
  }

  try {
    // Answer keys are service-role only; ownership was verified above.
    const db = createAdminClient();
    const { data: keyRows, error: kErr } = await db
      .from("assessment_answer_keys")
      .select("question_id, answer_key")
      .eq("assessment_id", assessment.id);
    if (kErr) throw new Error(kErr.message);
    const keys = new Map((keyRows ?? []).map((k: { question_id: string; answer_key: any }) => [k.question_id, k.answer_key]));

    const scored: ScoredQuestion[] = [];
    const concept: { id: string; prompt: string; keyPoints: string[]; answer: string }[] = [];
    const ungraded: string[] = [];

    for (const q of questions as { id: string; type: QuestionType; topic: string; prompt: string }[]) {
      const key = keys.get(q.id);
      if (!key) {
        ungraded.push(q.id);
        continue;
      }
      if (q.type === "mcq" || q.type === "debug") {
        const picked = answers[q.id];
        const ok = typeof picked === "number" && picked === key.correct_index;
        const feedback =
          `Correct answer: ${LETTERS[key.correct_index] ?? "?"}.` + (key.explanation ? ` ${key.explanation}` : "");
        scored.push({ id: q.id, type: q.type, topic: q.topic, credit: ok ? 1 : 0, feedback });
      } else if (q.type === "concept") {
        const a = typeof answers[q.id] === "string" ? (answers[q.id] as string) : "";
        concept.push({ id: q.id, prompt: q.prompt, keyPoints: key.key_points ?? [], answer: a });
      } else if (q.type === "coding") {
        const r = codingReports[q.id];
        const total = Number.isInteger(r?.total) && r.total > 0 && r.total <= 20 ? r.total : 0;
        const passed = Number.isInteger(r?.passed) ? Math.max(0, Math.min(total, r.passed)) : 0;
        scored.push({
          id: q.id,
          type: "coding",
          topic: q.topic,
          credit: total ? passed / total : 0,
          feedback: total ? `${passed} of ${total} tests passed in your browser.` : "No code was run for this question.",
        });
      }
    }

    // Subjective part: AI. Failures leave questions ungraded instead of failing the submission.
    const grades = await gradeConceptAnswers(concept);
    const typeById = new Map((questions as { id: string; topic: string }[]).map((q) => [q.id, q.topic]));
    for (const c of concept) {
      const g = grades.get(c.id);
      if (!g) {
        ungraded.push(c.id);
        continue;
      }
      scored.push({ id: c.id, type: "concept", topic: typeById.get(c.id) ?? "General", credit: g.credit, feedback: g.feedback });
    }

    if (scored.length === 0) {
      return NextResponse.json({ error: "Nothing could be graded. Please try submitting again." }, { status: 502 });
    }

    // Keep original question order for stable output.
    const order = new Map((questions as { id: string }[]).map((q, i) => [q.id, i]));
    scored.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const result = scoreAssessment(scored);

    const { data: attempt, error: aErr } = await db
      .from("assessment_attempts")
      .insert({
        assessment_id: assessment.id,
        user_id: user.id,
        answers,
        per_question: result.perQuestion,
        overall: result.overall,
        breakdown: result.breakdown,
        topic_scores: result.topicScores,
        weak_topics: result.weakTopics,
        strong_topics: result.strongTopics,
        passed: result.passed,
      })
      .select("id")
      .single();
    if (aErr || !attempt) {
      // unique(assessment_id) turns a double-submit race into a clean error.
      if (aErr?.code === "23505") return NextResponse.json({ error: "This assessment was already submitted." }, { status: 409 });
      throw new Error(aErr?.message ?? "Could not save your attempt");
    }

    // Evidence. Only server-graded questions can create *verified* evidence.
    const skillByQ = new Map((questions as { id: string; skill_id: string | null }[]).map((q) => [q.id, q.skill_id]));
    const typeOf = new Map((questions as { id: string; type: QuestionType }[]).map((q) => [q.id, q.type]));
    const outcomes = scored
      .filter((s) => skillByQ.get(s.id))
      .map((s) => ({ skillId: skillByQ.get(s.id)!, type: typeOf.get(s.id)!, credit: s.credit }));

    try {
      for (const [skillId, { score, count }] of objectiveSkillScores(outcomes)) {
        if (score >= ASSESSMENT_PASS_SCORE) {
          await recordEvidence(user.id, [
            {
              skill_id: skillId,
              evidence_type: "assessment_passed",
              source_key: "latest", // a newer attempt replaces the older score for this skill
              score,
              verified: true,
              detail: `${assessment.title} (${count} objective questions)`,
            },
          ]);
        } else {
          await removeEvidence(user.id, { evidence_type: "assessment_passed", source_key: "latest", skill_id: skillId });
        }
      }
      for (const s of scored) {
        const skillId = skillByQ.get(s.id);
        if (typeOf.get(s.id) === "coding" && skillId && s.credit === 1) {
          await recordEvidence(user.id, [
            { skill_id: skillId, evidence_type: "coding_solved", source_key: s.id, score: 1, verified: false, detail: "All tests passed in the browser" },
          ]);
        }
      }
    } catch (err) {
      // The attempt is saved; a failed evidence write must not hide the student's result.
      console.error("[submit] evidence write failed:", err);
    }

    return NextResponse.json({ attemptId: attempt.id, passed: result.passed, ungraded });
  } catch (err: any) {
    console.error("[submit] failed:", err);
    return NextResponse.json({ error: err.message ?? "Could not submit the assessment" }, { status: 500 });
  }
}
