import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSurveyQuery, retrieveRoadmapContext } from "@/lib/rag";
import { generateRoadmap } from "@/lib/gemini";
import { SurveyInput } from "@/lib/types";

// Embedding + generation can take a while — give this route headroom on
// Vercel's serverless runtime (requires at least a Pro plan for >10s, but
// declaring it here is what tells Vercel to allow more).
export const maxDuration = 60;

function validate(body: any): SurveyInput | null {
  if (
    typeof body?.yearSemester !== "string" ||
    !Array.isArray(body?.knownSkills) ||
    typeof body?.interestDomain !== "string" ||
    typeof body?.weeklyHours !== "number" ||
    typeof body?.goal !== "string" ||
    typeof body?.learningStyle !== "string"
  ) {
    return null;
  }
  return {
    yearSemester: body.yearSemester,
    knownSkills: body.knownSkills.filter((s: unknown) => typeof s === "string"),
    interestDomain: body.interestDomain,
    weeklyHours: body.weeklyHours,
    goal: body.goal,
    learningStyle: body.learningStyle,
  };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const survey = validate(body);
  if (!survey) {
    return NextResponse.json({ error: "Invalid survey payload" }, { status: 400 });
  }

  // 1. Persist the raw survey response.
  const rawQuery = buildSurveyQuery(survey);
  const { data: surveyRow, error: surveyError } = await supabase
    .from("survey_responses")
    .insert({
      user_id: user.id,
      year_semester: survey.yearSemester,
      known_skills: survey.knownSkills,
      interest_domain: survey.interestDomain,
      weekly_hours: survey.weeklyHours,
      goal: survey.goal,
      learning_style: survey.learningStyle,
      raw_query: rawQuery,
    })
    .select("id")
    .single();

  if (surveyError || !surveyRow) {
    return NextResponse.json(
      { error: `Failed to save survey: ${surveyError?.message}` },
      { status: 500 }
    );
  }

  try {
    // 2. RAG retrieval against the shared knowledge base.
    const { roadmapFragments, candidateResources } = await retrieveRoadmapContext(
      supabase,
      survey
    );

    // 3. Generation, grounded in the retrieved chunks.
    const generated = await generateRoadmap(survey, roadmapFragments, candidateResources);

    // 4. Persist roadmap -> phases -> steps -> phase_resources.
    const { data: roadmapRow, error: roadmapError } = await supabase
      .from("roadmaps")
      .insert({
        user_id: user.id,
        survey_response_id: surveyRow.id,
        title: generated.title,
        summary: generated.summary,
        domain: survey.interestDomain,
      })
      .select("id")
      .single();

    if (roadmapError || !roadmapRow) {
      throw new Error(roadmapError?.message ?? "Failed to save roadmap");
    }

    for (let i = 0; i < generated.phases.length; i++) {
      const phase = generated.phases[i];
      const { data: phaseRow, error: phaseError } = await supabase
        .from("roadmap_phases")
        .insert({
          roadmap_id: roadmapRow.id,
          user_id: user.id,
          position: i + 1,
          title: phase.title,
          description: phase.description,
          estimated_weeks: phase.estimated_weeks,
        })
        .select("id")
        .single();

      if (phaseError || !phaseRow) {
        throw new Error(phaseError?.message ?? "Failed to save phase");
      }

      if (phase.steps.length > 0) {
        const { error: stepsError } = await supabase.from("roadmap_steps").insert(
          phase.steps.map((step, j) => ({
            phase_id: phaseRow.id,
            user_id: user.id,
            position: j + 1,
            title: step.title,
            description: step.description,
          }))
        );
        if (stepsError) throw new Error(stepsError.message);
      }

      if (phase.resources.length > 0) {
        const { error: resourcesError } = await supabase.from("phase_resources").insert(
          phase.resources.map((r) => ({
            phase_id: phaseRow.id,
            user_id: user.id,
            title: r.title,
            url: r.url ?? null,
            provider: r.provider ?? null,
            is_free: r.is_free,
            price_usd: r.price_usd ?? null,
            format: r.format ?? null,
            content_type: "course",
          }))
        );
        if (resourcesError) throw new Error(resourcesError.message);
      }
    }

    return NextResponse.json({ roadmapId: roadmapRow.id });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Roadmap generation failed: ${err.message}` },
      { status: 500 }
    );
  }
}
