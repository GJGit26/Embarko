import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST { roleSlug } — stores the student's target role on their profile.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (typeof body?.roleSlug !== "string" || body.roleSlug.length > 80) {
    return NextResponse.json({ error: "roleSlug (string) is required" }, { status: 400 });
  }

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id, slug, name")
    .eq("slug", body.roleSlug)
    .maybeSingle();
  if (roleError) return NextResponse.json({ error: roleError.message }, { status: 500 });
  if (!role) return NextResponse.json({ error: "Unknown role" }, { status: 404 });

  const { error } = await supabase.from("profiles").upsert({ id: user.id, target_role_id: role.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, role: { slug: role.slug, name: role.name } });
}
