import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";
import { SurveyForm } from "@/components/survey-form";

export default async function SurveyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <NavBar isAuthed={Boolean(user)} />
      <SurveyForm />
    </div>
  );
}
