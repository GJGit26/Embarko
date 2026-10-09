// Pure functions only — no I/O, no AI. Every number the student sees on the
// career pages (role match, skill proficiency, job readiness, assessment
// scores) is computed here from stored data, so it is explainable and testable
// (see scripts/test-engine.ts). The LLM never produces a score.

import {
  AssessmentBreakdown,
  AssessmentResult,
  CatalogSkill,
  Difficulty,
  DIFFICULTIES,
  EvidenceRow,
  EvidenceType,
  Project,
  QuestionResult,
  QuestionType,
  Role,
  SkillState,
  SkillStatus,
  TopicScore,
} from "@/lib/career-types";

// ---------------------------------------------------------------------------
// Skill vocabulary: normalising what the student typed/picked
// ---------------------------------------------------------------------------

/** Map free text ("node", "Node.js", "NODEJS") to a catalog slug, or null. */
export function resolveSkillSlug(input: string, skills: CatalogSkill[]): string | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  for (const s of skills) {
    if (s.slug === q || s.name.toLowerCase() === q || s.aliases.includes(q)) return s.slug;
  }
  return null;
}

/**
 * Expand a set of skills with the skills they imply (React implies JavaScript),
 * transitively. Implication is curated data in `skills.implies`, not inferred.
 */
export function expandImplied(slugs: Iterable<string>, skills: CatalogSkill[]): Set<string> {
  const bySlug = new Map(skills.map((s) => [s.slug, s]));
  const out = new Set<string>();
  const stack = [...slugs];
  while (stack.length) {
    const slug = stack.pop()!;
    if (out.has(slug)) continue;
    out.add(slug);
    for (const implied of bySlug.get(slug)?.implies ?? []) stack.push(implied);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase 1 — possible roles from selected technologies
// ---------------------------------------------------------------------------

export interface RoleMatch {
  role: Role;
  /** Weighted skill coverage, 0..100. See scoreRoles for the formula. */
  matchPercent: number;
  coveredSkills: { slug: string; name: string; importance: number }[];
  missingSkills: { slug: string; name: string; importance: number }[];
}

export interface RoleScoreOptions {
  experience?: Difficulty | null;
  preferredDomain?: string | null;
  /** Hide roles below this coverage (default 20%) or with fewer matched skills (default 2). */
  minPercent?: number;
  minMatched?: number;
  limit?: number;
}

/**
 * match% = 100 * (sum of importance of role skills the student has)
 *                / (sum of importance of all the role's skills)
 * importance is 3 (core) / 2 / 1 (nice to have). "Has" means the skill is
 * selected or implied by something selected. Nothing is estimated by an LLM.
 *
 * Ordering: match% desc; then roles in the preferred domain; then the role
 * whose difficulty is closest to the student's experience level.
 */
export function scoreRoles(
  roles: Role[],
  selectedExpanded: Set<string>,
  opts: RoleScoreOptions = {}
): RoleMatch[] {
  const minPercent = opts.minPercent ?? 20;
  const minMatched = opts.minMatched ?? 2;
  const limit = opts.limit ?? 6;

  const matches: RoleMatch[] = [];
  for (const role of roles) {
    const total = role.skills.reduce((n, s) => n + s.importance, 0);
    if (total === 0) continue;

    const covered = role.skills.filter((s) => selectedExpanded.has(s.skill.slug));
    const missing = role.skills.filter((s) => !selectedExpanded.has(s.skill.slug));
    const coveredWeight = covered.reduce((n, s) => n + s.importance, 0);
    const matchPercent = Math.round((100 * coveredWeight) / total);

    if (covered.length < minMatched || matchPercent < minPercent) continue;

    const toRef = (s: Role["skills"][number]) => ({
      slug: s.skill.slug,
      name: s.skill.name,
      importance: s.importance,
    });
    matches.push({
      role,
      matchPercent,
      coveredSkills: covered.map(toRef).sort((a, b) => b.importance - a.importance),
      missingSkills: missing.map(toRef).sort((a, b) => b.importance - a.importance),
    });
  }

  const expIdx = opts.experience ? DIFFICULTIES.indexOf(opts.experience) : -1;
  const distance = (d: Difficulty) => (expIdx < 0 ? 0 : Math.abs(DIFFICULTIES.indexOf(d) - expIdx));

  matches.sort((a, b) => {
    if (b.matchPercent !== a.matchPercent) return b.matchPercent - a.matchPercent;
    const domA = opts.preferredDomain && a.role.domain === opts.preferredDomain ? 0 : 1;
    const domB = opts.preferredDomain && b.role.domain === opts.preferredDomain ? 0 : 1;
    if (domA !== domB) return domA - domB;
    const dist = distance(a.role.difficulty) - distance(b.role.difficulty);
    if (dist !== 0) return dist;
    return a.role.name.localeCompare(b.role.name);
  });

  return matches.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Phase 5 — skill evidence → proficiency
// ---------------------------------------------------------------------------

/**
 * Points each kind of evidence contributes (before scaling by `score`).
 * Self-reported things are deliberately worth little; only a server-graded
 * assessment can contribute enough to reach "demonstrated".
 */
export const EVIDENCE_POINTS: Record<EvidenceType, number> = {
  self_declared: 20,
  learning_completed: 10,
  project_milestone: 12,
  github_submission: 8,
  project_completed: 15,
  coding_solved: 20, // x fraction of tests passed (executed in the student's browser)
  assessment_passed: 45, // x assessment score for that skill (graded on the server)
};

export const DEMONSTRATED_THRESHOLD = 70;
export const ASSESSMENT_PASS_SCORE = 0.6;

export function evidencePoints(row: EvidenceRow): number {
  return EVIDENCE_POINTS[row.evidence_type] * (row.score ?? 1);
}

/**
 * proficiency = min(100, sum of evidence points).
 * status:
 *   demonstrated — proficiency >= 70 AND at least one verified (server-graded) row
 *   claimed      — the only evidence is self_declared
 *   practicing   — some other evidence exists
 *   none         — no evidence
 * Clicking "complete" can therefore never produce "demonstrated" on its own:
 * the maximum from self-reported evidence alone is 20+10+12+8+15 = 65.
 */
export function computeSkillState(skillId: string, rows: EvidenceRow[]): SkillState {
  const mine = rows.filter((r) => r.skill_id === skillId);
  const proficiency = Math.min(
    100,
    Math.round(mine.reduce((n, r) => n + evidencePoints(r), 0))
  );
  const verified = mine.some((r) => r.verified);

  let status: SkillStatus;
  if (mine.length === 0) status = "none";
  else if (mine.every((r) => r.evidence_type === "self_declared")) status = "claimed";
  else if (proficiency >= DEMONSTRATED_THRESHOLD && verified) status = "demonstrated";
  else status = "practicing";

  return { skillId, proficiency, status, verified, evidence: mine };
}

export function computeSkillStates(evidence: EvidenceRow[]): Map<string, SkillState> {
  const ids = new Set(evidence.map((e) => e.skill_id));
  return new Map([...ids].map((id) => [id, computeSkillState(id, evidence)]));
}

export function stateFor(states: Map<string, SkillState>, skillId: string): SkillState {
  return states.get(skillId) ?? computeSkillState(skillId, []);
}

// ---------------------------------------------------------------------------
// Phase 5/12 — skill gap for a target role
// ---------------------------------------------------------------------------

export interface GapItem {
  skill: Role["skills"][number]["skill"];
  importance: number;
  category: string;
  state: SkillState;
}

export interface SkillGap {
  /** Skills not yet demonstrated, most important and least-developed first. */
  gaps: GapItem[];
  /** Skills at "demonstrated". */
  demonstrated: GapItem[];
  /** Importance-weighted average proficiency across the role's skills, 0..100. */
  coveragePercent: number;
}

export function analyzeSkillGap(role: Role, states: Map<string, SkillState>): SkillGap {
  const items: GapItem[] = role.skills.map((rs) => ({
    skill: rs.skill,
    importance: rs.importance,
    category: rs.category,
    state: stateFor(states, rs.skill.id),
  }));

  const total = items.reduce((n, i) => n + i.importance, 0) || 1;
  const weighted = items.reduce((n, i) => n + i.importance * i.state.proficiency, 0);

  return {
    gaps: items
      .filter((i) => i.state.status !== "demonstrated")
      .sort(
        (a, b) =>
          b.importance - a.importance ||
          a.state.proficiency - b.state.proficiency ||
          a.skill.name.localeCompare(b.skill.name)
      ),
    demonstrated: items.filter((i) => i.state.status === "demonstrated"),
    coveragePercent: Math.round(weighted / total),
  };
}

// ---------------------------------------------------------------------------
// Phase 11 — rank a role's projects by how much of the gap they close
// ---------------------------------------------------------------------------

export interface ProjectRecommendation {
  project: Project;
  /** Importance-weighted count of gap skills this project exercises. */
  gapScore: number;
  gapSkills: string[]; // names
  allSkills: { slug: string; name: string }[];
}

export function projectSkills(project: Project): { id: string; slug: string; name: string }[] {
  const seen = new Map<string, { id: string; slug: string; name: string }>();
  for (const m of project.milestones) for (const s of m.skills) seen.set(s.id, s);
  return [...seen.values()];
}

export function rankProjects(
  projects: Project[],
  role: Role,
  gap: SkillGap,
  experience?: Difficulty | null
): ProjectRecommendation[] {
  const gapBySkill = new Map(gap.gaps.map((g) => [g.skill.id, g]));
  const expIdx = experience ? DIFFICULTIES.indexOf(experience) : 0;

  return projects
    .filter((p) => p.roleIds.includes(role.id))
    .map((project) => {
      const skills = projectSkills(project);
      const hits = skills.filter((s) => gapBySkill.has(s.id));
      return {
        project,
        gapScore: hits.reduce((n, s) => n + (gapBySkill.get(s.id)?.importance ?? 0), 0),
        gapSkills: hits.map((s) => s.name),
        allSkills: skills.map((s) => ({ slug: s.slug, name: s.name })),
      };
    })
    .sort((a, b) => {
      if (b.gapScore !== a.gapScore) return b.gapScore - a.gapScore;
      const da = Math.abs(DIFFICULTIES.indexOf(a.project.difficulty) - expIdx);
      const db = Math.abs(DIFFICULTIES.indexOf(b.project.difficulty) - expIdx);
      return da - db || a.project.name.localeCompare(b.project.name);
    });
}

// ---------------------------------------------------------------------------
// Phase 12 — job readiness
// ---------------------------------------------------------------------------

/** Share of the overall score that comes from completed projects. */
export const PROJECTS_WEIGHT = 0.2;
/** Completing this many of the role's projects scores 100% in the Projects category. */
export const PROJECTS_TARGET = 2;

export type ReadinessLabel = "Getting started" | "Developing" | "Nearly ready" | "Job-ready";

export interface ReadinessCategory {
  name: string;
  score: number; // 0..100
  weight: number; // share of overall, 0..1
  skills: { name: string; proficiency: number; status: SkillStatus }[];
}

export interface Readiness {
  overall: number; // 0..100
  label: ReadinessLabel;
  categories: ReadinessCategory[];
}

export function readinessLabel(overall: number): ReadinessLabel {
  if (overall < 35) return "Getting started";
  if (overall < 60) return "Developing";
  if (overall < 80) return "Nearly ready";
  return "Job-ready";
}

/**
 * Per skill category: score = importance-weighted average proficiency of the
 * role's skills in that category.
 * overall = (1 - PROJECTS_WEIGHT) * sum(category.score * categoryImportanceShare)
 *         + PROJECTS_WEIGHT * projectsScore
 * projectsScore = min(100, 100 * completedRoleProjects / PROJECTS_TARGET).
 */
export function computeReadiness(
  role: Role,
  states: Map<string, SkillState>,
  completedRoleProjects: number
): Readiness {
  const totalImportance = role.skills.reduce((n, s) => n + s.importance, 0) || 1;
  const groups = new Map<string, Role["skills"]>();
  for (const rs of role.skills) {
    groups.set(rs.category, [...(groups.get(rs.category) ?? []), rs]);
  }

  const skillShare = 1 - PROJECTS_WEIGHT;
  const categories: ReadinessCategory[] = [...groups.entries()].map(([name, rss]) => {
    const imp = rss.reduce((n, s) => n + s.importance, 0);
    const score =
      rss.reduce((n, s) => n + s.importance * stateFor(states, s.skill.id).proficiency, 0) / imp;
    return {
      name,
      score: Math.round(score),
      weight: skillShare * (imp / totalImportance),
      skills: rss.map((s) => {
        const st = stateFor(states, s.skill.id);
        return { name: s.skill.name, proficiency: st.proficiency, status: st.status };
      }),
    };
  });

  const projectsScore = Math.min(100, Math.round((100 * completedRoleProjects) / PROJECTS_TARGET));
  categories.push({ name: "Projects", score: projectsScore, weight: PROJECTS_WEIGHT, skills: [] });

  const overall = Math.round(categories.reduce((n, c) => n + c.score * c.weight, 0));
  return { overall, label: readinessLabel(overall), categories };
}

// ---------------------------------------------------------------------------
// Phase 8 — assessment scoring (objective arithmetic over per-question credit)
// ---------------------------------------------------------------------------

/** Relative weight of each question type in the overall score. */
export const QUESTION_WEIGHT: Record<QuestionType, number> = {
  mcq: 1,
  concept: 2,
  debug: 2,
  coding: 3,
};

export const WEAK_BELOW = 0.6;
export const STRONG_AT_LEAST = 0.8;

export interface ScoredQuestion {
  id: string;
  type: QuestionType;
  topic: string;
  /** Credit in 0..1: MCQ/debug are 0 or 1; concept is key points hit / total; coding is tests passed / total. */
  credit: number;
  feedback?: string;
}

export function scoreAssessment(questions: ScoredQuestion[]): AssessmentResult {
  const perQuestion: QuestionResult[] = questions.map((q) => {
    const possible = QUESTION_WEIGHT[q.type];
    const credit = Math.max(0, Math.min(1, q.credit));
    return {
      question_id: q.id,
      type: q.type,
      topic: q.topic,
      earned: credit * possible,
      possible,
      feedback: q.feedback,
    };
  });

  const sum = (rs: QuestionResult[], k: "earned" | "possible") => rs.reduce((n, r) => n + r[k], 0);
  const ratio = (rs: QuestionResult[]) => (rs.length === 0 ? null : sum(rs, "earned") / sum(rs, "possible"));

  const overall = ratio(perQuestion) ?? 0;
  const breakdown: AssessmentBreakdown = {
    concept: ratio(perQuestion.filter((r) => r.type === "mcq" || r.type === "concept")),
    problem_solving: ratio(perQuestion.filter((r) => r.type === "coding")),
    debugging: ratio(perQuestion.filter((r) => r.type === "debug")),
  };

  const byTopic = new Map<string, { earned: number; possible: number }>();
  for (const r of perQuestion) {
    const t = byTopic.get(r.topic) ?? { earned: 0, possible: 0 };
    t.earned += r.earned;
    t.possible += r.possible;
    byTopic.set(r.topic, t);
  }
  const topicScores: Record<string, TopicScore> = {};
  for (const [topic, t] of byTopic) {
    topicScores[topic] = { earned: t.earned, possible: t.possible, pct: t.earned / t.possible };
  }

  const entries = Object.entries(topicScores);
  return {
    overall,
    breakdown,
    topicScores,
    weakTopics: entries
      .filter(([, t]) => t.pct < WEAK_BELOW)
      .sort((a, b) => a[1].pct - b[1].pct)
      .map(([k]) => k),
    strongTopics: entries
      .filter(([, t]) => t.pct >= STRONG_AT_LEAST)
      .sort((a, b) => b[1].pct - a[1].pct)
      .map(([k]) => k),
    passed: overall >= ASSESSMENT_PASS_SCORE,
    perQuestion,
  };
}

export interface SkillQuestionOutcome {
  skillId: string;
  type: QuestionType;
  credit: number;
}

/**
 * Per-skill score used to create `assessment_passed` evidence. Only
 * objectively graded questions (mcq, debug) count, and a skill needs at least
 * `minQuestions` of them, so one lucky guess cannot create evidence. AI-judged
 * short answers and browser-run code inform the feedback and weak-topic
 * detection but never this evidence.
 */
export function objectiveSkillScores(
  outcomes: SkillQuestionOutcome[],
  minQuestions = 2
): Map<string, { score: number; count: number }> {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const o of outcomes) {
    if (o.type !== "mcq" && o.type !== "debug") continue;
    const a = acc.get(o.skillId) ?? { sum: 0, count: 0 };
    a.sum += o.credit;
    a.count += 1;
    acc.set(o.skillId, a);
  }
  const out = new Map<string, { score: number; count: number }>();
  for (const [id, a] of acc) {
    if (a.count >= minQuestions) out.set(id, { score: a.sum / a.count, count: a.count });
  }
  return out;
}
