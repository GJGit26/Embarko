// Server-only data access for the career features. Uses the session-aware
// Supabase client passed in by the caller, so RLS scopes every user-specific
// read to the signed-in student. Loaders throw on a Supabase error; callers
// decide whether that is fatal (API routes) or a soft fallback (dashboard).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AdaptiveRecommendation,
  CatalogSkill,
  Difficulty,
  EvidenceRow,
  Project,
  Role,
  SkillState,
} from "@/lib/career-types";
import {
  analyzeSkillGap,
  computeReadiness,
  computeSkillStates,
  ProjectRecommendation,
  rankProjects,
  Readiness,
  SkillGap,
} from "@/lib/skills-engine";

// The repo has no generated Database types, so supabase-js guesses embedded
// relations as arrays. The runtime shapes are declared in the Raw* interfaces
// below; `check` is where they are asserted.
function check<T>(label: string, res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

// ---- catalog ---------------------------------------------------------------

export async function loadSkills(supabase: SupabaseClient): Promise<CatalogSkill[]> {
  return check<CatalogSkill[]>(
    "skills",
    await supabase.from("skills").select("id, slug, name, category, aliases, implies").order("name")
  );
}

interface RawRole {
  id: string;
  slug: string;
  name: string;
  description: string;
  domain: string;
  difficulty: Difficulty;
  role_skills: {
    importance: 1 | 2 | 3;
    category: string;
    skills: { id: string; slug: string; name: string } | null;
  }[];
}

export async function loadRoles(supabase: SupabaseClient): Promise<Role[]> {
  const rows = check<RawRole[]>(
    "roles",
    await supabase
      .from("roles")
      .select(
        "id, slug, name, description, domain, difficulty, role_skills(importance, category, skills(id, slug, name))"
      )
      .order("name")
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    domain: r.domain,
    difficulty: r.difficulty,
    skills: r.role_skills
      .filter((rs) => rs.skills)
      .map((rs) => ({ skill: rs.skills!, importance: rs.importance, category: rs.category })),
  }));
}

interface RawProject {
  id: string;
  slug: string;
  name: string;
  description: string;
  difficulty: Difficulty;
  estimated_hours: number;
  prerequisites: string[];
  expected_outcome: string;
  project_roles: { role_id: string }[];
  project_milestones: {
    id: string;
    position: number;
    title: string;
    description: string;
    milestone_skills: { skills: { id: string; slug: string; name: string } | null }[];
  }[];
}

export async function loadProjects(supabase: SupabaseClient): Promise<Project[]> {
  const rows = check<RawProject[]>(
    "projects",
    await supabase
      .from("projects")
      .select(
        "id, slug, name, description, difficulty, estimated_hours, prerequisites, expected_outcome, project_roles(role_id), project_milestones(id, position, title, description, milestone_skills(skills(id, slug, name)))"
      )
      .order("name")
  );
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    difficulty: p.difficulty,
    estimatedHours: p.estimated_hours,
    prerequisites: p.prerequisites,
    expectedOutcome: p.expected_outcome,
    roleIds: p.project_roles.map((r) => r.role_id),
    milestones: [...p.project_milestones]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        id: m.id,
        position: m.position,
        title: m.title,
        description: m.description,
        skills: m.milestone_skills.map((ms) => ms.skills).filter((s): s is NonNullable<typeof s> => !!s),
      })),
  }));
}

// ---- user state -----------------------------------------------------------

export interface CareerProfile {
  targetRoleId: string | null;
  experience: Difficulty | null;
  declaredSlugs: string[];
}

export async function loadProfile(supabase: SupabaseClient, userId: string): Promise<CareerProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("target_role_id, experience_level, declared_skill_slugs")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`profile: ${error.message}`);
  return {
    targetRoleId: data?.target_role_id ?? null,
    experience: (data?.experience_level as Difficulty | null) ?? null,
    declaredSlugs: data?.declared_skill_slugs ?? [],
  };
}

export async function loadEvidence(supabase: SupabaseClient, userId: string): Promise<EvidenceRow[]> {
  return check<EvidenceRow[]>(
    "evidence",
    await supabase
      .from("skill_evidence")
      .select("skill_id, evidence_type, source_key, score, verified, detail, created_at")
      .eq("user_id", userId)
  );
}

export interface ProjectProgress {
  userProjectId: string;
  status: "in_progress" | "completed";
  completedMilestoneIds: Set<string>;
  percent: number;
}

