import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";
import { AssessmentRunner } from "@/components/career/assessment-runner";
import { AssessmentResult } from "@/components/career/assessment-result";
import type { AdaptiveRecommendation, ClientQuestion } from "@/lib/career-types";

export const dynamic = "force-dynamic";

export default async function AssessmentPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  // RLS: these only return the signed-in student's own rows.
  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, title, roadmap_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!assessment) notFound();

  const [{ data: questions }, { data: attempt }] = await Promise.all([
    supabase.from("assessment_questions").select("id, position, type, topic, prompt, payload").eq("assessment_id", assessment.id).order("position"),
    supabase.from("assessment_attempts").select("*").eq("assessment_id", assessment.id).maybeSingle(),
  ]);

  let body: React.ReactNode;
  if (!questions || questions.length === 0) {
    body = <p className="text-sm">This assessment has no questions. <Link href="/dashboard" className="underline">Back to dashboard</Link></p>;
  } else if (attempt) {
    const { data: recs } = await supabase
      .from("adaptive_recommendations")
      .select("id, roadmap_id, phase_id, topic, kind, title, description, steps, resources, target_step_ids, status, created_at")
      .eq("attempt_id", attempt.id);
    body = (
      <AssessmentResult
        attemptId={attempt.id}
        title={assessment.title}
        roadmapId={assessment.roadmap_id}
        overall={Number(attempt.overall)}
        breakdown={attempt.breakdown}
        topicScores={attempt.topic_scores}
        weakTopics={attempt.weak_topics}
        strongTopics={attempt.strong_topics}
        passed={attempt.passed}
        perQuestion={attempt.per_question}
        questionPrompts={Object.fromEntries(questions.map((q) => [q.id, q.prompt]))}
        initialRecs={(recs ?? []) as AdaptiveRecommendation[]}
      />
    );
  } else {
    body = <AssessmentRunner assessmentId={assessment.id} title={assessment.title} questions={questions as ClientQuestion[]} />;
  }

  return (
    <div className="min-h-screen">
      <NavBar isAuthed />
      <div className="mx-auto max-w-3xl px-6 py-14 md:px-10">{body}</div>
    </div>
  );
}
