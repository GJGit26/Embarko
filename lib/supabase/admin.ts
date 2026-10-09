import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// DANGER: bypasses Row Level Security. Never import this from any file that
// can be reached by a browser request. It exists only for:
//   - scripts/seed-knowledge-base.ts, scripts/seed-career-data.ts (shared corpora)
//   - lib/evidence.ts and the assessment API routes, which write integrity-
//     sensitive tables (skill_evidence, assessments, answer keys, attempts)
//     that are owner-read-only under RLS. Those routes authenticate the
//     session first and always take user_id from it, never from the request.
// The service role key must only ever live in a server-side env var.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
