import { GeneratedRoadmap, RetrievedChunk, SurveyInput } from "@/lib/types";

// Server-only. Never import from a Client Component.
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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
  steps: { title: string; description: string }[];
  resource_ids: string[];
}

interface RawRoadmap {
  title: string;
  summary: string;
  phases: RawPhase[];
}

export async function generateRoadmap(
  survey: SurveyInput,
  roadmapFragments: RetrievedChunk[],
  candidateResources: RetrievedChunk[]
): Promise<GeneratedRoadmap> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

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
${formatCandidates(candidateResources)}

Design a phased roadmap for this student. Respond only with the JSON described by the schema.`;

  const res = await fetch(`${GEMINI_URL(model)}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.6,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini generation failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  const raw = JSON.parse(text) as RawRoadmap;
  const byId = new Map(candidateResources.map((r) => [r.id, r]));

  return {
    title: raw.title,
    summary: raw.summary,
    phases: raw.phases.map((phase) => ({
      title: phase.title,
      description: phase.description,
      estimated_weeks: phase.estimated_weeks,
      steps: phase.steps,
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
