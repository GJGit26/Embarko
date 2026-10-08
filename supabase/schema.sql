-- ============================================================================
-- Embarko — RAG Roadmap Planner
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE throughout.
-- ============================================================================

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Profiles — one row per auth.users, created automatically on signup
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are self-readable" on public.profiles;
create policy "profiles are self-readable"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles are self-updatable" on public.profiles;
create policy "profiles are self-updatable"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. Survey responses — the structured (non-free-text) intake form
-- ----------------------------------------------------------------------------
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  year_semester text not null,               -- e.g. '2nd Year, 3rd Semester'
  known_skills text[] not null default '{}', -- e.g. ['HTML','CSS','Python']
  interest_domain text not null,             -- 'Web Development' | 'Machine Learning' | 'DSA' | 'App Development' | 'Cloud/DevOps' | 'Cybersecurity'
  weekly_hours int not null,                 -- hours/week available
  goal text not null,                        -- 'Internship' | 'Placement' | 'Hackathons' | 'Higher Studies' | 'Open Source'
  learning_style text not null,              -- 'Video' | 'Text/Docs' | 'Project-based'
  raw_query text not null,                   -- deterministic text built from the fields above, used for embedding
  created_at timestamptz not null default now()
);

alter table public.survey_responses enable row level security;

drop policy if exists "survey responses are owner-only" on public.survey_responses;
create policy "survey responses are owner-only"
  on public.survey_responses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. Knowledge base — curated roadmap fragments, resources & courses.
--    This is the RAG corpus. Not user-owned: readable by any authenticated
--    user, writable only via the service role (seed script / admin).
-- ----------------------------------------------------------------------------
create table if not exists public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  domain text not null,             -- 'Web Development' | 'Machine Learning' | 'DSA' | ...
  content_type text not null,       -- 'roadmap_fragment' | 'resource' | 'course'
  title text not null,
  body text not null,               -- the chunk text that gets embedded
  url text,
  provider text,                    -- 'freeCodeCamp', 'Coursera', 'Udemy', ...
  is_free boolean not null default true,
  price_usd numeric,                -- null when is_free = true
  skill_level text,                 -- 'Beginner' | 'Intermediate' | 'Advanced'
  format text,                      -- 'Video' | 'Text/Docs' | 'Project-based'
  tags text[] not null default '{}',
  embedding vector(1024),           -- voyage-3 dim = 1024
  created_at timestamptz not null default now()
);

alter table public.knowledge_base enable row level security;

drop policy if exists "knowledge base is readable by authenticated users" on public.knowledge_base;
create policy "knowledge base is readable by authenticated users"
  on public.knowledge_base for select
  to authenticated
  using (true);

-- No insert/update/delete policy is defined for regular users, so writes are
-- only possible with the service role key (used by scripts/seed-knowledge-base.ts).

create index if not exists knowledge_base_embedding_idx
  on public.knowledge_base using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists knowledge_base_domain_idx on public.knowledge_base (domain);
create index if not exists knowledge_base_content_type_idx on public.knowledge_base (content_type);

-- Vector similarity search RPC, callable from server-side code via
-- supabase.rpc('match_knowledge_base', {...}).
create or replace function public.match_knowledge_base(
  query_embedding vector(1024),
  match_domain text default null,
  match_content_type text default null,
  match_count int default 8
)
returns table (
  id uuid,
  domain text,
  content_type text,
  title text,
  body text,
  url text,
  provider text,
  is_free boolean,
  price_usd numeric,
  skill_level text,
  format text,
  tags text[],
  similarity float
)
language sql stable
as $$
  select
    kb.id, kb.domain, kb.content_type, kb.title, kb.body, kb.url,
    kb.provider, kb.is_free, kb.price_usd, kb.skill_level, kb.format, kb.tags,
    1 - (kb.embedding <=> query_embedding) as similarity
  from public.knowledge_base kb
  where (match_domain is null or kb.domain = match_domain)
    and (match_content_type is null or kb.content_type = match_content_type)
  order by kb.embedding <=> query_embedding
  limit match_count;
$$;

-- ----------------------------------------------------------------------------
-- 4. Roadmaps — one generated roadmap per survey response
-- ----------------------------------------------------------------------------
create table if not exists public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  survey_response_id uuid not null references public.survey_responses (id) on delete cascade,
  title text not null,
  summary text not null,
  domain text not null,
  status text not null default 'active', -- 'active' | 'archived'
  created_at timestamptz not null default now()
);

alter table public.roadmaps enable row level security;

drop policy if exists "roadmaps are owner-only" on public.roadmaps;
create policy "roadmaps are owner-only"
  on public.roadmaps for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. Roadmap phases — dynamic number of phases per roadmap (LLM-decided)
-- ----------------------------------------------------------------------------
create table if not exists public.roadmap_phases (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.roadmaps (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null,          -- 1-based order within the roadmap
  title text not null,            -- e.g. 'Foundations', 'Backend Fundamentals'
  description text not null,
  estimated_weeks int,
  created_at timestamptz not null default now()
);

alter table public.roadmap_phases enable row level security;

drop policy if exists "roadmap phases are owner-only" on public.roadmap_phases;
create policy "roadmap phases are owner-only"
  on public.roadmap_phases for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists roadmap_phases_roadmap_idx on public.roadmap_phases (roadmap_id, position);

-- ----------------------------------------------------------------------------
-- 6. Roadmap steps — checkable milestones within a phase
-- ----------------------------------------------------------------------------
create table if not exists public.roadmap_steps (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.roadmap_phases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position int not null,
  title text not null,
  description text,
  is_complete boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.roadmap_steps enable row level security;

drop policy if exists "roadmap steps are owner-only" on public.roadmap_steps;
create policy "roadmap steps are owner-only"
  on public.roadmap_steps for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists roadmap_steps_phase_idx on public.roadmap_steps (phase_id, position);

-- ----------------------------------------------------------------------------
-- 7. Phase resources — the free/paid course & resource recommendations
--    surfaced per phase, sourced from knowledge_base at generation time.
-- ----------------------------------------------------------------------------
create table if not exists public.phase_resources (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.roadmap_phases (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  knowledge_base_id uuid references public.knowledge_base (id) on delete set null,
  title text not null,
  url text,
  provider text,
  is_free boolean not null default true,
  price_usd numeric,
  content_type text not null default 'course', -- 'course' | 'resource'
  format text,
  created_at timestamptz not null default now()
);

alter table public.phase_resources enable row level security;

drop policy if exists "phase resources are owner-only" on public.phase_resources;
create policy "phase resources are owner-only"
  on public.phase_resources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists phase_resources_phase_idx on public.phase_resources (phase_id);

-- ----------------------------------------------------------------------------
-- 8. Convenience view: roadmap progress percentage per roadmap
-- ----------------------------------------------------------------------------
create or replace view public.roadmap_progress as
select
  r.id as roadmap_id,
  r.user_id,
  count(s.id) as total_steps,
  count(s.id) filter (where s.is_complete) as completed_steps,
  case when count(s.id) = 0 then 0
    else round(100.0 * count(s.id) filter (where s.is_complete) / count(s.id))
  end as percent_complete
from public.roadmaps r
left join public.roadmap_phases p on p.roadmap_id = r.id
left join public.roadmap_steps s on s.phase_id = p.id
group by r.id, r.user_id;

-- Views inherit RLS from underlying tables when security_invoker is set.
alter view public.roadmap_progress set (security_invoker = on);
