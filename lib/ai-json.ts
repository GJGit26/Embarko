// Server-only. Never import from a Client Component — GEMINI_API_KEY and
// GROQ_API_KEY must never reach the browser bundle.
//
// Two transports live here: geminiJson (roadmap/revision features) and groqJson
// (the "Take Phase Assessment" flow: generation + short-answer grading).
//
// One place that talks to Gemini for structured output, so every AI feature
// gets the same failure handling: missing key, HTTP errors, timeouts, safety
// blocks, truncated or fenced JSON, and empty responses. Callers still have to
// validate the *shape* of what comes back (lib/validators.ts) — a response
// that parses is not necessarily a response that is usable.

export type AiErrorKind =
  | "config"
  | "http"
  | "rate_limited"
  | "timeout"
  | "empty"
  | "blocked"
  | "invalid_json"
  | "invalid_shape";

export class AiError extends Error {
  constructor(public kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
  }
  /** A message that is safe to show a student (no keys, no raw upstream bodies). */
  get userMessage(): string {
    const base = this.baseUserMessage;
    // On `npm run dev` only, say WHY so it can be fixed; never in production.
    return process.env.NODE_ENV === "development" ? `${base} [${this.kind}: ${this.message}]` : base;
  }

  private get baseUserMessage(): string {
    switch (this.kind) {
      case "config":
        return "The AI service isn't configured on the server.";
      case "rate_limited":
        return "The AI service is busy right now. Please try again in a minute.";
      case "timeout":
        return "The AI service took too long to respond. Please try again.";
      case "blocked":
        return "The AI service declined to produce a response for this request.";
      case "empty":
      case "invalid_json":
      case "invalid_shape":
        return "The AI returned an unusable response. Please try again.";
      default:
        return "The AI service is unavailable right now. Please try again shortly.";
    }
  }
}

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export interface GeminiJsonOptions {
  system: string;
  prompt: string;
  /** Gemini responseSchema (OpenAPI subset). */
  schema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Extra attempts after the first on transient failures / unparseable output. */
  retries?: number;
}

const RETRYABLE: AiErrorKind[] = ["rate_limited", "timeout", "http", "invalid_json", "empty"];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse JSON that may be wrapped in markdown fences or surrounded by prose. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new AiError("invalid_json", "Gemini returned text that is not valid JSON");
}

async function attemptOnce(opts: GeminiJsonOptions): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError("config", "Missing GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);

  let res: Response;
  try {
    res = await fetch(GEMINI_URL(model), {
      method: "POST",
      // The key goes in a header, not the query string, so it can't leak into logs/URLs.
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.4,
          // Only sent when a caller asks for it. The original roadmap call had no
          // cap, and a cap can cut a model's JSON off mid-way (-> invalid_json).
          ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
          responseMimeType: "application/json",
          responseSchema: opts.schema,
        },
      }),
    });
  } catch (err: any) {
    if (err?.name === "AbortError") throw new AiError("timeout", "Gemini request timed out");
    throw new AiError("http", `Gemini request failed: ${err?.message ?? "network error"}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Log the upstream body server-side only; never forward it to the client.
    const body = await res.text().catch(() => "");
    console.error(`[gemini] HTTP ${res.status}: ${body.slice(0, 500)}`);
    throw new AiError(res.status === 429 ? "rate_limited" : "http", `Gemini HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => null);
  if (json?.promptFeedback?.blockReason) {
    throw new AiError("blocked", `Gemini blocked the prompt: ${json.promptFeedback.blockReason}`);
  }
  const candidate = json?.candidates?.[0];
  if (candidate?.finishReason === "SAFETY") throw new AiError("blocked", "Gemini blocked the response");
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    console.error(`[gemini] finishReason=${candidate.finishReason} (model ${model})`);
  }

  const text: string = (candidate?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("");
  if (!text.trim()) {
    console.error(`[gemini] empty response (model ${model}, finishReason=${candidate?.finishReason ?? "none"})`);
    throw new AiError("empty", `Gemini returned no content (finishReason=${candidate?.finishReason ?? "none"})`);
  }

  // MAX_TOKENS usually means truncated JSON; parseJsonLoose will report it as invalid_json.
  try {
    return parseJsonLoose(text);
  } catch (err) {
    console.error(`[gemini] unparseable JSON (model ${model}, finishReason=${candidate?.finishReason ?? "none"}): ${text.slice(0, 200)} … ${text.slice(-120)}`);
    throw err;
  }
}

