// Run: npm run test:engine   (uses node:assert + tsx; no extra dependencies)
import assert from "node:assert/strict";
import { CAREER_SEED } from "./career-seed-data";
import type { CatalogSkill, EvidenceRow, Project, Role } from "../lib/career-types";
import {
  analyzeSkillGap,
  computeReadiness,
  computeSkillState,
  computeSkillStates,
  expandImplied,
  objectiveSkillScores,
  rankProjects,
  resolveSkillSlug,
  scoreAssessment,
  scoreRoles,
} from "../lib/skills-engine";

// Build in-memory catalog objects from the seed data (ids = slugs here).
const skills: CatalogSkill[] = CAREER_SEED.skills.map((s) => ({
  id: s.slug,
  slug: s.slug,
  name: s.name,
  category: s.category,
  aliases: s.aliases ?? [],
  implies: s.implies ?? [],
}));
const ref = (slug: string) => {
  const s = skills.find((k) => k.slug === slug);
  assert.ok(s, `seed references unknown skill "${slug}"`);
  return { id: s.id, slug: s.slug, name: s.name };
};
const roles: Role[] = CAREER_SEED.roles.map((r) => ({
  id: r.slug,
  slug: r.slug,
  name: r.name,
  description: r.description,
  domain: r.domain,
  difficulty: r.difficulty,
  skills: Object.entries(r.skills).flatMap(([category, list]) =>
    list.map(([slug, importance]) => ({ skill: ref(slug), importance, category }))
  ),
}));
const projects: Project[] = CAREER_SEED.projects.map((p) => ({
  id: p.slug,
  slug: p.slug,
  name: p.name,
  description: p.description,
  difficulty: p.difficulty,
  estimatedHours: p.estimatedHours,
  prerequisites: p.prerequisites,
  expectedOutcome: p.expectedOutcome,
  roleIds: p.roles,
  milestones: p.milestones.map((m, i) => ({
    id: `${p.slug}:${i + 1}`,
    position: i + 1,
    title: m.title,
    description: m.description,
    skills: m.skills.map(ref),
  })),
}));
const role = (slug: string) => {
  const r = roles.find((x) => x.slug === slug);
  assert.ok(r, `missing role ${slug}`);
  return r;
};
const ev = (skill: string, evidence_type: EvidenceRow["evidence_type"], extra: Partial<EvidenceRow> = {}): EvidenceRow => ({
  skill_id: skill,
  evidence_type,
  source_key: `${skill}-${evidence_type}-${Math.random()}`,
  score: null,
  verified: false,
  ...extra,
});

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

// ---- seed integrity --------------------------------------------------------
test("seed: every role/project skill reference exists; every project has milestones with skills", () => {
  assert.ok(roles.length >= 10);
  for (const p of projects) {
    assert.ok(p.milestones.length >= 4, `${p.slug} needs milestones`);
    for (const m of p.milestones) assert.ok(m.skills.length >= 1, `${p.slug}:${m.title} has no skills`);
    for (const rid of p.roleIds) assert.ok(roles.some((r) => r.slug === rid), `${p.slug} -> unknown role ${rid}`);
  }
  const slugs = new Set(skills.map((s) => s.slug));
  assert.equal(slugs.size, skills.length, "duplicate skill slug");
});

// ---- Phase 1: the scenario from the brief ---------------------------------
test("roles: JavaScript/React/Node.js/MongoDB/Git suggests the expected web roles", () => {
  const picked = ["JavaScript", "React", "Node.js", "MongoDB", "Git"].map((s) => resolveSkillSlug(s, skills)!);
  assert.ok(picked.every(Boolean), "all inputs should resolve to catalog skills");
  const matches = scoreRoles(roles, expandImplied(picked, skills), { limit: 10 });
  const names = matches.map((m) => m.role.slug);
  for (const expected of ["frontend-developer", "full-stack-developer", "react-developer", "mern-stack-developer", "web-developer"]) {
    assert.ok(names.includes(expected), `expected ${expected} in ${names.join(", ")}`);
  }
  assert.ok(!names.includes("data-analyst"), "data analyst should not match a web stack");
  // The stack the student picked is exactly MERN minus Express/REST/JWT, so it should rank first.
  assert.equal(matches[0].role.slug, "mern-stack-developer");
  const mern = matches[0];
  assert.ok(mern.coveredSkills.some((s) => s.slug === "mongodb"));
  assert.ok(mern.missingSkills.some((s) => s.slug === "express"), "Express is a real gap for MERN");
  assert.ok(mern.missingSkills.every((s) => !picked.includes(s.slug)));
});

