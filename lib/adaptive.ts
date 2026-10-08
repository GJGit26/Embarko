// Server-only. Turns weak topics from an assessment into revision guidance.
// Retrieval comes from the existing knowledge base (lib/rag.ts); Gemini only
// writes the steps/tasks and may reference resources solely by ids that
// retrieval returned. If Gemini fails, a deterministic fallback keeps the
// adapt loop working (revise -> reassess) without inventing anything.
import { AiError, geminiJson } from "@/lib/ai-json";
import type { RecResource } from "@/lib/career-types";
import type { RetrievedChunk } from "@/lib/types";

export interface WeakTopicInput {
  topic: string;
  pct: number; // 0..1
  skillName: string | null;
  candidates: RetrievedChunk[];
  fragments: RetrievedChunk[];
}

export interface TopicPlan {
  topic: string;
  title: string;
  description: string;
  steps: { title: string; description: string }[];
  practiceTask: string;
  miniProjectTask: string;
  resources: RecResource[];
  source: "ai" | "fallback";
}

const SCHEMA = {
  type: "object",
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          description: { type: "string" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: { title: { type: "string" }, description: { type: "string" } },
              required: ["title", "description"],
            },
          },
          practice_task: { type: "string" },
          mini_project_task: { type: "string" },
          resource_ids: { type: "array", items: { type: "string" } },
        },
        required: ["topic", "description", "steps", "practice_task", "resource_ids"],
      },
    },
  },
  required: ["topics"],
};

const SYSTEM = `You are a mentor writing a short revision plan for each topic a student scored poorly on.
- steps: 3-5 ordered revision steps, each a concrete action (title <= 8 words, description 1-2 sentences). Order from fundamentals to application.
- practice_task: one small hands-on exercise (1-3 sentences) that targets the weakness.
- mini_project_task: one small build task (1-3 sentences) that applies the topic inside a real project.
- resource_ids: 0-3 ids chosen ONLY from that topic's candidate list. Never invent ids, titles, URLs or prices.
- Use the exact topic string you were given.`;

const toResource = (r: RetrievedChunk): RecResource => ({
  title: r.title,
  url: r.url ?? null,
  provider: r.provider ?? null,
  is_free: r.is_free,
  price_usd: r.price_usd ?? null,
});

export function fallbackPlan(t: WeakTopicInput): TopicPlan {
  return {
    topic: t.topic,
    title: `Revise ${t.topic}`,
    description: `You scored ${Math.round(t.pct * 100)}% on ${t.topic}. Revisit the fundamentals, practise, then retake a focused reassessment.`,
    steps: [
      { title: `Review ${t.topic} fundamentals`, description: `Re-read the core concepts of ${t.topic} and note what each question you missed was testing.` },
      { title: "Work through examples", description: `Rebuild two small examples of ${t.topic} from scratch without copying.` },
      { title: "Reassess", description: "Take the focused reassessment to check the gap has closed." },
    ],
    practiceTask: `Write three small exercises that each use ${t.topic}, and explain in a sentence why each works.`,
    miniProjectTask: "",
    resources: t.candidates.slice(0, 2).map(toResource),
    source: "fallback",
  };
}

export async function planRevision(
  topics: WeakTopicInput[],
  ctx: { roleName: string | null; level: string | null }
): Promise<TopicPlan[]> {
  if (topics.length === 0) return [];

  const prompt = `Target role: ${ctx.roleName ?? "not chosen"}
Student level: ${ctx.level ?? "unspecified"}

${topics
  .map(
    (t) => `TOPIC: ${t.topic}
Skill: ${t.skillName ?? "n/a"}
Score: ${Math.round(t.pct * 100)}%
Guidance from the knowledge base:
${t.fragments.map((f) => `- ${f.title}: ${f.body.slice(0, 400)}`).join("\n") || "- (none)"}
Candidate resources (ids you may use for this topic):
${t.candidates.map((c) => `- id=${c.id} | ${c.title} | ${c.provider ?? "?"} | ${c.is_free ? "free" : "paid"}`).join("\n") || "- (none)"}`
  )
  .join("\n\n")}

Write a revision plan for every topic above.`;

  let raw: unknown;
  try {
    raw = await geminiJson({ system: SYSTEM, prompt, schema: SCHEMA, temperature: 0.4, timeoutMs: 40_000 });
  } catch (err) {
    if (err instanceof AiError) {
      console.error(`[adaptive] ${err.kind}: ${err.message} — using fallback plans`);
      return topics.map(fallbackPlan);
    }
    throw err;
  }

  const list = (raw as { topics?: unknown })?.topics;
  const byTopic = new Map<string, any>();
  if (Array.isArray(list)) for (const item of list) if (typeof item?.topic === "string") byTopic.set(item.topic, item);

  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return topics.map((t) => {
    const item = byTopic.get(t.topic);
    const steps = Array.isArray(item?.steps)
      ? item.steps
          .map((st: any) => ({ title: s(st?.title, 100), description: s(st?.description, 300) }))
          .filter((st: { title: string }) => st.title)
          .slice(0, 6)
      : [];
    const description = s(item?.description, 400);
    const practice = s(item?.practice_task, 500);
    if (!item || steps.length < 2 || !description || !practice) return fallbackPlan(t); // malformed -> safe fallback

    const byId = new Map(t.candidates.map((c) => [c.id, c]));
    const ids: string[] = Array.isArray(item.resource_ids) ? item.resource_ids.filter((x: unknown): x is string => typeof x === "string") : [];
    const resources = [...new Set(ids)]
      .map((id) => byId.get(id))
      .filter((r): r is RetrievedChunk => !!r)
      .slice(0, 3)
      .map(toResource);

    return {
      topic: t.topic,
      title: `Revise ${t.topic}`,
      description,
      steps,
      practiceTask: practice,
      miniProjectTask: s(item.mini_project_task, 500),
      resources,
      source: "ai" as const,
    };
  });
}
