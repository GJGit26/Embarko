import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProjects, loadRoles, loadSkills } from "@/lib/career-data";
import { buildRoleSuggestions } from "@/lib/role-suggestions";
import { replaceSelfDeclared } from "@/lib/evidence";
import { expandImplied, resolveSkillSlug } from "@/lib/skills-engine";
import { DIFFICULTIES, Difficulty } from "@/lib/career-types";

// POST { skills: string[], experience?: Difficulty }
// Saves the student's declared technologies, then returns ranked roles. The
// ranking is deterministic coverage math (lib/skills-engine.ts#scoreRoles).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (
    !Array.isArray(body?.skills) ||
    body.skills.length > 60 ||
    !body.skills.every((s: unknown) => typeof s === "string" && s.length <= 60)
  ) {
    return NextResponse.json({ error: "skills must be an array of up to 60 short strings" }, { status: 400 });
  }
  const experience: Difficulty | null = DIFFICULTIES.includes(body.experience) ? body.experience : null;

  try {
    const [skills, roles, projects] = await Promise.all([
      loadSkills(supabase),
      loadRoles(supabase),
      loadProjects(supabase),
    ]);

    if (skills.length === 0 || roles.length === 0) {
      return NextResponse.json(
        { error: "The career catalog is empty. Run `npm run seed:career` first." },
        { status: 503 }
      );
    }

    const resolved = new Set<string>();
    const unrecognized: string[] = [];
    for (const input of body.skills as string[]) {
      const slug = resolveSkillSlug(input, skills);
      if (slug) resolved.add(slug);
      else if (input.trim()) unrecognized.push(input.trim());
    }
    if (resolved.size === 0) {
      return NextResponse.json(
        { error: "Select at least one technology from the list.", unrecognized },
        { status: 400 }
      );
    }
    const selected = [...resolved];

    // Preference signal: the interest domain from the student's latest survey, if any.
    const { data: survey } = await supabase
      .from("survey_responses")
      .select("interest_domain")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Persist the profile (RLS: own row) ...
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      declared_skill_slugs: selected,
      experience_level: experience,
    });
    if (profileError) throw new Error(`Could not save your technologies: ${profileError.message}`);

    // ... and the self-declared evidence (declared + implied), server-written.
    const bySlug = new Map(skills.map((s) => [s.slug, s]));
    const expanded = expandImplied(selected, skills);
    await replaceSelfDeclared(
      user.id,
      [...expanded].flatMap((slug) => {
        const s = bySlug.get(slug);
        return s ? [{ id: s.id, detail: resolved.has(slug) ? "Selected by student" : "Implied by a selected technology" }] : [];
      })
    );

    const suggestions = buildRoleSuggestions({
      roles,
      projects,
      skills,
      selectedSlugs: selected,
      experience,
      preferredDomain: survey?.interest_domain ?? null,
    });

    return NextResponse.json({ roles: suggestions, unrecognized });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to compute roles" }, { status: 500 });
  }
}