test("roles: implied skills count — React + Node alone cover JavaScript", () => {
  const picked = ["React", "Node.js"].map((s) => resolveSkillSlug(s, skills)!);
  const expanded = expandImplied(picked, skills);
  assert.ok(expanded.has("javascript"));
  assert.ok(!expanded.has("html"), "HTML is not implied by React");
  assert.ok(expandImplied(["nextjs"], skills).has("javascript"), "implication is transitive");
});

test("roles: the Python/Pandas/NumPy/Scikit-learn/TensorFlow scenario suggests data/ML roles", () => {
  const picked = ["Python", "Pandas", "NumPy", "Scikit-learn", "TensorFlow"].map((s) => resolveSkillSlug(s, skills)!);
  assert.ok(picked.every(Boolean));
  const names = scoreRoles(roles, expandImplied(picked, skills), { limit: 10 }).map((m) => m.role.slug);
  for (const expected of ["data-analyst", "machine-learning-engineer", "data-scientist"]) {
    assert.ok(names.includes(expected), `expected ${expected} in ${names.join(", ")}`);
  }
});

test("roles: match% is the importance-weighted coverage and is reproducible", () => {
  const r = role("frontend-developer");
  const have = new Set(r.skills.slice(0, 2).map((s) => s.skill.slug));
  const [m] = scoreRoles([r], have, { minPercent: 0, minMatched: 1 });
  const total = r.skills.reduce((n, s) => n + s.importance, 0);
  const got = r.skills.slice(0, 2).reduce((n, s) => n + s.importance, 0);
  assert.equal(m.matchPercent, Math.round((100 * got) / total));
});

test("roles: a single selected skill does not produce a role (minimum 2 matched)", () => {
  assert.equal(scoreRoles(roles, new Set(["git"])).length, 0);
});

test("skills: aliases resolve; unknown input returns null", () => {
  assert.equal(resolveSkillSlug("node", skills), "nodejs");
  assert.equal(resolveSkillSlug("  REACT.JS ", skills), "react");
  assert.equal(resolveSkillSlug("klingon", skills), null);
});

// ---- Phase 5: evidence ----------------------------------------------------
test("evidence: self-reported evidence alone can never reach 'demonstrated'", () => {
  const rows = [
    ev("react", "self_declared"),
    ev("react", "learning_completed"),
    ev("react", "project_milestone"),
    ev("react", "github_submission"),
    ev("react", "project_completed"),
  ];
  const s = computeSkillState("react", rows);
  assert.equal(s.proficiency, 65);
  assert.notEqual(s.status, "demonstrated");
});

test("evidence: a strong server-graded assessment plus practice reaches 'demonstrated'", () => {
  const rows = [
    ev("react", "self_declared"),
    ev("react", "project_milestone"),
    ev("react", "learning_completed"),
    ev("react", "assessment_passed", { score: 1, verified: true }),
  ];
  const s = computeSkillState("react", rows);
  assert.equal(s.proficiency, 87);
  assert.equal(s.status, "demonstrated");
});

test("evidence: high points without any verified row is still not demonstrated", () => {
  const rows = [
    ev("react", "project_completed"),
    ev("react", "project_milestone"),
    ev("react", "project_milestone"),
    ev("react", "github_submission"),
    ev("react", "coding_solved", { score: 1 }),
    ev("react", "learning_completed"),
  ];
  const s = computeSkillState("react", rows);
  assert.ok(s.proficiency >= 70);
  assert.equal(s.status, "practicing");
});

test("evidence: only self_declared -> 'claimed'; nothing -> 'none'", () => {
  assert.equal(computeSkillState("x", [ev("x", "self_declared")]).status, "claimed");
  assert.equal(computeSkillState("x", []).status, "none");
});

