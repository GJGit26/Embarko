import { EvidenceRow, EvidenceType, Role, SkillState } from "@/lib/career-types";
import type { EvidenceView } from "@/components/career/skill-evidence-list";

const LABEL: Record<EvidenceType, (r: EvidenceRow) => string> = {
  self_declared: () => "Listed as a skill you already know",
  learning_completed: () => "Completed a learning step on your roadmap",
  assessment_passed: (r) => `Passed an assessment${r.score != null ? ` (${Math.round(r.score * 100)}% on objective questions)` : ""}`,
  coding_solved: () => "Solved a coding problem (all tests passed)",
  project_milestone: (r) => `Project milestone${r.detail ? `: ${r.detail}` : ""}`,
  project_completed: (r) => `Completed project${r.detail ? `: ${r.detail}` : ""}`,
  github_submission: (r) => `GitHub submission${r.detail ? `: ${r.detail.replace("https://", "")}` : ""}`,
};

/** Skills of the target role that have any evidence, strongest first. */
export function buildEvidenceViews(role: Role, states: Map<string, SkillState>): EvidenceView[] {
  return role.skills
    .map((rs) => ({ rs, st: states.get(rs.skill.id) }))
    .filter((x): x is { rs: Role["skills"][number]; st: SkillState } => !!x.st && x.st.evidence.length > 0)
    .sort((a, b) => b.st.proficiency - a.st.proficiency)
    .map(({ rs, st }) => ({
      skill: rs.skill.name,
      proficiency: st.proficiency,
      status: st.status,
      items: st.evidence.map((e) => ({ label: LABEL[e.evidence_type](e), verified: e.verified })),
    }));
}
