// Pure validation of AI-generated assessments. Nothing from the model reaches
// the database or the browser until it has passed through here. Invalid
// questions are dropped (not repaired); if too few survive the whole
// generation is rejected with AiError("invalid_shape") so the caller can show a
// retry state instead of storing a broken assessment.
import { AiError } from "@/lib/ai-json";
import { CodingPayload, ConceptPayload, DebugPayload, McqPayload, QuestionType } from "@/lib/career-types";

export interface ValidQuestion {
  type: QuestionType;
  topic: string;
  skillSlug: string | null;
  prompt: string;
  payload: McqPayload | ConceptPayload | DebugPayload | CodingPayload;
  /** Stored in assessment_answer_keys; never sent to the browser. */
  answerKey: Record<string, unknown>;
}

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]{0,40}$/;

/** Fisher–Yates; `rng` is injectable so tests are deterministic. */
function shuffleOptions(options: string[], correct: number, rng: () => number) {
  const idx = options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return { options: idx.map((i) => options[i]), correct: idx.indexOf(correct) };
}

/** "A. useState" / "B) useEffect" -> "useState" / "useEffect" (the UI adds its own letters). */
const stripLetter = (o: string) => o.replace(/^\(?[A-Da-d][.):]\s+/, "").trim();

function cleanOptions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const opts = raw.map((o) => str(o, 300)).filter((o): o is string => !!o).map(stripLetter);
  if (opts.length !== 4 || new Set(opts.map((o) => o.toLowerCase())).size !== 4) return null;
  return opts;
}

/** Accepts 2, "2" and "C" (as 0-based 2) — but nothing outside 0..hi. */
function intIn(v: unknown, lo: number, hi: number): number | null {
  let n: number | null = null;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && /^\d+$/.test(v.trim())) n = Number(v.trim());
  else if (typeof v === "string" && /^[A-Da-d]$/.test(v.trim())) n = v.trim().toUpperCase().charCodeAt(0) - 65;
  return n !== null && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}

/** Index of the option whose text equals `answer` (after stripping a leading letter). */
function indexByText(options: string[], answer: unknown): number | null {
  const a = str(answer, 300);
  if (!a) return null;
  const i = options.findIndex((o) => o.toLowerCase() === stripLetter(a).toLowerCase());
  return i >= 0 ? i : null;
}

function parseJson(s: unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof s !== "string") return { ok: false };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

