// Turns engine output into the serialisable shape the Career UI renders.
// Shared by the API route (after the student submits) and the /career page
// (so previously chosen technologies show roles on reload without an API call).
import { CatalogSkill, Difficulty, Project, Role } from "@/lib/career-types";
import { expandImplied, scoreRoles } from "@/lib/skills-engine";

export interface RoleSuggestion {
  slug: string;
  name: string;
  description: string;
  domain: string;
  difficulty: Difficulty;
  matchPercent: number;
  core: string[]; // matched skill names, most important first
  missing: string[]; // unmatched skill names, most important first
  projectCount: number;
}

export function buildRoleSuggestions(args: {
  roles: Role[];
  projects: Project[];
  skills: CatalogSkill[];
  selectedSlugs: string[];
  experience?: Difficulty | null;
  preferredDomain?: string | null;
}): RoleSuggestion[] {
  const expanded = expandImplied(args.selectedSlugs, args.skills);
  return scoreRoles(args.roles, expanded, {
    experience: args.experience,
    preferredDomain: args.preferredDomain,
  }).map((m) => ({
    slug: m.role.slug,
    name: m.role.name,
    description: m.role.description,
    domain: m.role.domain,
    difficulty: m.role.difficulty,
    matchPercent: m.matchPercent,
    core: m.coveredSkills.map((s) => s.name),
    missing: m.missingSkills.map((s) => s.name),
    projectCount: args.projects.filter((p) => p.roleIds.includes(m.role.id)).length,
  }));
}
