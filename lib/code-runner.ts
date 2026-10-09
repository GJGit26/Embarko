// Client-side only. Runs a student's JavaScript against the question's test
// cases inside a Web Worker with a hard timeout, so an infinite loop or a
// thrown error cannot freeze or crash the page.
//
// Honest limitation: this runs in the student's browser, so the result is
// self-reported — the server cannot verify it. It counts towards the
// assessment score and weak-topic detection but never creates *verified*
// evidence (see app/api/assessments/[id]/submit/route.ts).
import type { CodingTest } from "@/lib/career-types";

export interface RunResult {
  passed: number;
  total: number;
  error?: string;
  results: boolean[];
}

const WORKER_SOURCE = `
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
self.onmessage = async (e) => {
  const { code, fn, tests } = e.data;
  let f;
  try {
    f = new Function(code + "\\nreturn typeof " + fn + " === 'function' ? " + fn + " : undefined;")();
  } catch (err) {
    self.postMessage({ error: String(err) });
    return;
  }
  if (!f) { self.postMessage({ error: 'Your code must define a function named "' + fn + '".' }); return; }
  const results = [];
  for (const t of tests) {
    try { results.push(same(await f(...t.args), t.expected)); } catch (err) { results.push(false); }
  }
  self.postMessage({ results });
};
`;

export function runCodingTests(
  code: string,
  functionName: string,
  tests: CodingTest[],
  timeoutMs = 4000
): Promise<RunResult> {
  const total = tests.length;
  const fail = (error: string): RunResult => ({ passed: 0, total, error, results: tests.map(() => false) });

  if (typeof Worker === "undefined") return Promise.resolve(fail("This browser can't run code tests."));
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(functionName)) return Promise.resolve(fail("Invalid function name."));
  if (!code.trim()) return Promise.resolve(fail("Write some code first."));

  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(url);
    const done = (r: RunResult) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(() => done(fail("Timed out — is there an infinite loop?")), timeoutMs);
    worker.onmessage = (e: MessageEvent<{ error?: string; results?: boolean[] }>) => {
      if (e.data.error) return done(fail(e.data.error));
      const results = e.data.results ?? [];
      done({ passed: results.filter(Boolean).length, total, results });
    };
    worker.onerror = (e) => done(fail(e.message || "Your code threw an error."));
    worker.postMessage({ code, fn: functionName, tests });
  });
}