function validateOne(q: any, allowedSlugs: Set<string>, rng: () => number): ValidQuestion | string {
  if (!q || typeof q !== "object") return "not an object";
  const type = q.type as QuestionType;
  const topic = str(q.topic, 80);
  const prompt = str(q.prompt, 1200);
  if (!topic || !prompt) return `${String(q.type)}: missing topic or prompt`;
  const skillSlug = typeof q.skill_slug === "string" && allowedSlugs.has(q.skill_slug) ? q.skill_slug : null;
  const explanation = str(q.explanation, 800) ?? "";

  if (type === "mcq") {
    const opts = cleanOptions(q.options);
    if (!opts) return `mcq: needs exactly 4 distinct options (got ${Array.isArray(q.options) ? q.options.length : "none"})`;
    // Prefer the index; fall back to the correct option's text if the index is missing/odd.
    const correct = intIn(q.correct_index, 0, 3) ?? indexByText(opts, q.correct_answer);
    if (correct === null) return `mcq: no usable correct answer (correct_index=${JSON.stringify(q.correct_index)})`;
    const s = shuffleOptions(opts, correct, rng);
    return {
      type,
      topic,
      skillSlug,
      prompt,
      payload: { options: s.options },
      answerKey: { correct_index: s.correct, explanation },
    };
  }

  if (type === "debug") {
    const code = str(q.code, 2500);
    const opts = cleanOptions(q.options);
    const correct = intIn(q.root_cause_index, 0, 3);
    if (!code) return "debug: missing code";
    if (!opts) return "debug: needs exactly 4 distinct options";
    if (correct === null) return `debug: no usable root_cause_index (${JSON.stringify(q.root_cause_index)})`;
    const s = shuffleOptions(opts, correct, rng);
    return {
      type,
      topic,
      skillSlug,
      prompt,
      payload: { code, language: str(q.language, 20) ?? "javascript", options: s.options },
      answerKey: { correct_index: s.correct, explanation, fix: str(q.fix, 1500) ?? "" },
    };
  }

  if (type === "concept") {
    const points = Array.isArray(q.key_points)
      ? q.key_points.map((p: unknown) => str(p, 300)).filter((p: string | null): p is string => !!p)
      : [];
    if (points.length < 2 || points.length > 5) return `concept: needs 2-5 key_points (got ${points.length})`;
    return {
      type,
      topic,
      skillSlug,
      prompt,
      payload: { hint: str(q.hint, 200) ?? undefined },
      answerKey: { key_points: points, model_answer: str(q.model_answer, 1200) ?? "" },
    };
  }

  if (type === "coding") {
    const fn = typeof q.function_name === "string" && IDENT.test(q.function_name) ? q.function_name : null;
    const problem = str(q.problem, 1500);
    const starter = str(q.starter_code, 1500);
    if (!fn || !problem || !starter || !Array.isArray(q.tests)) return "coding: missing function_name/problem/starter_code/tests";

    const tests: { args: unknown[]; expected: unknown }[] = [];
    for (const t of q.tests.slice(0, 8)) {
      const a = parseJson(t?.args_json);
      const e = parseJson(t?.expected_json);
      if (!a.ok || !e.ok || !Array.isArray(a.value)) continue;
      if (JSON.stringify(a.value).length > 2000 || JSON.stringify(e.value).length > 2000) continue;
      tests.push({ args: a.value, expected: e.value });
    }
    if (tests.length < 3) return `coding: only ${tests.length} valid tests (need 3+)`;
    // The starter must define the named function, otherwise the runner can never find it.
    if (!new RegExp(`(function\\s+${fn.replace(/\$/g, "\\$")}\\b|(const|let|var)\\s+${fn.replace(/\$/g, "\\$")}\\b)`).test(starter)) {
      return "coding: starter_code does not define function_name";
    }
    return {
      type,
      topic,
      skillSlug,
      prompt,
      payload: {
        language: "javascript",
        function_name: fn,
        problem,
        input_description: str(q.input_description, 400) ?? "",
        output_description: str(q.output_description, 400) ?? "",
        examples: tests.slice(0, 2),
        constraints: Array.isArray(q.constraints)
          ? q.constraints.map((c: unknown) => str(c, 200)).filter((c: string | null): c is string => !!c).slice(0, 5)
          : [],
        starter_code: starter,
        tests,
      },
      answerKey: { explanation },
    };
  }

  return `unknown question type "${String(q.type)}"`;
}

export const MIN_QUESTIONS = 5;
export const MIN_MCQ = 3;

export function validateAssessment(
  raw: unknown,
  allowedSlugs: Set<string>,
  rng: () => number = Math.random
): ValidQuestion[] {
  const list = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) throw new AiError("invalid_shape", "Assessment has no questions array");

  const valid: ValidQuestion[] = [];
  const reasons: string[] = [];
  for (const q of list) {
    const r = validateOne(q, allowedSlugs, rng);
    if (typeof r === "string") reasons.push(r);
    else valid.push(r);
  }
  const mcqs = valid.filter((q) => q.type === "mcq").length;
  if (valid.length < MIN_QUESTIONS || mcqs < MIN_MCQ) {
    const why = [...new Set(reasons)].slice(0, 4).join("; ");
    throw new AiError(
      "invalid_shape",
      `Only ${valid.length} usable questions (${mcqs} MCQ) of ${list.length}${why ? `. Rejected: ${why}` : ""}`
    );
  }
  return valid;
}