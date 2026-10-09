-- ============================================================================
-- Embarko — Adaptive Career & Project Learning (additive migration)
-- Run AFTER supabase/schema.sql, in the Supabase SQL editor. Safe to re-run.
-- Nothing here drops or rewrites an existing table; existing tables only gain
-- nullable columns.
--
-- Access model
--   * Catalog tables (skills, roles, role_skills, projects, ...) are shared:
--     readable by any authenticated user, writable only via the service role
--     (scripts/seed-career-data.ts).
--   * Progress tables the user may legitimately edit (user_projects,
--     user_milestone_progress) are owner-only for all operations.
--   * Integrity-sensitive tables (skill_evidence, assessments, questions,
--     attempts) are owner-READ-ONLY. All writes go through server routes that
--     verify the session first and then use the service role. Otherwise a
--     student could insert "assessment_passed" evidence from the browser.
--   * assessment_answer_keys has RLS enabled and NO policies: nobody except
--     the service role can read it, so answers never reach the client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Skill / role / project catalog (shared, curated)
-- ----------------------------------------------------------------------------
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null,                    -- 'Language' | 'Framework' | 'Database' | 'Tool' | 'Concept'
  aliases text[] not null default '{}',      -- lowercase alternates, e.g. {'node','node.js'}
  implies text[] not null default '{}',      -- slugs this skill implies, e.g. react -> {javascript}
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  domain text not null,                      -- matches INTEREST_DOMAINS so it can drive the existing survey/RAG
  difficulty text not null check (difficulty in ('Beginner','Intermediate','Advanced')),
  created_at timestamptz not null default now()
);

create table if not exists public.role_skills (
  role_id uuid not null references public.roles (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  importance int not null check (importance between 1 and 3),  -- 3 = core, 1 = nice to have
  category text not null,                    -- readiness group shown to the student, e.g. 'Frontend'
  primary key (role_id, skill_id)
);
create index if not exists role_skills_skill_idx on public.role_skills (skill_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  difficulty text not null check (difficulty in ('Beginner','Intermediate','Advanced')),
  estimated_hours int not null,
  prerequisites text[] not null default '{}',
  expected_outcome text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_roles (
  project_id uuid not null references public.projects (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  primary key (project_id, role_id)
);
create index if not exists project_roles_role_idx on public.project_roles (role_id);

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position int not null,
  title text not null,
  description text not null,
  unique (project_id, position)
);

-- A project's skills are the union of its milestones' skills, so there is no
-- separate project_skills table to keep in sync.
create table if not exists public.milestone_skills (
  milestone_id uuid not null references public.project_milestones (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  primary key (milestone_id, skill_id)
);
create index if not exists milestone_skills_skill_idx on public.milestone_skills (skill_id);

do $$
declare t text;
begin
  foreach t in array array['skills','roles','role_skills','projects','project_roles','project_milestones','milestone_skills']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "catalog readable by authenticated" on public.%I', t);
    execute format('create policy "catalog readable by authenticated" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Extend existing tables (nullable columns only — old rows stay valid)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists target_role_id uuid references public.roles (id) on delete set null,
  add column if not exists experience_level text check (experience_level in ('Beginner','Intermediate','Advanced')),
  add column if not exists declared_skill_slugs text[] not null default '{}';

-- The signup trigger normally creates the row; this lets the app upsert for
-- accounts that pre-date the trigger.
drop policy if exists "profiles are self-insertable" on public.profiles;
create policy "profiles are self-insertable"
  on public.profiles for insert
  with check (auth.uid() = id);

alter table public.roadmaps
  add column if not exists role_id uuid references public.roles (id) on delete set null;

alter table public.roadmap_steps
  add column if not exists skill_id uuid references public.skills (id) on delete set null;
create index if not exists roadmap_steps_skill_idx on public.roadmap_steps (skill_id);

-- ----------------------------------------------------------------------------
-- 3. User project progress (owner-editable)
-- ----------------------------------------------------------------------------
create table if not exists public.user_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, project_id)
);

create table if not exists public.user_milestone_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  milestone_id uuid not null references public.project_milestones (id) on delete cascade,
  submission_url text,
  completed_at timestamptz not null default now(),
  unique (user_id, milestone_id)
);
create index if not exists user_milestone_progress_user_idx on public.user_milestone_progress (user_id);

alter table public.user_projects enable row level security;
drop policy if exists "user projects are owner-only" on public.user_projects;
create policy "user projects are owner-only" on public.user_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_milestone_progress enable row level security;
drop policy if exists "milestone progress is owner-only" on public.user_milestone_progress;
create policy "milestone progress is owner-only" on public.user_milestone_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. Skill evidence (owner-read-only; server writes)
-- ----------------------------------------------------------------------------
create table if not exists public.skill_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  evidence_type text not null check (evidence_type in (
    'self_declared','learning_completed','assessment_passed','coding_solved',
    'project_milestone','project_completed','github_submission'
  )),
  source_key text not null,          -- id of the step/milestone/assessment/question that produced it, or 'declared'
  score numeric check (score is null or (score >= 0 and score <= 1)),
  verified boolean not null default false,   -- true only when graded by the server, not self-reported
  detail text,
  created_at timestamptz not null default now(),
  unique (user_id, skill_id, evidence_type, source_key)
);
create index if not exists skill_evidence_user_idx on public.skill_evidence (user_id, skill_id);

