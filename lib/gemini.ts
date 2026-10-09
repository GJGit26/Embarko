import { GeneratedRoadmap, RetrievedChunk, SurveyInput } from "@/lib/types";
import { AiError, geminiJson } from "@/lib/ai-json";

// Server-only. Never import from a Client Component.

/** Optional context that makes the roadmap target a specific career role. */
export interface RoleContext {
  roleName: string;
  /** Skills still to build, most important / least developed first. */
  gap: { slug: string; name: string; importance: number; proficiency: number }[];
  /** Skills the student has already demonstrated — not worth re-teaching. */
  demonstrated: string[];
}

function formatFragments(fragments: RetrievedChunk[]): string {
  if (fragments.length === 0) return "(no curated fragments retrieved)";
  return fragments
    .map(
      (f, i) =>
        `[F${i + 1}] "${f.title}" (level: ${f.skill_level ?? "any"})\n${f.body}`
    )
    .join("\n\n");
}

function formatCandidates(resources: RetrievedChunk[]): string {
  if (resources.length === 0) return "(no candidate resources retrieved)";
  return resources
    .map((r) => {
      const price = r.is_free ? "FREE" : `PAID — $${r.price_usd ?? "?"}`;
      return `- id: ${r.id} | "${r.title}" | ${r.provider ?? "Unknown provider"} | ${price} | level: ${
        r.skill_level ?? "any"
      } | format: ${r.format ?? "n/a"} | ${r.content_type}`;
    })
    .join("\n");
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    phases: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          estimated_weeks: { type: "integer" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                skill_slugs: { type: "array", items: { type: "string" } },
              },
              required: ["title", "description"],
            },
          },
          resource_ids: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["title", "description", "estimated_weeks", "steps", "resource_ids"],
      },
    },
  },
  required: ["title", "summary", "phases"],
};

interface RawPhase {
  title: string;
  description: string;
  estimated_weeks: number;
  steps: { title: string; description: string; skill_slugs?: string[] }[];
  resource_ids: string[];
}

interface RawRoadmap {
  title: string;
  summary: string;
  phases: RawPhase[];
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Throws AiError("invalid_shape") rather than letting a malformed response crash later code. */
function validateRawRoadmap(raw: unknown): RawRoadmap {
  const r = raw as Partial<RawRoadmap> | null;
  if (!r || !isStr(r.title) || !isStr(r.summary) || !Array.isArray(r.phases) || r.phases.length === 0) {
    throw new AiError("invalid_shape", "Roadmap is missing title, summary or phases");
  }
  const phases: RawPhase[] = [];
  for (const p of r.phases as Partial<RawPhase>[]) {
    if (!p || !isStr(p.title) || !isStr(p.description) || !Array.isArray(p.steps)) continue;
    const steps = p.steps
      .filter((st) => st && isStr(st.title))
      .map((st) => ({
        title: st.title.trim(),
        description: typeof st.description === "string" ? st.description.trim() : "",
        skill_slugs: Array.isArray(st.skill_slugs) ? st.skill_slugs.filter(isStr) : [],
      }));
    if (steps.length === 0) continue;
    phases.push({
      title: p.title.trim(),
      description: p.description.trim(),
      estimated_weeks: Number.isFinite(p.estimated_weeks) ? Math.max(1, Math.round(p.estimated_weeks as number)) : 2,
      steps,
      resource_ids: Array.isArray(p.resource_ids) ? p.resource_ids.filter(isStr) : [],
    });
  }
  if (phases.length === 0) throw new AiError("invalid_shape", "Roadmap had no usable phases");
  return { title: r.title.trim(), summary: r.summary.trim(), phases };
}

export async function generateRoadmap(
  survey: SurveyInput,
  roadmapFragments: RetrievedChunk[],
  candidateResources: RetrievedChunk[],
  roleContext?: RoleContext
): Promise<GeneratedRoadmap> {
  const systemInstruction = `You are an expert technical mentor who designs learning roadmaps for college
students, grounded ONLY in the curated context provided. Never invent
courses, prices, or providers — only reference resources by the exact "id"
values given in the candidate list. Decide the number of phases yourself
based on the student's weekly time and goal (do not default to always
using exactly 3) — a tight timeline or a narrow goal like a hackathon may
need only 2 phases, while a "Placement" or "Higher Studies" goal spanning
a full domain may need 4-6. Every phase must include 2-6 concrete steps
and 2-5 resource_ids drawn from the candidate list, mixing free and paid
options where both are available and appropriate for that phase's level.`;

  const roleBlock = roleContext
    ? `\n\nTARGET ROLE: ${roleContext.roleName}
SKILLS STILL TO BUILD (slug | name | importance 1-3 | current proficiency %):
${roleContext.gap
  .map((g) => `- ${g.slug} | ${g.name} | ${g.importance} | ${g.proficiency}%`)
  .join("\n")}
ALREADY DEMONSTRATED (do not spend steps re-teaching these): ${
        roleContext.demonstrated.join(", ") || "none"
      }

ROLE RULES: Build the roadmap toward this role. Put higher-importance, less-developed skills in earlier phases. For each step, set "skill_slugs" to the 0-2 slugs from the SKILLS STILL TO BUILD list that the step develops (use [] if it is not about one of them). Never use a slug that is not in that list.`
    : "";

  const userPrompt = `STUDENT SURVEY
- Year/Semester: ${survey.yearSemester}
- Known skills: ${survey.knownSkills.join(", ") || "none yet"}
- Interest domain: ${survey.interestDomain}
- Weekly hours available: ${survey.weeklyHours}
- Goal: ${survey.goal}
- Preferred learning style: ${survey.learningStyle}

CURATED ROADMAP GUIDANCE (retrieved from knowledge base)
${formatFragments(roadmapFragments)}

CANDIDATE RESOURCES (retrieved from knowledge base — reference ONLY these ids)
${formatCandidates(candidateResources)}${roleBlock}

Design a phased roadmap for this student. Respond only with the JSON described by the schema.`;

  const raw = validateRawRoadmap(
    await geminiJson({
      system: systemInstruction,
      prompt: userPrompt,
      schema: RESPONSE_SCHEMA,
      temperature: 0.6,
    })
  );

  const byId = new Map(candidateResources.map((r) => [r.id, r]));
  const allowedSlugs = new Set(roleContext?.gap.map((g) => g.slug) ?? []);

  return {
    title: raw.title,
    summary: raw.summary,
    phases: raw.phases.map((phase) => ({
      title: phase.title,
      description: phase.description,
      estimated_weeks: phase.estimated_weeks,
      // Slugs the model made up (not in the allowed gap list) are dropped, not trusted.
      steps: phase.steps.map((st) => ({
        title: st.title,
        description: st.description,
        skill_slugs: (st.skill_slugs ?? []).filter((slug) => allowedSlugs.has(slug)).slice(0, 2),
      })),
      resources: phase.resource_ids
        .map((id) => byId.get(id))
        .filter((r): r is RetrievedChunk => Boolean(r))
        .map((r) => ({
          title: r.title,
          url: r.url ?? undefined,
          provider: r.provider ?? undefined,
          is_free: r.is_free,
          price_usd: r.price_usd ?? undefined,
          format: r.format ?? undefined,
        })),
    })),
  };
}
