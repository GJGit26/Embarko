import { embedQuery } from "@/lib/embeddings";
import { RetrievedChunk, SurveyInput } from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Survey answers are structured, not free text — but pgvector search needs a
 * text query to embed. This builds one deterministic sentence from the
 * survey fields so retrieval is stable and reproducible for the same answers.
 */
export function buildSurveyQuery(survey: SurveyInput): string {
  const skills =
    survey.knownSkills.length > 0
      ? survey.knownSkills.join(", ")
      : "no prior skills in this domain";

  return [
    `A ${survey.yearSemester} engineering student wants to build technical expertise in ${survey.interestDomain}.`,
    `They currently know: ${skills}.`,
    `They can commit about ${survey.weeklyHours} hours per week.`,
    `Their goal is to prepare for: ${survey.goal}.`,
    `They prefer learning via ${survey.learningStyle.toLowerCase()} content.`,
    `Recommend a phased learning path with concrete resources and courses appropriate for a ${
      survey.knownSkills.length > 2 ? "student with some existing background" : "relative beginner"
    }.`,
  ].join(" ");
}

async function matchKnowledgeBase(
  supabase: SupabaseClient,
  embedding: number[],
  domain: string,
  contentType: string | null,
  count: number
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc("match_knowledge_base", {
    query_embedding: embedding,
    match_domain: domain,
    match_content_type: contentType,
    match_count: count,
  });

  if (error) throw new Error(`match_knowledge_base failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}

export interface RetrievalResult {
  query: string;
  roadmapFragments: RetrievedChunk[];
  candidateResources: RetrievedChunk[];
}

/**
 * Retrieves two pools from the same knowledge base via vector search:
 *  - roadmap_fragment chunks: curated guidance on sequencing/topics
 *  - resource + course chunks: candidate free/paid recommendations
 * Both pools are filtered to the student's chosen domain and come from the
 * same embedding, so the whole pipeline is a single RAG retrieval pass.
 */
export async function retrieveRoadmapContext(
  supabase: SupabaseClient,
  survey: SurveyInput
): Promise<RetrievalResult> {
  const query = buildSurveyQuery(survey);
  const embedding = await embedQuery(query);

  const [roadmapFragments, courses, resources] = await Promise.all([
    matchKnowledgeBase(supabase, embedding, survey.interestDomain, "roadmap_fragment", 6),
    matchKnowledgeBase(supabase, embedding, survey.interestDomain, "course", 14),
    matchKnowledgeBase(supabase, embedding, survey.interestDomain, "resource", 8),
  ]);

  return {
    query,
    roadmapFragments,
    candidateResources: [...courses, ...resources],
  };
}
