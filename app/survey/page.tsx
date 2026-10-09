import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";
import { SurveyForm, SurveyPrefill } from "@/components/survey-form";
import { loadProfile, loadRoles, loadSkills } from "@/lib/career-data";
import { INTEREST_DOMAINS, InterestDomain } from "@/lib/types";

export default async function SurveyPage({
  searchParams,
}: {
  searchParams: { role?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /survey?role=<slug> comes from the Career page. If anything goes wrong the
  // survey simply opens un-prefilled, exactly as before.
  let prefill: SurveyPrefill | undefined;
  if (user && typeof searchParams.role === "string") {
    try {
      const [roles, skills, profile] = await Promise.all([
        loadRoles(supabase),
        loadSkills(supabase),
        loadProfile(supabase, user.id),
      ]);
      const role = roles.find((r) => r.slug === searchParams.role);
      if (role) {
        const nameBySlug = new Map(skills.map((s) => [s.slug, s.name]));
        prefill = {
          roleSlug: role.slug,
          roleName: role.name,
          knownSkills: profile.declaredSlugs.map((s) => nameBySlug.get(s) ?? s),
          interestDomain: (INTEREST_DOMAINS as readonly string[]).includes(role.domain)
            ? (role.domain as InterestDomain)
            : undefined,
        };
      }
    } catch {
      prefill = undefined;
    }
  }

  return (
    <div className="min-h-screen">
      <NavBar isAuthed={Boolean(user)} />
      <SurveyForm prefill={prefill} />
    </div>
  );
}
