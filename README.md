# Embarko — RAG-based AI Roadmap Planner

A Next.js 14 app that turns a structured survey into a phased, personalized
technical roadmap. Survey answers are embedded and matched against a curated
knowledge base in Postgres/pgvector; an LLM (Gemini) turns the retrieved
context into phases, steps, and free/paid resource recommendations, which are
then tracked to completion per user.

## Stack

- **Frontend + backend**: Next.js 14 App Router, TypeScript, Next.js API routes (no separate server)
- **Database + Auth + vector search**: Supabase (Postgres + pgvector + Supabase Auth)
- **Embeddings**: Voyage AI (`voyage-3`, 1024-dim)
- **Generation**: Gemini API (server-side only)
- **Styling**: Tailwind CSS, a custom "wayfinding" design system (see `tailwind.config.ts`)


## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run the entire contents of `supabase/schema.sql`. This:
   - enables the `vector` extension
   - creates `profiles`, `survey_responses`, `knowledge_base`, `roadmaps`,
     `roadmap_phases`, `roadmap_steps`, `phase_resources`
   - enables Row Level Security on every user-owned table, scoped to `auth.uid()`
   - creates the `match_knowledge_base` RPC used for vector search
   - creates a trigger that auto-creates a `profiles` row on signup
3. Under **Authentication → Providers**, enable **Email** and **Google**.
   For Google OAuth you'll need a Google Cloud OAuth client — follow
   [Supabase's Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
   and set the redirect URL to `https://<your-project>.supabase.co/auth/v1/callback`.
4. Copy your Project URL, anon key, and service role key into `.env.local`
   (copy `.env.example` first).

## 2. Get API keys

- **Voyage AI**: sign up at [voyageai.com](https://www.voyageai.com/) and create an API key.
- **Gemini**: create a key at [Google AI Studio](https://aistudio.google.com/apikey).

Both keys are server-only — they're read in `lib/embeddings.ts` and
`lib/gemini.ts`, which are never imported from a Client Component, and are
never exposed via `NEXT_PUBLIC_*`.

## 3. Install and seed

```bash
npm install
npm run seed   # embeds and inserts scripts/seed-data.ts into knowledge_base
```

The seed script uses the **service role key** (bypasses RLS) since the
knowledge base is shared, admin-managed content — see `lib/supabase/admin.ts`.
Extend `scripts/seed-data.ts` with your own curated roadmap fragments, courses,
and resources and re-run `npm run seed` any time.

## 4. Add your Spline scene (optional)

`components/hero-scene.tsx` points `SCENE_URL` at a placeholder scene. Build
your own at [spline.design](https://spline.design), export it, and paste the
`.splinecode` URL in. If the scene fails to load (or you never replace the
placeholder), the hero falls back to a small inline SVG route sketch instead
of breaking.

## 5. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`.

## Deploying to Vercel

- Add every variable from `.env.example` to your Vercel project's environment
  variables (mark `SUPABASE_SERVICE_ROLE_KEY`, `VOYAGE_API_KEY`, and
  `GEMINI_API_KEY` as server-only — never add the `NEXT_PUBLIC_` prefix to them).
- `app/api/survey/route.ts` declares `export const maxDuration = 60` because
  embedding + retrieval + generation can take 10–20s. The Hobby plan caps
  functions at 10s regardless of this setting — use a Pro plan (300s cap) if
  generation is timing out.
- Update `NEXT_PUBLIC_SITE_URL` to your production URL, and add it as an
  additional Google OAuth redirect origin.

## How the RAG pipeline works

1. `lib/rag.ts#buildSurveyQuery` turns the six survey answers into one
   deterministic sentence (not a free-text box the user fills in).
2. That sentence is embedded once (`lib/embeddings.ts`) and used to run three
   vector searches via the `match_knowledge_base` RPC: roadmap-fragment
   chunks, course chunks, and resource chunks — all filtered to the student's
   chosen domain.
3. `lib/gemini.ts#generateRoadmap` sends the survey answers, the retrieved
   roadmap fragments, and a labeled candidate list (id / title / free-or-paid
   / price / level / format) to Gemini, with a JSON schema response. Gemini
   decides the number of phases itself and references resources **only by the
   ids it was given** — prices, providers, and free/paid status are always
   read back from the database, never invented by the model.
4. The API route persists the roadmap, phases, steps, and phase resources,
   each scoped to the user via RLS.

## Project structure

```
app/
  (auth)/login, (auth)/signup      — Supabase Auth pages
  api/survey                       — POST: run the full RAG pipeline, persist roadmap
  api/roadmap/[roadmapId]/steps/[stepId] — PATCH: toggle step completion
  api/auth/callback                — OAuth code exchange
  survey                           — multi-step survey form
  dashboard                        — list of the user's roadmaps + progress
  roadmap/[id]                     — a single roadmap: phases, steps, resources
lib/
  supabase/{client,server,admin,middleware}.ts
  embeddings.ts    — Voyage AI
  gemini.ts        — Gemini generation + grounded JSON parsing
  rag.ts           — query building + retrieval
  types.ts         — shared survey/roadmap types
scripts/
  seed-data.ts             — sample knowledge base content
  seed-knowledge-base.ts   — embeds + inserts it via the admin client
supabase/schema.sql        — full schema, RLS policies, RPC
```
