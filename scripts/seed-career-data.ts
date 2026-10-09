/**
 * Seeds the shared career catalog (skills, roles, role_skills, projects,
 * milestones) from scripts/career-seed-data.ts. Idempotent: safe to re-run.
 * Milestone ids are stable across runs (upsert on project_id + position), so
 * students' progress is preserved when the catalog is edited.
 *
 * Run AFTER applying supabase/adaptive.sql:   npm run seed:career
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * No embedding/AI calls are made.
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { createAdminClient } from "../lib/supabase/admin";
import { CAREER_SEED } from "./career-seed-data";

function fail(step: string, error: { message: string } | null): never {
  console.error(`✗ ${step}: ${error?.message ?? "unknown error"}`);
  process.exit(1);
}

async function main() {
  const db = createAdminClient();
  const { skills, roles, projects } = CAREER_SEED;

  // Fail early on a typo in the seed data rather than half-seeding.
  const skillSlugs = new Set(skills.map((s) => s.slug));
  const roleSlugs = new Set(roles.map((r) => r.slug));
  for (const r of roles)
    for (const list of Object.values(r.skills))
      for (const [slug] of list)
        if (!skillSlugs.has(slug)) fail(`role ${r.slug}`, { message: `unknown skill "${slug}"` });
  for (const p of projects) {
    for (const rs of p.roles) if (!roleSlugs.has(rs)) fail(`project ${p.slug}`, { message: `unknown role "${rs}"` });
    for (const m of p.milestones)
      for (const s of m.skills)
        if (!skillSlugs.has(s)) fail(`project ${p.slug}`, { message: `unknown skill "${s}"` });
  }
  for (const s of skills)
    for (const i of s.implies ?? [])
      if (!skillSlugs.has(i)) fail(`skill ${s.slug}`, { message: `implies unknown skill "${i}"` });

  // 1. skills
  {
    const { error } = await db.from("skills").upsert(
      skills.map((s) => ({
        slug: s.slug,
        name: s.name,
        category: s.category,
        aliases: (s.aliases ?? []).map((a) => a.toLowerCase()),
        implies: s.implies ?? [],
      })),
      { onConflict: "slug" }
    );
    if (error) fail("skills", error);
  }
  const { data: skillRows, error: skillErr } = await db.from("skills").select("id, slug");
  if (skillErr || !skillRows) fail("read skills", skillErr);
  const skillId = new Map(skillRows.map((s: { id: string; slug: string }) => [s.slug, s.id]));

  // 2. roles + role_skills (role_skills replaced per role so removed skills disappear)
  {
    const { error } = await db.from("roles").upsert(
      roles.map((r) => ({
        slug: r.slug,
        name: r.name,
        description: r.description,
        domain: r.domain,
        difficulty: r.difficulty,
      })),
      { onConflict: "slug" }
    );
    if (error) fail("roles", error);
  }
  const { data: roleRows, error: roleErr } = await db.from("roles").select("id, slug");
  if (roleErr || !roleRows) fail("read roles", roleErr);
  const roleId = new Map(roleRows.map((r: { id: string; slug: string }) => [r.slug, r.id]));

  for (const r of roles) {
    const rid = roleId.get(r.slug)!;
    const { error: delErr } = await db.from("role_skills").delete().eq("role_id", rid);
    if (delErr) fail(`clear role_skills ${r.slug}`, delErr);
    const rows = Object.entries(r.skills).flatMap(([category, list]) =>
      list.map(([slug, importance]) => ({
        role_id: rid,
        skill_id: skillId.get(slug)!,
        importance,
        category,
      }))
    );
    const { error } = await db.from("role_skills").insert(rows);
    if (error) fail(`role_skills ${r.slug}`, error);
  }

  // 3. projects, project_roles, milestones, milestone_skills
  {
    const { error } = await db.from("projects").upsert(
      projects.map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        difficulty: p.difficulty,
        estimated_hours: p.estimatedHours,
        prerequisites: p.prerequisites,
        expected_outcome: p.expectedOutcome,
      })),
      { onConflict: "slug" }
    );
    if (error) fail("projects", error);
  }
  const { data: projRows, error: projErr } = await db.from("projects").select("id, slug");
  if (projErr || !projRows) fail("read projects", projErr);
  const projectId = new Map(projRows.map((p: { id: string; slug: string }) => [p.slug, p.id]));

  for (const p of projects) {
    const pid = projectId.get(p.slug)!;

    const { error: prDel } = await db.from("project_roles").delete().eq("project_id", pid);
    if (prDel) fail(`clear project_roles ${p.slug}`, prDel);
    const { error: prErr } = await db
      .from("project_roles")
      .insert(p.roles.map((rs) => ({ project_id: pid, role_id: roleId.get(rs)! })));
    if (prErr) fail(`project_roles ${p.slug}`, prErr);

    const { error: mErr } = await db.from("project_milestones").upsert(
      p.milestones.map((m, i) => ({
        project_id: pid,
        position: i + 1,
        title: m.title,
        description: m.description,
      })),
      { onConflict: "project_id,position" }
    );
    if (mErr) fail(`milestones ${p.slug}`, mErr);

    // Drop milestones that no longer exist in the seed (cascades their progress).
    const { error: trimErr } = await db
      .from("project_milestones")
      .delete()
      .eq("project_id", pid)
      .gt("position", p.milestones.length);
    if (trimErr) fail(`trim milestones ${p.slug}`, trimErr);

    const { data: mRows, error: mReadErr } = await db
      .from("project_milestones")
      .select("id, position")
      .eq("project_id", pid);
    if (mReadErr || !mRows) fail(`read milestones ${p.slug}`, mReadErr);
    const milestoneId = new Map(mRows.map((m: { id: string; position: number }) => [m.position, m.id]));

    const ids = [...milestoneId.values()];
    const { error: msDel } = await db.from("milestone_skills").delete().in("milestone_id", ids);
    if (msDel) fail(`clear milestone_skills ${p.slug}`, msDel);
    const msRows = p.milestones.flatMap((m, i) =>
      m.skills.map((slug) => ({ milestone_id: milestoneId.get(i + 1)!, skill_id: skillId.get(slug)! }))
    );
    const { error: msErr } = await db.from("milestone_skills").insert(msRows);
    if (msErr) fail(`milestone_skills ${p.slug}`, msErr);
  }

  console.log(
    `✓ Seeded ${skills.length} skills, ${roles.length} roles, ${projects.length} projects ` +
      `(${projects.reduce((n, p) => n + p.milestones.length, 0)} milestones).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
