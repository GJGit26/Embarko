import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordEvidence, removeEvidence } from "@/lib/evidence";

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
    .select("id, skill_id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Step not found" }, { status: 404 });
  }

  // Role-based roadmaps tag steps with a skill. Checking one off records
  // low-weight, self-reported "learning completed" evidence for that skill —
  // never "mastered". Evidence is best-effort: a failure here must not undo
  // the checkbox the student just ticked.
  if (data.skill_id) {
    try {
      if (body.isComplete) {
        await recordEvidence(user.id, [
          {
            skill_id: data.skill_id,
            evidence_type: "learning_completed",
            source_key: params.stepId,
            verified: false,
          },
        ]);
      } else {
        await removeEvidence(user.id, { evidence_type: "learning_completed", source_key: params.stepId });
      }
    } catch (err) {
      console.error("[steps] evidence update failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