// ---- Skill gap + project ranking -------------------------------------------
test("gap: untouched role is all gap; ranking surfaces projects that close the most gap", () => {
  const r = role("full-stack-developer");
  const gap = analyzeSkillGap(r, new Map());
  assert.equal(gap.demonstrated.length, 0);
  assert.equal(gap.gaps.length, r.skills.length);
  assert.equal(gap.coveragePercent, 0);
  assert.ok(gap.gaps[0].importance >= gap.gaps[gap.gaps.length - 1].importance);
  const ranked = rankProjects(projects, r, gap, "Beginner");
  assert.ok(ranked.length >= 3, "full stack should have beginner/intermediate/advanced projects");
  assert.ok(ranked.every((x) => x.project.roleIds.includes(r.id)));
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].gapScore >= ranked[i].gapScore);
});

test("gap: demonstrating a skill removes it from the gap", () => {
  const r = role("full-stack-developer");
  const rows = [
    ev("react", "self_declared"),
    ev("react", "project_milestone"),
    ev("react", "learning_completed"),
    ev("react", "assessment_passed", { score: 1, verified: true }),
  ];
  const gap = analyzeSkillGap(r, computeSkillStates(rows));
  assert.ok(gap.demonstrated.some((g) => g.skill.slug === "react"));
  assert.ok(!gap.gaps.some((g) => g.skill.slug === "react"));
});

// ---- Phase 12: readiness ----------------------------------------------------
test("readiness: no evidence -> 0; weights sum to 1; projects category present", () => {
  const rd = computeReadiness(role("full-stack-developer"), new Map(), 0);
  assert.equal(rd.overall, 0);
  assert.equal(rd.label, "Getting started");
  const w = rd.categories.reduce((n, c) => n + c.weight, 0);
  assert.ok(Math.abs(w - 1) < 1e-9, `weights sum to ${w}`);
  assert.ok(rd.categories.some((c) => c.name === "Projects"));
});

test("readiness: finishing PROJECTS_TARGET projects alone adds exactly the projects share", () => {
  const rd = computeReadiness(role("full-stack-developer"), new Map(), 2);
  assert.equal(rd.overall, 20);
  assert.equal(rd.categories.find((c) => c.name === "Projects")!.score, 100);
});

test("readiness: improves monotonically as evidence is added", () => {
  const r = role("full-stack-developer");
  const a = computeReadiness(r, computeSkillStates([ev("react", "self_declared")]), 0).overall;
  const b = computeReadiness(
    r,
    computeSkillStates([ev("react", "self_declared"), ev("react", "assessment_passed", { score: 0.9, verified: true })]),
    0
  ).overall;
  assert.ok(b > a);
});

// ---- Phase 8: assessment scoring -------------------------------------------
test("assessment: the brief's scenario — useEffect/state weak, components strong", () => {
  const q = (id: string, type: "mcq" | "concept" | "coding" | "debug", topic: string, credit: number) => ({
    id,
    type,
    topic,
    credit,
  });
  const res = scoreAssessment([
    q("1", "mcq", "useEffect", 0),
    q("2", "mcq", "useEffect", 1),
    q("3", "debug", "useEffect", 0),
    q("4", "mcq", "State Management", 0),
    q("5", "concept", "State Management", 0.5),
    q("6", "mcq", "Components", 1),
    q("7", "mcq", "Components", 1),
    q("8", "coding", "Components", 1),
  ]);
  assert.deepEqual(res.weakTopics.sort(), ["State Management", "useEffect"]);
  assert.deepEqual(res.strongTopics, ["Components"]);
  assert.equal(res.breakdown.debugging, 0);
  assert.equal(res.breakdown.problem_solving, 1);
  // weights: mcq1 concept2 debug2 coding3 -> earned (0+1+0+0+1+1+1+3)=7 of (1+1+2+1+2+1+1+3)=12
  assert.ok(Math.abs(res.overall - 7 / 12) < 1e-9);
  assert.equal(res.passed, false);
});

test("assessment: categories with no questions are null, credit is clamped, empty input is safe", () => {
  const res = scoreAssessment([{ id: "1", type: "mcq", topic: "t", credit: 7 }]);
  assert.equal(res.overall, 1);
  assert.equal(res.breakdown.debugging, null);
  assert.equal(res.breakdown.problem_solving, null);
  assert.equal(scoreAssessment([]).overall, 0);
});

