import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";
import { HeroScene } from "@/components/hero-scene";
import { INTEREST_DOMAINS } from "@/lib/types";

const STEPS = [
  {
    title: "Take the survey",
    body: "Six structured questions — year, known skills, interest domain, weekly hours, goal, and how you like to learn. No blank box to stare at.",
  },
  {
    title: "We search a curated knowledge base",
    body: "Your answers become a query. Vector search pulls the most relevant roadmap guidance and courses from a knowledge base tagged by level, format, and price.",
  },
  {
    title: "Get a grounded, phased roadmap",
    body: "An LLM combines your answers with what was retrieved into a roadmap with as many phases as your timeline actually needs — each with real steps and resources.",
  },
  {
    title: "Track your progress",
    body: "Every step is checkable. Your dashboard shows a live percentage so you always know exactly where you stand.",
  },
];

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <NavBar isAuthed={Boolean(user)} />

      {/* Hero — left-aligned headline block, Spline scene offset to the right */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 pb-16 pt-16 md:grid-cols-[1.1fr_0.9fr] md:pb-24 md:pt-24 md:px-10">
          <div className="relative z-10">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-teal dark:text-teal-bright">
              For college students, not career changers
            </p>
            <h1 className="mt-5 max-w-xl text-balance font-display text-4xl leading-[1.08] tracking-tight text-charcoal dark:text-mist md:text-5xl">
              A technical roadmap, mapped to where you actually stand.
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-charcoal/75 dark:text-mist/70">
              Six questions in, a phased plan out — retrieved from a curated
              base of roadmaps and courses, not guessed from a generic
              template. Free and paid resources, labeled clearly, for every
              phase.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href={user ? "/survey" : "/signup"}
                className="rounded bg-charcoal px-6 py-3 text-sm font-medium text-mist transition-colors duration-200 hover:bg-teal dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
              >
                {user ? "Build my roadmap" : "Start the survey"}
              </Link>
              <Link
                href="#how-it-works"
                className="text-sm font-medium text-charcoal/70 underline decoration-teal/40 decoration-2 underline-offset-4 transition-colors hover:text-charcoal hover:decoration-teal dark:text-mist/70 dark:hover:text-mist"
              >
                See how it works
              </Link>
            </div>
          </div>

          <div className="relative h-[320px] md:h-[440px]">
            <HeroScene />
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-contour text-mist-line dark:text-ink-line"
          aria-hidden
        />
      </section>

      {/* How it works — a genuine sequence, so numbering earns its place */}
      <section id="how-it-works" className="border-t border-mist-line dark:border-ink-line">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10">
          <h2 className="max-w-md font-display text-2xl tracking-tight md:text-3xl">
            From survey to a plan you can act on.
          </h2>

          <ol className="relative mt-14 space-y-12 border-l border-mist-line pl-8 dark:border-ink-line md:pl-10">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative">
                <span className="absolute -left-[41px] top-0 flex h-8 w-8 items-center justify-center rounded-full border border-teal bg-mist font-mono text-xs text-teal dark:border-teal-bright dark:bg-ink dark:text-teal-bright md:-left-[49px]">
                  {i + 1}
                </span>
                <h3 className="font-display text-lg">{step.title}</h3>
                <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-charcoal/70 dark:text-mist/65">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Domains */}
      <section className="border-t border-mist-line bg-mist-dim/60 dark:border-ink-line dark:bg-ink-soft/40">
        <div className="mx-auto max-w-6xl px-6 py-20 md:px-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <h2 className="max-w-md font-display text-2xl tracking-tight md:text-3xl">
              Six domains, each with its own curated corpus.
            </h2>
            <p className="max-w-sm text-sm text-charcoal/65 dark:text-mist/60">
              Every domain's knowledge base is sequenced by people who've
              mentored students through it, not scraped indiscriminately.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded border border-mist-line bg-mist-line dark:border-ink-line dark:bg-ink-line sm:grid-cols-2 lg:grid-cols-3">
            {INTEREST_DOMAINS.map((domain) => (
              <div
                key={domain}
                className="group bg-mist p-6 transition-colors duration-200 hover:bg-mist-dim dark:bg-ink dark:hover:bg-ink-soft"
              >
                <p className="font-display text-lg">{domain}</p>
                <p className="mt-2 text-sm text-charcoal/60 dark:text-mist/55">
                  Beginner to advanced, sequenced with free and paid resources
                  at each stage.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-mist-line dark:border-ink-line">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center md:px-10">
          <h2 className="mx-auto max-w-lg text-balance font-display text-2xl tracking-tight md:text-3xl">
            Stop guessing what to learn next.
          </h2>
          <Link
            href={user ? "/survey" : "/signup"}
            className="mt-8 inline-block rounded bg-charcoal px-7 py-3 text-sm font-medium text-mist transition-colors hover:bg-teal dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
          >
            {user ? "Build my roadmap" : "Get your roadmap"}
          </Link>
        </div>
      </section>

      <footer className="border-t border-mist-line py-8 text-center text-xs text-charcoal/50 dark:border-ink-line dark:text-mist/45">
        Embarko — built for students figuring out what to learn next.
      </footer>
    </div>
  );
}
