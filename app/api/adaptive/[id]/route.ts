import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH { status: "done" | "dismissed" } — the student's own RLS-scoped update.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (body?.status !== "done" && body?.status !== "dismissed") {
    return NextResponse.json({ error: 'status must be "done" or "dismissed"' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("adaptive_recommendations")
    .update({ status: body.status })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
