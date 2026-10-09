export type Difficulty = "Beginner" | "Intermediate" | "Advanced";
export const DIFFICULTIES: readonly Difficulty[] = ["Beginner", "Intermediate", "Advanced"];

export interface SkillRef {
  id: string;
  slug: string;
  name: string;
}

export interface CatalogSkill extends SkillRef {
  category: string;
  aliases: string[];
  implies: string[];
}

export interface RoleSkill {
  skill: SkillRef;
  importance: 1 | 2 | 3;
  category: string; // readiness group, e.g. "Frontend"
}

export interface Role {
  id: string;
  slug: string;
  name: string;
  description: string;
  domain: string;
  difficulty: Difficulty;
  skills: RoleSkill[];
}

export interface ProjectMilestone {
  id: string;
  position: number;
  title: string;
  description: string;
  skills: SkillRef[];
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string;
  difficulty: Difficulty;
  estimatedHours: number;
  prerequisites: string[];
  expectedOutcome: string;
  roleIds: string[];
  milestones: ProjectMilestone[];
}

export type EvidenceType =
  | "self_declared"
  | "learning_completed"
  | "assessment_passed"
  | "coding_solved"
  | "project_milestone"
  | "project_completed"
  | "github_submission";

export interface EvidenceRow {
  skill_id: string;
  evidence_type: EvidenceType;
  source_key: string;
  score: number | null;
  verified: boolean;
  detail?: string | null;
  created_at?: string;
}

export type SkillStatus = "none" | "claimed" | "practicing" | "demonstrated";

export interface SkillState {
  skillId: string;
  proficiency: number; // 0..100
  status: SkillStatus;
  verified: boolean; // has at least one server-graded evidence row
  evidence: EvidenceRow[];
}

// ---- Assessments ----------------------------------------------------------

export type QuestionType = "mcq" | "concept" | "coding" | "debug";

export interface McqPayload {
  options: string[];
}
export interface ConceptPayload {
  hint?: string;
}
export interface DebugPayload {
  code: string;
  language: string;
  options: string[]; // possible root causes
}
export interface CodingTest {
  args: unknown[];
  expected: unknown;
}
export interface CodingPayload {
  language: "javascript";
  function_name: string;
  problem: string;
  input_description: string;
  output_description: string;
  examples: { args: unknown[]; expected: unknown }[];
  constraints: string[];
  starter_code: string;
  tests: CodingTest[];
}

export type QuestionPayload = McqPayload | ConceptPayload | DebugPayload | CodingPayload;

/** Question as sent to the browser. Contains no answer data. */
export interface ClientQuestion {
  id: string;
  position: number;
  type: QuestionType;
  topic: string;
  prompt: string;
  payload: QuestionPayload;
}

export interface QuestionResult {
  question_id: string;
  type: QuestionType;
  topic: string;
  earned: number;
  possible: number;
  feedback?: string;
}

export interface TopicScore {
  earned: number;
  possible: number;
  pct: number; // 0..1
}

export interface AssessmentBreakdown {
  concept: number | null;
  problem_solving: number | null;
  debugging: number | null;
}

export interface AssessmentResult {
  overall: number; // 0..1
  breakdown: AssessmentBreakdown;
  topicScores: Record<string, TopicScore>;
  weakTopics: string[];
  strongTopics: string[];
  passed: boolean;
  perQuestion: QuestionResult[];
}

// ---- Adaptive recommendations ---------------------------------------------

export type RecKind = "revise" | "practice" | "mini_project" | "skip";

export interface RecResource {
  title: string;
  url: string | null;
  provider: string | null;
  is_free: boolean;
  price_usd: number | null;
}

export interface AdaptiveRecommendation {
  id: string;
  roadmap_id: string;
  phase_id: string | null;
  topic: string;
  kind: RecKind;
  title: string;
  description: string;
  steps: { title: string; description: string }[];
  resources: RecResource[];
  target_step_ids: string[];
  status: "pending" | "done" | "dismissed" | "superseded";
  created_at: string;
}
