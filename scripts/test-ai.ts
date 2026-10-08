// Run: npm run test:ai — no network, no API keys. `fetch` is mocked so the
// failure paths (bad JSON, HTTP errors, malformed shapes) are exercised for real.
import assert from "node:assert/strict";
import { AiError, geminiJson, groqJson, parseJsonLoose } from "../lib/ai-json";
import { validateAssessment } from "../lib/assessment-validate";
import { gradeConceptAnswers } from "../lib/assessment-grade";
import { planRevision, WeakTopicInput } from "../lib/adaptive";
import { generateRoadmap } from "../lib/gemini";
import { parseGithubRepoUrl } from "../lib/github-url";
import { safeNext } from "../lib/safe-redirect";
import type { RetrievedChunk, SurveyInput } from "../lib/types";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

process.env.GEMINI_API_KEY = "test-key";
process.env.GROQ_API_KEY = "test-key";
const realFetch = globalThis.fetch;
function mockGemini(handler: (n: number) => { status?: number; text?: string; body?: unknown }) {
  let calls = 0;
  globalThis.fetch = (async () => {
    const r = handler(calls++);
    const status = r.status ?? 200;
    const body = r.body ?? { candidates: [{ content: { parts: [{ text: r.text ?? "" }] }, finishReason: "STOP" }] };
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return () => calls;
}
function mockGroq(handler: (n: number) => { status?: number; text?: string; body?: unknown }) {
  let calls = 0;
  globalThis.fetch = (async () => {
    const r = handler(calls++);
    const status = r.status ?? 200;
    const body = r.body ?? { choices: [{ message: { content: r.text ?? "" }, finish_reason: "stop" }] };
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return () => calls;
}
const restore = () => (globalThis.fetch = realFetch);
const silence = <T>(fn: () => Promise<T>) => {
  const e = console.error;
  console.error = () => {};
  return fn().finally(() => (console.error = e));
};

const chunk = (id: string, over: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  id, domain: "Web Development", content_type: "course", title: `Course ${id}`, body: "b", url: `https://x.test/${id}`,
  provider: "Prov", is_free: true, price_usd: null, skill_level: "Beginner", format: "video", tags: [], similarity: 0.9, ...over,
});

const mcq = (over: any = {}) => ({
  type: "mcq", topic: "useEffect", skill_slug: "react", prompt: "Which hook runs side effects?",
  options: ["useState", "useEffect", "useMemo", "useRef"], correct_index: 1, explanation: "useEffect runs after render.", ...over,
});
const coding = (over: any = {}) => ({
  type: "coding", topic: "Arrays", prompt: "Sum", function_name: "sum", problem: "Add numbers", input_description: "array", output_description: "number",
  starter_code: "function sum(nums) {\n  // TODO\n}", constraints: ["n <= 100"],
  tests: [{ args_json: "[[1,2,3]]", expected_json: "6" }, { args_json: "[[]]", expected_json: "0" }, { args_json: "[[5]]", expected_json: "5" }], ...over,
});
const debug = (over: any = {}) => ({
  type: "debug", topic: "useEffect", prompt: "What is wrong?", code: "useEffect(() => { fetchData(); });",
  options: ["No dependency array", "Wrong import", "Missing key", "Bad JSX"], root_cause_index: 0, explanation: "Runs every render.", fix: "add []", ...over,
});
const concept = (over: any = {}) => ({
  type: "concept", topic: "State Management", prompt: "Explain lifting state up.", key_points: ["Move state to the common parent", "Pass it down via props"], model_answer: "…", ...over,
});
const goodSet = () => ({ questions: [mcq(), mcq({ topic: "JSX" }), mcq({ topic: "Props" }), mcq({ topic: "Components" }), concept(), coding(), debug()] });

(async () => {
  // ---- parseJsonLoose ----
  await test("parseJsonLoose: plain, fenced, prose-wrapped; rejects garbage", () => {
    assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
    assert.deepEqual(parseJsonLoose('```json\n{"a":2}\n```'), { a: 2 });
    assert.deepEqual(parseJsonLoose('Sure! Here you go: {"a":3} hope it helps'), { a: 3 });
    assert.throws(() => parseJsonLoose("not json at all"), (e: any) => e instanceof AiError && e.kind === "invalid_json");
    assert.throws(() => parseJsonLoose('{"a": 1, "b": '), (e: any) => e.kind === "invalid_json"); // truncated
  });

  // ---- geminiJson failure handling ----
  await test("geminiJson: missing key -> config error, no network call", async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const calls = mockGemini(() => ({ text: "{}" }));
    await assert.rejects(geminiJson({ system: "s", prompt: "p", schema: {}, retries: 0 }), (e: any) => e.kind === "config");
    assert.equal(calls(), 0);
    process.env.GEMINI_API_KEY = saved;
    restore();
  });

  await test("geminiJson: sends no maxOutputTokens unless asked (a cap can truncate the JSON)", async () => {
    const bodies: any[] = [];
    globalThis.fetch = (async (_u: any, init: any) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] }, finishReason: "STOP" }] }));
    }) as typeof fetch;
    await geminiJson({ system: "s", prompt: "p", schema: {}, retries: 0 });
    await geminiJson({ system: "s", prompt: "p", schema: {}, retries: 0, maxOutputTokens: 500 });
    assert.equal("maxOutputTokens" in bodies[0].generationConfig, false);
    assert.equal(bodies[1].generationConfig.maxOutputTokens, 500);
    restore();
  });

  await test("geminiJson: HTTP 500 -> http; 429 -> rate_limited; error is safe to show", async () => {
    mockGemini(() => ({ status: 500, body: { error: "secret upstream details" } }));
    await silence(() => assert.rejects(geminiJson({ system: "s", prompt: "p", schema: {}, retries: 0 }), (e: any) => {
      assert.equal(e.kind, "http");
      assert.ok(!e.userMessage.includes("secret"));
      return true;
    }));
    mockGemini(() => ({ status: 429, body: {} }));
    await silence(() => assert.rejects(geminiJson({ system: "s", prompt: "p", schema: {}, retries: 0 }), (e: any) => e.kind === "rate_limited"));
    restore();
  });

  await test("geminiJson: empty and safety-blocked responses are typed errors", async () => {
    mockGemini(() => ({ text: "" }));
    await assert.rejects(geminiJson({ system: "s", prompt: "p", schema: {}, retries: 0 }), (e: any) => e.kind === "empty");
    mockGemini(() => ({ body: { promptFeedback: { blockReason: "SAFETY" } } }));
    await assert.rejects(geminiJson({ system: "s", prompt: "p", schema: {}, retries: 0 }), (e: any) => e.kind === "blocked");
    restore();
  });

  await test("geminiJson: retries a malformed first response and succeeds on the second", async () => {
    const calls = mockGemini((n) => (n === 0 ? { text: "garbage" } : { text: '{"ok":true}' }));
    assert.deepEqual(await geminiJson({ system: "s", prompt: "p", schema: {}, retries: 1 }), { ok: true });
    assert.equal(calls(), 2);
    restore();
  });

  // ---- assessment validation ----
  await test("validate: well-formed set passes; MCQ shuffle keeps the correct option correct", () => {
    for (const seed of [0.01, 0.5, 0.99]) {
      const qs = validateAssessment(goodSet(), new Set(["react"]), () => seed);
      assert.equal(qs.length, 7);
      const m = qs.find((q) => q.type === "mcq")!;
      const opts = (m.payload as any).options as string[];
      assert.equal(opts[(m.answerKey as any).correct_index], "useEffect");
      const d = qs.find((q) => q.type === "debug")!;
      assert.equal((d.payload as any).options[(d.answerKey as any).correct_index], "No dependency array");
    }
  });

  await test("validate: answer keys never end up in the client payload", () => {
    const qs = validateAssessment(goodSet(), new Set(["react"]));
    for (const q of qs) {
      const json = JSON.stringify(q.payload);
      assert.ok(!json.includes("correct_index") && !json.includes("key_points") && !json.includes("root_cause"));
    }
  });

  await test("validate: drops malformed questions instead of storing them", () => {
    const raw = {
      questions: [
        ...goodSet().questions,
        mcq({ options: ["a", "a", "b", "c"] }), // duplicate options
        mcq({ correct_index: 7 }), // out of range
        mcq({ options: ["a", "b"] }), // wrong count
        coding({ function_name: "x; alert(1)" }), // injection-shaped identifier
        coding({ starter_code: "function other() {}" }), // starter doesn't define the function
        coding({ tests: [{ args_json: "[1]", expected_json: "1" }] }), // < 3 tests
        coding({ tests: [{ args_json: "{bad", expected_json: "1" }, { args_json: "[1]", expected_json: "}" }, { args_json: "[1]", expected_json: "1" }] }),
        concept({ key_points: ["only one"] }),
        { type: "essay", topic: "x", prompt: "y" },
        null,
        "string",
      ],
    };
    assert.equal(validateAssessment(raw, new Set()).length, 7);
  });

  await test("validate: unknown skill slug is nulled, not trusted", () => {
    const qs = validateAssessment(goodSet(), new Set(["jwt"]));
    assert.ok(qs.every((q) => q.skillSlug === null));
  });

  await test("validate: too few usable questions rejects the whole generation (invalid_shape)", () => {
    assert.throws(() => validateAssessment({ questions: [mcq(), mcq()] }, new Set()), (e: any) => e instanceof AiError && e.kind === "invalid_shape");
    assert.throws(() => validateAssessment({}, new Set()), (e: any) => e.kind === "invalid_shape");
    assert.throws(() => validateAssessment({ questions: [concept(), concept(), concept(), concept(), coding(), debug()] }, new Set()), (e: any) => e.kind === "invalid_shape"); // < 3 MCQ
  });

  // ---- groqJson ----
  await test("groqJson: missing key -> config; 429 -> rate_limited; 500 -> http (safe message)", async () => {
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    const calls = mockGroq(() => ({ text: "{}" }));
    await assert.rejects(groqJson({ system: "s", prompt: "p", schema: {}, retries: 0 }), (e: any) => e.kind === "config");
    assert.equal(calls(), 0);
    process.env.GROQ_API_KEY = saved;
    mockGroq(() => ({ status: 429, body: {} }));
    await silence(() => assert.rejects(groqJson({ system: "s", prompt: "p", schema: {}, retries: 0 }), (e: any) => e.kind === "rate_limited"));
    mockGroq(() => ({ status: 500, body: { error: "secret upstream details" } }));
    await silence(() => assert.rejects(groqJson({ system: "s", prompt: "p", schema: {}, retries: 0 }), (e: any) => e.kind === "http" && !e.userMessage.includes("secret")));
    restore();
  });

  await test("groqJson: sends bearer key, model, json_schema; parses fenced JSON; retries malformed output", async () => {
    let seen: any;
    globalThis.fetch = (async (_u: any, init: any) => {
      seen = { headers: init.headers, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"ok":true}\n```' }, finish_reason: "stop" }] }));
    }) as typeof fetch;
    assert.deepEqual(await groqJson({ system: "s", prompt: "p", schema: { type: "object" }, retries: 0 }), { ok: true });
    assert.equal(seen.headers.Authorization, "Bearer test-key");
    assert.equal(seen.body.model, "openai/gpt-oss-120b");
    assert.equal(seen.body.response_format.type, "json_schema");
    assert.ok(seen.body.max_completion_tokens >= 16000);
    const calls = mockGroq((n) => (n === 0 ? { text: "garbage" } : { text: '{"ok":1}' }));
    assert.deepEqual(await silence(() => groqJson({ system: "s", prompt: "p", schema: {}, retries: 1 })), { ok: 1 });
    assert.equal(calls(), 2);
    mockGroq(() => ({ text: "" }));
    await silence(() => assert.rejects(groqJson({ system: "s", prompt: "p", schema: {}, retries: 0 }), (e: any) => e.kind === "empty"));
    restore();
  });

  // ---- concept grading ----
  await test("grade: credit = key points hit / total; empty answer = 0 without calling AI", async () => {
    const calls = mockGroq(() => ({ text: JSON.stringify({ results: [{ id: "q1", hits: [true, false], feedback: "ok" }] }) }));
    const out = await gradeConceptAnswers([
      { id: "q1", prompt: "p", keyPoints: ["a", "b"], answer: "I know a" },
      { id: "q2", prompt: "p", keyPoints: ["a", "b"], answer: "   " },
    ]);
    assert.equal(out.get("q1")!.credit, 0.5);
    assert.equal(out.get("q2")!.credit, 0);
    assert.equal(calls(), 1);
    restore();
  });

  await test("grade: wrong-length / non-boolean hits and unknown ids are left ungraded", async () => {
    mockGroq(() => ({ text: JSON.stringify({ results: [
      { id: "q1", hits: [true], feedback: "" },
      { id: "q2", hits: ["yes", "no"], feedback: "" },
      { id: "ghost", hits: [true, true], feedback: "" },
    ] }) }));
    const out = await gradeConceptAnswers([
      { id: "q1", prompt: "p", keyPoints: ["a", "b"], answer: "x" },
      { id: "q2", prompt: "p", keyPoints: ["a", "b"], answer: "x" },
    ]);
    assert.equal(out.size, 0);
    restore();
  });

  await test("grade: an AI outage leaves answers ungraded instead of throwing or scoring zero", async () => {
    mockGroq(() => ({ status: 500, body: {} }));
    const out = await silence(() => gradeConceptAnswers([{ id: "q1", prompt: "p", keyPoints: ["a", "b"], answer: "something" }]));
    assert.equal(out.size, 0);
    restore();
  });

  // ---- adaptive planning ----
  const topic = (over: Partial<WeakTopicInput> = {}): WeakTopicInput => ({
    topic: "useEffect", pct: 0.35, skillName: "React", candidates: [chunk("r1"), chunk("r2", { is_free: false, price_usd: 19 })], fragments: [], ...over,
  });
  const goodPlan = (resource_ids: string[]) => ({ topics: [{
    topic: "useEffect", description: "Revise effects", practice_task: "Build a search filter",
    mini_project_task: "Add debounced search to your project",
    steps: [{ title: "useEffect fundamentals", description: "d" }, { title: "Dependency arrays", description: "d" }, { title: "Cleanup", description: "d" }],
    resource_ids,
  }] });

  await test("adaptive: keeps real resource ids, drops fabricated ones", async () => {
    mockGemini(() => ({ text: JSON.stringify(goodPlan(["r1", "made-up-id", "r2"])) }));
    const [plan] = await planRevision([topic()], { roleName: "Full Stack Developer", level: "Beginner" });
    assert.equal(plan.source, "ai");
    assert.deepEqual(plan.resources.map((r) => r.title), ["Course r1", "Course r2"]);
    assert.equal(plan.resources[1].price_usd, 19);
    assert.equal(plan.steps.length, 3);
    restore();
  });

  await test("adaptive: malformed topic plan falls back; outage falls back; nothing invented", async () => {
    mockGemini(() => ({ text: JSON.stringify({ topics: [{ topic: "useEffect", description: "", steps: [], practice_task: "" , resource_ids: []}] }) }));
    let [plan] = await planRevision([topic()], { roleName: null, level: null });
    assert.equal(plan.source, "fallback");
    assert.ok(plan.steps.length >= 2 && plan.resources.every((r) => ["Course r1", "Course r2"].includes(r.title)));

    mockGemini(() => ({ status: 500, body: {} }));
    [plan] = await silence(() => planRevision([topic()], { roleName: null, level: null }));
    assert.equal(plan.source, "fallback");

    mockGemini(() => ({ text: "garbage" }));
    [plan] = await silence(() => planRevision([topic({ candidates: [] })], { roleName: null, level: null }));
    assert.equal(plan.source, "fallback");
    assert.deepEqual(plan.resources, []);
    restore();
  });

  // ---- roadmap generation with role context ----
  const survey: SurveyInput = { yearSemester: "3rd year", knownSkills: ["JavaScript"], interestDomain: "Web Development", weeklyHours: 8, goal: "Placement", learningStyle: "Project-based" };
  const roleCtx = { roleName: "Full Stack Developer", gap: [{ slug: "jwt", name: "JWT", importance: 3, proficiency: 0 }], demonstrated: [] };

  await test("roadmap: invalid skill slugs and resource ids from the model are discarded", async () => {
    mockGemini(() => ({ text: JSON.stringify({ title: "T", summary: "S", phases: [{
      title: "P1", description: "D", estimated_weeks: 2,
      steps: [{ title: "Learn auth", description: "d", skill_slugs: ["jwt", "hacked", "react"] }, { title: "No tag", description: "d" }],
      resource_ids: ["r1", "ghost"],
    }] }) }));
    const rm = await generateRoadmap(survey, [], [chunk("r1")], roleCtx);
    assert.deepEqual(rm.phases[0].steps[0].skill_slugs, ["jwt"]);
    assert.deepEqual(rm.phases[0].steps[1].skill_slugs, []);
    assert.equal(rm.phases[0].resources.length, 1);
    restore();
  });

  await test("roadmap: without a target role, slugs are never produced (legacy behaviour)", async () => {
    mockGemini(() => ({ text: JSON.stringify({ title: "T", summary: "S", phases: [{ title: "P", description: "D", estimated_weeks: 1, steps: [{ title: "s", description: "d", skill_slugs: ["jwt"] }], resource_ids: [] }] }) }));
    const rm = await generateRoadmap(survey, [], []);
    assert.deepEqual(rm.phases[0].steps[0].skill_slugs, []);
    restore();
  });

  await test("roadmap: structurally invalid responses raise invalid_shape rather than crashing later", async () => {
    for (const bad of [{}, { title: "T", summary: "S", phases: [] }, { title: "T", summary: "S", phases: [{ title: "P", description: "D", steps: [] }] }, { title: 5, summary: "S", phases: [1] }]) {
      mockGemini(() => ({ text: JSON.stringify(bad) }));
      await silence(() => assert.rejects(generateRoadmap(survey, [], []), (e: any) => e instanceof AiError && e.kind === "invalid_shape"));
    }
    restore();
  });

  // ---- github url ----
  await test("github url: accepts repo links, rejects everything else", () => {
    assert.equal(parseGithubRepoUrl("https://github.com/GJGit26/Embarko"), "https://github.com/GJGit26/Embarko");
    assert.equal(parseGithubRepoUrl(" https://www.github.com/a/b/tree/main/src "), "https://github.com/a/b/tree/main/src");
    for (const bad of ["http://github.com/a/b", "https://github.com/a", "https://evil.com/a/b", "https://github.com.evil.com/a/b", "javascript:alert(1)", "https://github.com/a/b c", "", 5, null]) {
      assert.equal(parseGithubRepoUrl(bad as any), null, String(bad));
    }
  });

  await test("safeNext: keeps same-site paths, blocks open redirects", () => {
    assert.equal(safeNext("/career"), "/career");
    assert.equal(safeNext("/roadmap/abc?x=1"), "/roadmap/abc?x=1");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "career", "", null, undefined, "/a://b"]) {
      assert.equal(safeNext(bad as any), "/dashboard", String(bad));
    }
    assert.equal(safeNext("//x", "/career"), "/career");
  });

  console.log(`\n${passed} tests passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
