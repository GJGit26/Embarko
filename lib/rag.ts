import { embedQuery } from "@/lib/embeddings";
import { RetrievedChunk, SurveyInput } from "@/lib/types";
import type { RoleContext } from "@/lib/gemini";
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

export async function matchKnowledgeBase(
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
  survey: SurveyInput,
  roleContext?: RoleContext
): Promise<RetrievalResult> {
  // With a target role, the same embedding also carries the role and its most
  // important unmet skills, so retrieval favours material for the actual gap.
  // Without one the query is byte-for-byte what it was before.
  const query = roleContext
    ? `${buildSurveyQuery(survey)} Target role: ${roleContext.roleName}. Skills to build first: ${roleContext.gap
        .slice(0, 6)
        .map((g) => g.name)
        .join(", ")}.`
    : buildSurveyQuery(survey);
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

export interface TopicContext {
  query: string;
  fragments: RetrievedChunk[];
  candidateResources: RetrievedChunk[];
}

/**
 * Retrieval for one topic the student is weak at (or about to be assessed on):
 * the same knowledge base and match_knowledge_base RPC as the roadmap, queried
 * with the topic, its skill and the target role instead of the survey.
 */
export async function retrieveTopicContext(
  supabase: SupabaseClient,
  args: { domain: string; topic: string; skillName?: string | null; roleName?: string | null; level?: string | null }
): Promise<TopicContext> {
  const query = [
    `Learning material for ${args.topic}${args.skillName && args.skillName !== args.topic ? ` (${args.skillName})` : ""}.`,
    args.roleName ? `The student is working toward becoming a ${args.roleName}.` : "",
    args.level ? `Appropriate for a ${args.level.toLowerCase()} learner who is struggling with this topic.` : "",
    "Recommend focused revision, practice exercises and a small project task.",
  ]
    .filter(Boolean)
    .join(" ");

  const embedding = await embedQuery(query);
  const [fragments, courses, resources] = await Promise.all([
    matchKnowledgeBase(supabase, embedding, args.domain, "roadmap_fragment", 3),
    matchKnowledgeBase(supabase, embedding, args.domain, "course", 6),
    matchKnowledgeBase(supabase, embedding, args.domain, "resource", 4),
  ]);
  return { query, fragments, candidateResources: [...courses, ...resources] };
}