export async function loadProjectProgress(
  supabase: SupabaseClient,
  userId: string,
  projects: Project[]
): Promise<Map<string, ProjectProgress>> {
  const [ups, done] = await Promise.all([
    supabase.from("user_projects").select("id, project_id, status").eq("user_id", userId),
    supabase.from("user_milestone_progress").select("milestone_id").eq("user_id", userId),
  ]);
  const userProjects = check<{ id: string; project_id: string; status: "in_progress" | "completed" }[]>(
    "user_projects",
    ups
  );
  const doneIds = new Set(check<{ milestone_id: string }[]>("milestone progress", done).map((d) => d.milestone_id));

  const out = new Map<string, ProjectProgress>();
  for (const up of userProjects) {
    const project = projects.find((p) => p.id === up.project_id);
    if (!project) continue;
    const completed = new Set(project.milestones.filter((m) => doneIds.has(m.id)).map((m) => m.id));
    out.set(project.id, {
      userProjectId: up.id,
      status: up.status,
      completedMilestoneIds: completed,
      percent: project.milestones.length
        ? Math.round((100 * completed.size) / project.milestones.length)
        : 0,
    });
  }
  return out;
}

export async function loadPendingRecommendations(
  supabase: SupabaseClient,
  userId: string,
  roadmapId?: string
): Promise<AdaptiveRecommendation[]> {
  let q = supabase
    .from("adaptive_recommendations")
    .select(
      "id, roadmap_id, phase_id, topic, kind, title, description, steps, resources, target_step_ids, status, created_at"
    )
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (roadmapId) q = q.eq("roadmap_id", roadmapId);
  return check<AdaptiveRecommendation[]>("recommendations", await q);
}

export interface AttemptSummary {
  id: string;
  assessmentId: string;
  title: string;
  overall: number;
  breakdown: { concept: number | null; problem_solving: number | null; debugging: number | null };
  weakTopics: string[];
  strongTopics: string[];
  passed: boolean;
  createdAt: string;
}

export async function loadRecentAttempts(
  supabase: SupabaseClient,
  userId: string,
  limit = 5
): Promise<AttemptSummary[]> {
  const rows = check<
    {
      id: string;
      assessment_id: string;
      overall: number;
      breakdown: AttemptSummary["breakdown"];
      weak_topics: string[];
      strong_topics: string[];
      passed: boolean;
      created_at: string;
      assessments: { title: string } | null;
    }[]
  >(
    "attempts",
    await supabase
      .from("assessment_attempts")
      .select("id, assessment_id, overall, breakdown, weak_topics, strong_topics, passed, created_at, assessments(title)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  return rows.map((r) => ({
    id: r.id,
    assessmentId: r.assessment_id,
    title: r.assessments?.title ?? "Assessment",
    overall: Number(r.overall),
    breakdown: r.breakdown,
    weakTopics: r.weak_topics,
    strongTopics: r.strong_topics,
    passed: r.passed,
    createdAt: r.created_at,
  }));
}

// ---- aggregate for the dashboard + career page ------------------------------

export interface CareerState {
  profile: CareerProfile;
  roles: Role[];
  projects: Project[];
  targetRole: Role | null;
  states: Map<string, SkillState>;
  gap: SkillGap | null;
  readiness: Readiness | null;
  recommendedProjects: ProjectRecommendation[];
  projectProgress: Map<string, ProjectProgress>;
  evidence: EvidenceRow[];
}

export async function loadCareerState(supabase: SupabaseClient, userId: string): Promise<CareerState> {
  const [profile, roles, projects, evidence] = await Promise.all([
    loadProfile(supabase, userId),
    loadRoles(supabase),
    loadProjects(supabase),
    loadEvidence(supabase, userId),
  ]);
  const projectProgress = await loadProjectProgress(supabase, userId, projects);

  const targetRole = roles.find((r) => r.id === profile.targetRoleId) ?? null;
  const states = computeSkillStates(evidence);

  let gap: SkillGap | null = null;
  let readiness: Readiness | null = null;
  let recommendedProjects: ProjectRecommendation[] = [];

  if (targetRole) {
    gap = analyzeSkillGap(targetRole, states);
    recommendedProjects = rankProjects(projects, targetRole, gap, profile.experience);
    const completedRoleProjects = projects.filter(
      (p) => p.roleIds.includes(targetRole.id) && projectProgress.get(p.id)?.status === "completed"
    ).length;
    readiness = computeReadiness(targetRole, states, completedRoleProjects);
  }

  return { profile, roles, projects, targetRole, states, gap, readiness, recommendedProjects, projectProgress, evidence };
}
