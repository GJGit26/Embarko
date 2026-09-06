import { createBrowserClient } from "@supabase/ssr";

// Safe for client components: only the URL + anon key are used here, and RLS
// policies (see supabase/schema.sql) enforce that every table is scoped to
// auth.uid(), so the anon key alone never exposes another user's data.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