export async function geminiJson(opts: GeminiJsonOptions): Promise<unknown> {
  const attempts = 1 + (opts.retries ?? 1);
  let last: AiError | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await attemptOnce(opts);
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      last = err;
      if (!RETRYABLE.includes(err.kind) || i === attempts - 1) break;
      await sleep(1500 * (i + 1));
    }
  }
  throw last ?? new AiError("http", "Gemini call failed");
}

// ---------------------------------------------------------------------------
// Groq (OpenAI-compatible chat completions) — used by the phase assessment only.
// ---------------------------------------------------------------------------

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// openai/gpt-oss-120b: 131k context, 65,536 max output tokens (Gemini 2.0 Flash
// is capped at 8,192 output), and supports json_schema structured output.
const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";

export interface GroqJsonOptions {
  system: string;
  prompt: string;
  /** Plain JSON Schema. */
  schema: Record<string, unknown>;
  temperature?: number;
  /** Includes reasoning tokens for gpt-oss models. */
  maxCompletionTokens?: number;
  timeoutMs?: number;
  retries?: number;
}

async function groqAttempt(opts: GroqJsonOptions): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new AiError("config", "Missing GROQ_API_KEY");
  const model = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
  const isGptOss = model.startsWith("openai/gpt-oss");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt },
        ],
        temperature: opts.temperature ?? 0.4,
        max_completion_tokens: opts.maxCompletionTokens ?? 16_000,
        // Low reasoning effort keeps latency and token use down for this task.
        ...(isGptOss ? { reasoning_effort: "low" } : {}),
        // Best-effort (strict:false) because many question fields are optional.
        // Output is still validated by validateAssessment / the grader.
        response_format: { type: "json_schema", json_schema: { name: "result", strict: false, schema: opts.schema } },
      }),
    });
  } catch (err: any) {
    if (err?.name === "AbortError") throw new AiError("timeout", "Groq request timed out");
    throw new AiError("http", `Groq request failed: ${err?.message ?? "network error"}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[groq] HTTP ${res.status}: ${body.slice(0, 500)}`);
    if (res.status === 429) throw new AiError("rate_limited", "Groq HTTP 429");
    // Groq reports schema-violating output as 400 json_validate_failed — retryable.
    if (res.status === 400 && body.includes("json_validate_failed")) throw new AiError("invalid_json", "Groq json_validate_failed");
    throw new AiError("http", `Groq HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => null);
  const choice = json?.choices?.[0];
  if (choice?.finish_reason === "content_filter") throw new AiError("blocked", "Groq blocked the response");
  const text: string = choice?.message?.content ?? "";
  if (!text.trim()) {
    console.error(`[groq] empty response (model ${model}, finish_reason=${choice?.finish_reason ?? "none"})`);
    throw new AiError("empty", `Groq returned no content (finish_reason=${choice?.finish_reason ?? "none"})`);
  }
  if (choice?.finish_reason === "length") console.error(`[groq] finish_reason=length (model ${model}) — output may be truncated`);

  try {
    return parseJsonLoose(text);
  } catch (err) {
    console.error(`[groq] unparseable JSON (model ${model}, finish_reason=${choice?.finish_reason ?? "none"}): ${text.slice(0, 200)} … ${text.slice(-120)}`);
    throw err;
  }
}

export async function groqJson(opts: GroqJsonOptions): Promise<unknown> {
  const attempts = 1 + (opts.retries ?? 1);
  let last: AiError | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await groqAttempt(opts);
    } catch (err) {
      if (!(err instanceof AiError)) throw err;
      last = err;
      if (!RETRYABLE.includes(err.kind) || i === attempts - 1) break;
      await sleep(1500 * (i + 1));
    }
  }
  throw last ?? new AiError("http", "Groq call failed");
}
