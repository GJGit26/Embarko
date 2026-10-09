"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CatalogSkill, DIFFICULTIES, Difficulty } from "@/lib/career-types";
import { resolveSkillSlug } from "@/lib/skills-engine";
import type { RoleSuggestion } from "@/lib/role-suggestions";
import { RoleCard } from "@/components/career/role-card";

type PickerSkill = Pick<CatalogSkill, "id" | "slug" | "name" | "category" | "aliases" | "implies">;

export function CareerExplorer({
  skills,
  initialSelected,
  initialExperience,
  initialRoles,
  targetSlug,
}: {
  skills: PickerSkill[];
  initialSelected: string[];
  initialExperience: Difficulty | null;
  initialRoles: RoleSuggestion[];
  targetSlug: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [experience, setExperience] = useState<Difficulty | "">(initialExperience ?? "");
  const [roles, setRoles] = useState(initialRoles);
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState("");
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, PickerSkill[]>();
    for (const s of skills) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return [...m.entries()];
  }, [skills]);

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
    setDirty(true);
  }

  function addFromText() {
    const slug = resolveSkillSlug(lookup, skills as CatalogSkill[]);
    if (!lookup.trim()) return;
    if (!slug) {
      setLookupMsg(`"${lookup.trim()}" isn't in the catalog yet — pick the closest match from the list.`);
      return;
    }
    setLookupMsg(null);
    setSelected((prev) => new Set(prev).add(slug));
    setDirty(true);
    setLookup("");
  }

  async function findRoles() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/career/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: [...selected], experience: experience || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not compute roles");
      setRoles(json.roles);
      setDirty(false);
      if (json.roles.length === 0) {
        setError("None of the catalog roles match those technologies yet. Try adding more of what you know.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function choose(slug: string) {
    setChoosing(slug);
    setError(null);
    try {
      const res = await fetch("/api/career/target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleSlug: slug }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save your target role");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChoosing(null);
    }
  }

  return (
    <div>
      <section>
        <h2 className="font-display text-2xl tracking-tight">What do you already work with?</h2>
        <p className="mt-1 text-sm text-charcoal/55 dark:text-mist/50">
          Pick the technologies you&apos;ve used. We&apos;ll show the roles they open up.
        </p>

        <div className="mt-6 space-y-5">
          {groups.map(([category, list]) => (
            <div key={category}>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
                {category}
              </p>
              <div className="flex flex-wrap gap-2">
                {list.map((s) => {
                  const on = selected.has(s.slug);
                  return (
                    <button
                      key={s.slug}
                      type="button"
                      onClick={() => toggle(s.slug)}
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors duration-150 ${
                        on
                          ? "border-teal bg-teal/10 text-charcoal dark:border-teal-bright dark:bg-teal-bright/10 dark:text-mist"
                          : "border-mist-line hover:border-charcoal/30 dark:border-ink-line dark:hover:border-mist/30"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <input
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFromText();
              }
            }}
            placeholder="Looking for something? e.g. node, sklearn, k8s"
            aria-label="Find a technology by name"
            className="flex-1 rounded border border-mist-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-teal dark:border-ink-line dark:focus:border-teal-bright"
          />
          <button
            type="button"
            onClick={addFromText}
            className="rounded border border-charcoal px-4 text-sm font-medium transition-colors hover:bg-charcoal hover:text-mist dark:border-mist/40 dark:hover:bg-mist/10"
          >
            Add
          </button>
        </div>
        {lookupMsg && <p className="mt-2 text-xs text-rust">{lookupMsg}</p>}

        <div className="mt-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-charcoal/45 dark:text-mist/40">
            Experience level
          </p>
          <div className="grid grid-cols-3 gap-3">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setExperience(d);
                  setDirty(true);
                }}
                aria-pressed={experience === d}
                className={`rounded border px-3 py-2.5 text-sm transition-colors duration-150 ${
                  experience === d
                    ? "border-teal bg-teal/10 dark:border-teal-bright dark:bg-teal-bright/10"
                    : "border-mist-line hover:border-charcoal/30 dark:border-ink-line dark:hover:border-mist/30"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button
            type="button"
            onClick={findRoles}
            disabled={loading || selected.size === 0}
            className="rounded bg-charcoal px-6 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-30 dark:bg-amber dark:text-ink dark:hover:bg-amber-bright"
          >
            {loading ? "Matching…" : roles.length ? "Update possible roles" : "Show possible roles"}
          </button>
          <span className="font-mono text-xs text-charcoal/45 dark:text-mist/40">
            {selected.size} selected
          </span>
        </div>
      </section>

      {error && <p className="mt-6 text-sm text-rust">{error}</p>}

      {roles.length > 0 && (
        <section className="mt-14" aria-live="polite">
          <h2 className="font-display text-2xl tracking-tight">Possible Career Paths</h2>
          <p className="mt-1 text-sm text-charcoal/55 dark:text-mist/50">
            {dirty
              ? "You've changed your selection — update the roles to refresh this list."
              : "Choose the one you want to work toward. Your roadmap, projects and assessments will follow from it."}
          </p>
          <div className="mt-6 grid gap-4">
            {roles.map((r) => (
              <RoleCard
                key={r.slug}
                role={r}
                selected={targetSlug === r.slug}
                busy={choosing !== null}
                onSelect={() => choose(r.slug)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
