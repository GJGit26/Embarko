export const INTEREST_DOMAINS = [
  "Web Development",
  "Machine Learning",
  "DSA & Competitive Programming",
  "App Development",
  "Cloud & DevOps",
  "Cybersecurity",
] as const;

export const GOALS = [
  "Internship",
  "Placement",
  "Hackathons",
  "Higher Studies",
  "Open Source",
] as const;

export const LEARNING_STYLES = ["Video", "Text/Docs", "Project-based"] as const;

export type InterestDomain = (typeof INTEREST_DOMAINS)[number];
export type Goal = (typeof GOALS)[number];
export type LearningStyle = (typeof LEARNING_STYLES)[number];

export interface SurveyInput {
  yearSemester: string;
  knownSkills: string[];
  interestDomain: InterestDomain;
  weeklyHours: number;
  goal: Goal;
  learningStyle: LearningStyle;
}

export interface RetrievedChunk {
  id: string;
  domain: string;
  content_type: "roadmap_fragment" | "resource" | "course";
  title: string;
  body: string;
  url: string | null;
  provider: string | null;
  is_free: boolean;
  price_usd: number | null;
  skill_level: string | null;
  format: string | null;
  tags: string[];
  similarity: number;
}

export interface GeneratedResource {
  title: string;
  url?: string;
  provider?: string;
  is_free: boolean;
  price_usd?: number;
  format?: string;
}

export interface GeneratedStep {
  title: string;
  description: string;
}

export interface GeneratedPhase {
  title: string;
  description: string;
  estimated_weeks: number;
  steps: GeneratedStep[];
  resources: GeneratedResource[];
}

export interface GeneratedRoadmap {
  title: string;
  summary: string;
  phases: GeneratedPhase[];
}