alter table public.skill_evidence enable row level security;
drop policy if exists "evidence is owner-readable" on public.skill_evidence;
create policy "evidence is owner-readable" on public.skill_evidence
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. Assessments (owner-read-only; server writes; answer keys server-only)
-- ----------------------------------------------------------------------------
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  roadmap_id uuid references public.roadmaps (id) on delete set null,
  phase_id uuid references public.roadmap_phases (id) on delete set null,
  role_id uuid references public.roles (id) on delete set null,
  title text not null,
  focus_topics text[] not null default '{}',   -- set when generated as a reassessment of weak topics
  created_at timestamptz not null default now()
);
create index if not exists assessments_user_idx on public.assessments (user_id, created_at desc);

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null,
  type text not null check (type in ('mcq','concept','coding','debug')),
  topic text not null,                          -- e.g. 'useEffect'
  skill_id uuid references public.skills (id) on delete set null,
  prompt text not null,
  payload jsonb not null default '{}',          -- options / code / examples / tests. NEVER answers.
  unique (assessment_id, position)
);

create table if not exists public.assessment_answer_keys (
  question_id uuid primary key references public.assessment_questions (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  answer_key jsonb not null
);

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  answers jsonb not null,
  per_question jsonb not null,        -- [{question_id, earned, possible, feedback?}]
  overall numeric not null check (overall >= 0 and overall <= 1),
  breakdown jsonb not null,           -- {concept, problem_solving, debugging} each 0..1 or null
  topic_scores jsonb not null,        -- {topic: {earned, possible, pct}}
  weak_topics text[] not null default '{}',
  strong_topics text[] not null default '{}',
  passed boolean not null,
  created_at timestamptz not null default now(),
  unique (assessment_id)              -- one attempt per assessment; a retake is a newly generated assessment
);
create index if not exists assessment_attempts_user_idx on public.assessment_attempts (user_id, created_at desc);

alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_answer_keys enable row level security;   -- no policy on purpose
alter table public.assessment_attempts enable row level security;

drop policy if exists "assessments are owner-readable" on public.assessments;
create policy "assessments are owner-readable" on public.assessments
  for select using (auth.uid() = user_id);

drop policy if exists "questions are owner-readable" on public.assessment_questions;
create policy "questions are owner-readable" on public.assessment_questions
  for select using (auth.uid() = user_id);

drop policy if exists "attempts are owner-readable" on public.assessment_attempts;
create policy "attempts are owner-readable" on public.assessment_attempts
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6. Adaptive recommendations — layered on top of the untouched roadmap
-- ----------------------------------------------------------------------------
create table if not exists public.adaptive_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  phase_id uuid references public.roadmap_phases (id) on delete set null,
  attempt_id uuid references public.assessment_attempts (id) on delete set null,
  skill_id uuid references public.skills (id) on delete set null,
  topic text not null,
  kind text not null check (kind in ('revise','practice','mini_project','skip')),
  title text not null,
  description text not null,
  steps jsonb not null default '[]',        -- ordered revision steps [{title, description}]
  resources jsonb not null default '[]',    -- [{title, url, provider, is_free, price_usd}] read back from knowledge_base
  target_step_ids uuid[] not null default '{}',  -- roadmap steps a 'skip' recommendation refers to
  status text not null default 'pending' check (status in ('pending','done','dismissed','superseded')),
  created_at timestamptz not null default now()
);
create index if not exists adaptive_recs_roadmap_idx on public.adaptive_recommendations (roadmap_id, status);
create index if not exists adaptive_recs_user_idx on public.adaptive_recommendations (user_id);

alter table public.adaptive_recommendations enable row level security;
drop policy if exists "recommendations are owner-readable" on public.adaptive_recommendations;
create policy "recommendations are owner-readable" on public.adaptive_recommendations
  for select using (auth.uid() = user_id);
drop policy if exists "recommendations status is owner-updatable" on public.adaptive_recommendations;
create policy "recommendations status is owner-updatable" on public.adaptive_recommendations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- RLS limits WHICH rows; column privileges limit WHAT can change. Students can
-- mark a recommendation done/dismissed but cannot rewrite its content.
revoke update on public.adaptive_recommendations from authenticated;
grant update (status) on public.adaptive_recommendations to authenticated;
