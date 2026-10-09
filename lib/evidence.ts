// The ONLY module that writes skill_evidence. The table is owner-read-only
// under RLS (so a student cannot forge "assessment_passed" from the browser),
// which means writes use the service-role client. Callers must already have
// authenticated the request and must pass the session's user id — never an id
// taken from a request body. Server-only: never import from a Client Component.
import { createAdminClient } from "@/lib/supabase/admin";
import { EvidenceType } from "@/lib/career-types";

export interface NewEvidence {
  skill_id: string;
  evidence_type: EvidenceType;
  source_key: string;
  score?: number | null;
  verified?: boolean;
  detail?: string | null;
}

/** Idempotent: the same (user, skill, type, source) is updated, never duplicated. */
export async function recordEvidence(userId: string, rows: NewEvidence[]): Promise<void> {
  if (rows.length === 0) return;
  const db = createAdminClient();
  const { error } = await db.from("skill_evidence").upsert(
    rows.map((r) => ({
      user_id: userId,
      skill_id: r.skill_id,
      evidence_type: r.evidence_type,
      source_key: r.source_key,
      score: r.score ?? null,
      verified: r.verified ?? false,
      detail: r.detail ?? null,
    })),
    { onConflict: "user_id,skill_id,evidence_type,source_key" }
  );
  if (error) throw new Error(`recordEvidence failed: ${error.message}`);
}

/** Remove evidence created by one source, e.g. when a milestone is un-checked. */
export async function removeEvidence(
  userId: string,
  filter: { evidence_type: EvidenceType; source_key: string; skill_id?: string }
): Promise<void> {
  const db = createAdminClient();
  let q = db
    .from("skill_evidence")
    .delete()
    .eq("user_id", userId)
    .eq("evidence_type", filter.evidence_type)
    .eq("source_key", filter.source_key);
  if (filter.skill_id) q = q.eq("skill_id", filter.skill_id);
  const { error } = await q;
  if (error) throw new Error(`removeEvidence failed: ${error.message}`);
}

/**
 * Replace the student's self-declared skills with `skillIds` (declared plus
 * implied). Self-declared evidence is worth little by design (see
 * EVIDENCE_POINTS) and can never make a skill "demonstrated". Other kinds of
 * evidence are untouched, so re-declaring never erases earned progress.
 */
export async function replaceSelfDeclared(
  userId: string,
  skills: { id: string; detail: string }[]
): Promise<void> {
  const db = createAdminClient();
  const keep = skills.map((s) => s.id);

  let del = db
    .from("skill_evidence")
    .delete()
    .eq("user_id", userId)
    .eq("evidence_type", "self_declared");
  if (keep.length > 0) del = del.not("skill_id", "in", `(${keep.join(",")})`);
  const { error } = await del;
  if (error) throw new Error(`replaceSelfDeclared (clear) failed: ${error.message}`);

  await recordEvidence(
    userId,
    skills.map((s) => ({
      skill_id: s.id,
      evidence_type: "self_declared" as const,
      source_key: "declared",
      verified: false,
      detail: s.detail,
    }))
  );
}
