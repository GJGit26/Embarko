// Server-only. Generates an assessment with Groq, grounded in the roadmap
// phase, the target role, the student's level, their previous weak topics and
// (when retrieval works) curated knowledge-base passages. All output goes
// through validateAssessment before it is stored.
import { AiError, groqJson } from "@/lib/ai-json";
import { ValidQuestion, validateAssessment } from "@/lib/assessment-validate";
import type { RetrievedChunk } from "@/lib/types";

export interface AssessmentContext {
  roleName: string | null;
  phaseTitle: string;
  phaseDescription: string;
  stepTitles: string[];
  /** Skills questions may be tagged with (slug + display name). */
  skills: { slug: string; name: string }[];
  level: string | null;
  weakTopics: string[];
  focusWeak: boolean;
  fragments: RetrievedChunk[];
}

export const QUESTION_MIX = { mcq: 6, concept: 2, coding: 1, debug: 1 } as const;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["mcq", "concept", "coding", "debug"] },
          topic: { type: "string" },
          skill_slug: { type: "string" },
          prompt: { type: "string" },
          explanation: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_index: { type: "integer" },
          key_points: { type: "array", items: { type: "string" } },
          model_answer: { type: "string" },
          hint: { type: "string" },
          code: { type: "string" },
          language: { type: "string" },
          root_cause_index: { type: "integer" },
          fix: { type: "string" },
          function_name: { type: "string" },
          problem: { type: "string" },
          input_description: { type: "string" },
          output_description: { type: "string" },
          constraints: { type: "array", items: { type: "string" } },
          starter_code: { type: "string" },
          tests: {
            type: "array",
            items: {
              type: "object",
              properties: { args_json: { type: "string" }, expected_json: { type: "string" } },
              required: ["args_json", "expected_json"],
            },
          },
        },
        required: ["type", "topic", "prompt"],
      },
    },
  },
  required: ["questions"],
};

const SYSTEM = `You write technical assessments for college students learning software careers.
Rules:
- Every question must test the specific phase, role and skills you are given. No generic trivia.
- "topic" is a short concept label (2-4 words, e.g. "useEffect", "State Management"). Several questions may share a topic; use consistent spelling for the same topic.
- "skill_slug" must be one of the allowed slugs, or omitted if none fits.
- mcq: exactly 4 distinct options, one correct (correct_index 0-3), plausible distractors, short explanation.
- concept: a short-answer question answerable in 2-4 sentences; key_points = 2-5 atomic facts a correct answer must contain; model_answer = a short ideal answer.
- debug: "code" is a short snippet (under 25 lines) containing ONE realistic bug; "prompt" asks what is wrong; options = 4 distinct candidate root causes; root_cause_index = the right one; "fix" shows the corrected code.
- coding: JavaScript only. function_name is a valid identifier; starter_code defines that function with an empty/TODO body; tests = 4-6 cases where args_json is a JSON array of arguments and expected_json is the JSON of the exact return value. Tests must be deterministic and correct. Keep problems small (under 15 lines to solve) and include edge cases.
- Never include the answer in the prompt. Respond only with JSON matching the schema.`;

export async function generateAssessment(ctx: AssessmentContext): Promise<{ title: string; questions: ValidQuestion[] }> {
  const frag = ctx.fragments.length
    ? ctx.fragments.map((f, i) => `[${i + 1}] ${f.title}: ${f.body.slice(0, 600)}`).join("\n")
    : "(none retrieved)";

  const prompt = `ASSESSMENT REQUEST
Target role: ${ctx.roleName ?? "not chosen"}
Roadmap phase: ${ctx.phaseTitle}
Phase description: ${ctx.phaseDescription}
Phase steps: ${ctx.stepTitles.join("; ") || "n/a"}
Student level: ${ctx.level ?? "unspecified"}
Allowed skill slugs: ${ctx.skills.map((s) => `${s.slug} (${s.name})`).join(", ") || "none"}
Previously weak topics: ${ctx.weakTopics.join(", ") || "none"}
${
  ctx.focusWeak
    ? "This is a REASSESSMENT: build at least 70% of the questions on the previously weak topics, using different questions and angles than a first attempt."
    : "Include one or two questions on the previously weak topics if any."
}

CURATED REFERENCE MATERIAL (use to ground difficulty and terminology):
${frag}

Produce exactly ${QUESTION_MIX.mcq} mcq, ${QUESTION_MIX.concept} concept, ${QUESTION_MIX.coding} coding and ${QUESTION_MIX.debug} debug questions, plus a short "title".`;

  // Model output is non-deterministic; if it fails validation, try once more while
  // there is still time inside the route's 60s limit.
  const BUDGET_MS = 55_000;
  const started = Date.now();
  let raw: unknown;
  let questions: ValidQuestion[] | null = null;
  for (let attempt = 0; attempt < 2 && !questions; attempt++) {
    const remaining = BUDGET_MS - (Date.now() - started);
    if (attempt > 0 && remaining < 20_000) break;
    raw = await groqJson({ system: SYSTEM, prompt, schema: SCHEMA, temperature: 0.5, maxCompletionTokens: 16_000, timeoutMs: remaining, retries: 0 });
    try {
      questions = validateAssessment(raw, new Set(ctx.skills.map((s) => s.slug)));
    } catch (err) {
      if (!(err instanceof AiError) || err.kind !== "invalid_shape") throw err;
      console.error(`[assessment] attempt ${attempt + 1} rejected: ${err.message}`);
      if (attempt === 1 || BUDGET_MS - (Date.now() - started) < 20_000) throw err;
    }
  }
  if (!questions) throw new AiError("invalid_shape", "Assessment could not be generated in time");
  const title = typeof (raw as any)?.title === "string" && (raw as any).title.trim() ? (raw as any).title.trim().slice(0, 120) : `${ctx.phaseTitle} — assessment`;
  return { title, questions };
}
