import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { ResultRow } from "@/lib/eligibility/plan";
import { DISCOVER_LINK } from "./events";
import { notify } from "./engine";
import { detectEligibilityChanges, eligibilityChangeKey, eligibilityChangeText } from "./eligibility-change-plan";
import type { NotificationDraft } from "./engine/types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Called after eligibility rows were written. Notifies only users who FOLLOW
 * the exam (saved it, or recorded an application) about a real category
 * change. Never throws: re-evaluation must not fail because a notification did.
 */
export async function notifyEligibilityChanges(admin: Admin, rows: ResultRow[]): Promise<number> {
  try {
    const changes = detectEligibilityChanges(rows);
    if (changes.length === 0) return 0;

    const cycleIds = Array.from(new Set(changes.map((c) => c.cycleId)));
    const { data: cycles } = await admin.from("exam_cycles").select("id, exam_id").in("id", cycleIds);
    const examIds = Array.from(new Set((cycles ?? []).map((c) => c.exam_id)));
    const { data: exams } = await admin.from("exams").select("id, slug, short_name").in("id", examIds);
    const examByCycle = new Map<string, { slug: string; name: string }>();
    for (const c of cycles ?? []) {
      const e = (exams ?? []).find((x) => x.id === c.exam_id);
      if (e) examByCycle.set(c.id, { slug: e.slug, name: e.short_name });
    }

    const userIds = Array.from(new Set(changes.map((c) => c.userId)));
    const { data: profiles } = await admin.from("profiles").select("user_id, saved_exam_slugs").in("user_id", userIds);
    const savedByUser = new Map<string, string[]>((profiles ?? []).map((p) => [p.user_id as string, (p.saved_exam_slugs as string[] | null) ?? []]));
    const { data: applied } = await admin.from("applications").select("user_id, exam_cycle_id").in("user_id", userIds).in("exam_cycle_id", cycleIds).eq("status", "applied");
    const appliedKeys = new Set((applied ?? []).map((a) => `${a.user_id}:${a.exam_cycle_id}`));

    const drafts: NotificationDraft[] = [];
    for (const c of changes) {
      const exam = examByCycle.get(c.cycleId);
      if (!exam) continue;
      const follows = (savedByUser.get(c.userId) ?? []).includes(exam.slug) || appliedKeys.has(`${c.userId}:${c.cycleId}`);
      if (!follows) continue;
      const text = eligibilityChangeText(exam.name, c.to);
      drafts.push({
        userId: c.userId, event: "ELIGIBILITY_CHANGED", title: text.title, body: text.body,
        dedupeKey: eligibilityChangeKey(c.cycleId, c.to, c.changedAt), linkUrl: DISCOVER_LINK,
      });
    }
    if (drafts.length === 0) return 0;
    return (await notify(drafts, admin)).created;
  } catch {
    console.error("eligibility: change notification failed");
    return 0;
  }
}
