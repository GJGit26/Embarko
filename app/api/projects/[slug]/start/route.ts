import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST — starts a project for the signed-in student (idempotent).
export async function POST(_req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", params.slug)
    .maybeSingle();
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { error } = await supabase
    .from("user_projects")
    .upsert(
      { user_id: user.id, project_id: project.id },
      { onConflict: "user_id,project_id", ignoreDuplicates: true }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
