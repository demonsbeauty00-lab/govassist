import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/engine";
import {
  deadlineKeyPrefix,
  deadlineReminderKey,
  planDeadlineReminder,
  reminderText,
} from "@/lib/notifications/deadline";
import { isCorrigendumPending } from "@/lib/eligibility/plan";
import { DISCOVER_LINK } from "@/lib/notifications/events";
import type { NotificationDraft } from "@/lib/notifications/engine/types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Cancels reminders that belong to an OLD deadline: unread DEADLINE_APPROACHING
 * notifications for this cycle whose key carries a different date are deleted
 * (read ones are history and stay). Called when a deadline changes
 * (source-monitoring/apply.ts) and defensively by every sweep. Failures are
 * non-fatal: the new date's keys differ, so nothing duplicates either way.
 */
export async function cancelObsoleteDeadlineReminders(admin: Admin, cycleId: string, currentDeadline: string | null): Promise<number> {
  const prefix = deadlineKeyPrefix(cycleId);
  let q = admin.from("notifications").delete().eq("is_read", false).like("dedupe_key", `${prefix}%`);
  if (currentDeadline) q = q.not("dedupe_key", "like", `${prefix}${currentDeadline}:%`);
  const { data, error } = await q.select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

/**
 * Daily sweep (called from /api/cron/check-sources; Vercel Hobby = daily
 * crons, no always-on process). Reads the CURRENT verified deadline off
 * exam_cycles on every run, so a changed deadline is picked up automatically.
 * See lib/notifications/deadline.ts for the rules (IST end-of-day, 7/3/1,
 * nothing for missing/uncertain/passed deadlines) and the per-user dedupe key.
 */
export async function sweepRealDeadlineReminders(): Promise<{ remindersSent: number; cancelled: number }> {
  const admin = createAdminClient();
  const now = new Date();

  const { data: cycles } = await admin
    .from("exam_cycles")
    .select("id, exam_id, application_end_date, last_verified_date")
    .eq("status", "published")
    .not("application_end_date", "is", null);
  if (!cycles || cycles.length === 0) return { remindersSent: 0, cancelled: 0 };

  const { data: corrigenda } = await admin
    .from("detected_updates")
    .select("exam_cycle_id, processed_at")
    .eq("update_type", "corrigendum")
    .eq("status", "published")
    .in("exam_cycle_id", cycles.map((c) => c.id));
  const corrigendaByCycle = new Map<string, (string | null)[]>();
  for (const row of corrigenda ?? []) {
    if (!row.exam_cycle_id) continue;
    corrigendaByCycle.set(row.exam_cycle_id, [...(corrigendaByCycle.get(row.exam_cycle_id) ?? []), row.processed_at]);
  }

  let remindersSent = 0;
  let cancelled = 0;

  for (const cycle of cycles) {
    cancelled += await cancelObsoleteDeadlineReminders(admin, cycle.id, cycle.application_end_date);

    const plan = planDeadlineReminder({
      deadlineDate: cycle.application_end_date,
      now,
      corrigendumPending: isCorrigendumPending(cycle.last_verified_date, corrigendaByCycle.get(cycle.id) ?? []),
    });
    if (!plan) continue;

    const { data: exam } = await admin.from("exams").select("slug, short_name").eq("id", cycle.exam_id).maybeSingle();
    if (!exam) continue;

    // Audience: users who saved this exam and have not recorded an application.
    const { data: saved } = await admin.from("profiles").select("user_id").contains("saved_exam_slugs", [exam.slug]);
    const { data: applied } = await admin.from("applications").select("user_id").eq("exam_cycle_id", cycle.id).eq("status", "applied");
    const appliedIds = new Set((applied ?? []).map((a) => a.user_id));
    const audience = (saved ?? []).map((p) => p.user_id).filter((id) => !appliedIds.has(id));
    if (audience.length === 0) continue;

    const text = reminderText(exam.short_name, plan);
    const key = deadlineReminderKey(cycle.id, plan.deadlineDate, plan.threshold);
    const drafts: NotificationDraft[] = audience.map((userId) => ({
      userId,
      event: "DEADLINE_APPROACHING",
      title: text.title,
      body: text.body,
      dedupeKey: key,
      linkUrl: `${DISCOVER_LINK}`,
    }));
    const summary = await notify(drafts, admin);
    remindersSent += summary.created;
  }

  return { remindersSent, cancelled };
}