test("assessment evidence: needs >=2 objective questions per skill; concept/coding never count", () => {
  const out = objectiveSkillScores([
    { skillId: "react", type: "mcq", credit: 1 },
    { skillId: "react", type: "debug", credit: 0 },
    { skillId: "react", type: "concept", credit: 1 },
    { skillId: "react", type: "coding", credit: 1 },
    { skillId: "jwt", type: "mcq", credit: 1 }, // only one objective question -> no evidence
    { skillId: "git", type: "concept", credit: 1 },
  ]);
  assert.deepEqual([...out.keys()], ["react"]);
  assert.equal(out.get("react")!.score, 0.5);
  assert.equal(out.get("react")!.count, 2);
});


// ---- the brief's end-to-end scenario, engine layer ---------------------------
test("journey: pick stack -> Full Stack -> Job Tracker auth milestone -> JWT evidence -> assessment -> readiness moves", () => {
  // 1. technologies -> roles -> target
  const picked = ["JavaScript", "React", "Node.js", "MongoDB", "Git"].map((x) => resolveSkillSlug(x, skills)!);
  const expanded = expandImplied(picked, skills);
  const suggested = scoreRoles(roles, expanded, { limit: 10 }).map((m) => m.role.slug);
  assert.ok(suggested.includes("full-stack-developer"));
  const target = role("full-stack-developer");

  // self-declared evidence for the picked + implied skills (what /api/career/roles records)
  let rows: EvidenceRow[] = [...expanded]
    .filter((slug) => skills.some((k) => k.slug === slug))
    .map((slug) => ev(slug, "self_declared", { source_key: "declared" }));
  const before = computeReadiness(target, computeSkillStates(rows), 0).overall;
  const gapBefore = analyzeSkillGap(target, computeSkillStates(rows));
  assert.ok(gapBefore.gaps.some((g) => g.skill.slug === "jwt"), "JWT is a gap before the project");

  // 2. start Job Tracker, complete the authentication milestone
  const tracker = projects.find((p) => p.slug === "job-tracker")!;
  assert.ok(rankProjects(projects, target, gapBefore, "Intermediate").some((r) => r.project.slug === "job-tracker"));
  const authMilestone = tracker.milestones.find((m) => m.title === "Implement authentication")!;
  assert.ok(authMilestone.skills.some((s) => s.slug === "jwt"));
  rows = [...rows, ...authMilestone.skills.map((s) => ev(s.id, "project_milestone", { source_key: authMilestone.id }))];

  // 3. JWT evidence exists, but the skill is NOT mastered just because the milestone was ticked
  const jwt = computeSkillState("jwt", rows);
  assert.equal(jwt.proficiency, 12);
  assert.equal(jwt.status, "practicing");
  assert.ok(computeReadiness(target, computeSkillStates(rows), 0).overall > before);

  // 4. React assessment: useEffect + state weak, components strong
  const q = (id: string, type: "mcq" | "concept" | "coding" | "debug", topic: string, credit: number) => ({ id, type, topic, credit });
  const result = scoreAssessment([
    q("1", "mcq", "useEffect", 0), q("2", "debug", "useEffect", 0), q("3", "mcq", "State Management", 0), q("4", "mcq", "State Management", 1),
    q("5", "mcq", "Components", 1), q("6", "mcq", "Components", 1), q("7", "concept", "Components", 1),
  ]);
  assert.deepEqual(result.weakTopics.sort(), ["State Management", "useEffect"]);
  assert.deepEqual(result.strongTopics, ["Components"]);

  // 5. objective React evidence (graded on the server) pushes React up, verified
  const obj = objectiveSkillScores([
    { skillId: "react", type: "mcq", credit: 1 }, { skillId: "react", type: "mcq", credit: 1 }, { skillId: "react", type: "debug", credit: 1 },
  ]).get("react")!;
  rows = [...rows, ev("react", "assessment_passed", { score: obj.score, verified: true })];
  const react = computeSkillState("react", rows);
  assert.equal(react.verified, true);
  assert.ok(react.proficiency >= 45 + 20);
  const after = computeReadiness(target, computeSkillStates(rows), 0).overall;
  assert.ok(after > before, "readiness reflects the new evidence");
});

console.log(`\n${passed} tests passed`);
