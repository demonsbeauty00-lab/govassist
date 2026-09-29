import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { Database } from "@/lib/supabase/database.types";
import { evaluateEligibility } from "@/lib/eligibility/engine";
import { examCycleRowToRules } from "@/lib/eligibility/from-db-row";
import { profileToApplicant } from "@/lib/eligibility/from-profile";
import {
  decideRecipients,
  isDiscoveryUpdate,
  notificationTypeForUpdate,
  reasonLine,
  RecipientCandidate,
  RecipientReason,
  UpdateType,
} from "@/lib/notifications/relevance";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const PAGE_SIZE = 500;

export interface NotifyRelevantParams {
  /** detected_updates.id — becomes the dedupe key, so re-running this for
   *  the same update can never notify anyone twice. */
  updateId: string;
  updateType: UpdateType;
  examCycleId: string | null;
  examSlug: string | null;
  examCategory: string | null;
  examState: string | null;
  title: string;
  body: string;
}

/**
 * Finds the users a verified update is genuinely relevant to and notifies
 * only them. Replaces Phase 5.5's saved-only fan-out (notifySavedUsers,
 * which stays exported and unchanged) with the three-way rule in
 * lib/notifications/relevance.ts: applied → saved → (opted-in, deterministically
 * eligible, discovery updates only).
 *
 * Uses the service-role client because "everyone who saved / applied /
 * matches X" is a cross-user query no RLS policy should ever permit a
 * normal request to make. Called only from lib/source-monitoring/apply.ts,
 * i.e. only for an update that is already verified and published.
 */
export async function notifyRelevantUsers(params: NotifyRelevantParams): Promise<{ notified: number; byReason: Record<RecipientReason, number> }> {
  const supabase = createAdminClient();
  const byReason: Record<RecipientReason, number> = { applied: 0, saved: 0, eligible: 0 };
  const candidates = new Map<string, RecipientCandidate>();

  const upsertCandidate = (profile: Pick<ProfileRow, "user_id" | "notification_preferences" | "preferred_categories">, patch: Partial<RecipientCandidate>) => {
    const existing = candidates.get(profile.user_id);
    candidates.set(profile.user_id, {
      userId: profile.user_id,
      preferences: profile.notification_preferences,
      preferredCategories: profile.preferred_categories ?? [],
      applied: false,
      saved: false,
      potentiallyEligible: false,
      ...existing,
      ...patch,
    });
  };

  // 1. Users who saved this exam.
  if (params.examSlug) {
    const { data: savedProfiles } = await supabase
      .from("profiles")
      .select("user_id, notification_preferences, preferred_categories")
      .contains("saved_exam_slugs", [params.examSlug]);
    for (const p of savedProfiles ?? []) upsertCandidate(p, { saved: true });
  }

  // 2. Users who recorded an application for this cycle. (Nothing writes
  //    `applications` yet — Phase 11 — so today this returns nobody; the
  //    query is real and will start matching the moment those rows exist.)
  if (params.examCycleId) {
    const { data: applications } = await supabase
      .from("applications")
      .select("user_id")
      .eq("exam_cycle_id", params.examCycleId)
      .eq("status", "applied");
    const appliedIds = (applications ?? []).map((a) => a.user_id);
    if (appliedIds.length > 0) {
      const { data: appliedProfiles } = await supabase
        .from("profiles")
        .select("user_id, notification_preferences, preferred_categories")
        .in("user_id", appliedIds);
      for (const p of appliedProfiles ?? []) upsertCandidate(p, { applied: true });
    }
  }

  // 3. Opted-in users the eligibility engine says are potentially eligible.
  //    Discovery updates only, and only when there is a real exam_cycles
  //    row to read rules from — with no rules, eligibility can't be
  //    evaluated, so nobody is guessed into this group.
  if (isDiscoveryUpdate(params.updateType) && params.examCycleId) {
    const { data: cycle } = await supabase.from("exam_cycles").select("*").eq("id", params.examCycleId).maybeSingle();
    if (cycle) {
      const rules = examCycleRowToRules(cycle, params.examState);
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: page } = await supabase
          .from("profiles")
          .select("*")
          .not("onboarding_completed_at", "is", null)
          .filter("notification_preferences->>eligible_alerts", "eq", "true")
          .order("user_id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (!page || page.length === 0) break;

        const { data: educationRows } = await supabase
          .from("education")
          .select("*")
          .in("user_id", page.map((p) => p.user_id));
        const educationByUser = new Map<string, NonNullable<typeof educationRows>>();
        for (const row of educationRows ?? []) {
          const list = educationByUser.get(row.user_id) ?? [];
          list.push(row);
          educationByUser.set(row.user_id, list);
        }

        for (const profile of page) {
          const applicant = profileToApplicant(profile, educationByUser.get(profile.user_id) ?? []);
          const result = evaluateEligibility(applicant, rules);
          if (result.category === "potentially_eligible") upsertCandidate(profile, { potentiallyEligible: true });
        }
        if (page.length < PAGE_SIZE) break;
      }
    }
  }

  const recipients = decideRecipients({
    updateType: params.updateType,
    examCategory: params.examCategory,
    candidates: Array.from(candidates.values()),
  });
  if (recipients.length === 0) return { notified: 0, byReason };

  const type = notificationTypeForUpdate(params.updateType);
  const rows = recipients.map((r) => ({
    user_id: r.userId,
    title: params.title,
    body: `${params.body} ${reasonLine(r.reason)}`,
    type,
    dedupe_key: `update:${params.updateId}`,
  }));

  // ignoreDuplicates + the (user_id, dedupe_key) unique index (0013): a
  // repeat call inserts nothing, and `data` only contains rows that were
  // actually created — so the counts below are real, not optimistic.
  const { data: inserted, error } = await supabase
    .from("notifications")
    .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("user_id");
  if (error || !inserted) return { notified: 0, byReason };

  const reasonByUser = new Map(recipients.map((r) => [r.userId, r.reason]));
  for (const row of inserted) {
    const reason = reasonByUser.get(row.user_id);
    if (reason) byReason[reason]++;
  }
  return { notified: inserted.length, byReason };
}
