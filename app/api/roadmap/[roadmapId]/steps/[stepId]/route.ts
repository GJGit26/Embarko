import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { roadmapId: string; stepId: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.isComplete !== "boolean") {
    return NextResponse.json({ error: "isComplete (boolean) is required" }, { status: 400 });
  }

  // RLS (user_id = auth.uid()) already scopes this update to the caller's
  // own rows, but we also filter explicitly for a clean 404 vs silent no-op.
  const { data, error } = await supabase
    .from("roadmap_steps")
    .update({
      is_complete: body.isComplete,
      completed_at: body.isComplete ? new Date().toISOString() : null,
    })
    .eq("id", params.stepId)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Step not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
