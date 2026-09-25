import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySavedUsers } from "./notify";

const THRESHOLDS_DAYS = [7, 3, 1];

/**
 * Real-exam counterpart to lib/actions/reminders.ts (which handles the
 * still-mock demo catalog — see that file's header). This one reads the
 * live application_end_date straight off exam_cycles every run, so a
 * corrigendum that changes the deadline (applied via
 * lib/source-monitoring/apply.ts, which patches that same column) is
 * automatically reflected the next time this sweep runs — there's no
 * separate "update the reminder" step, because there's no stored reminder
 * to go stale; every run recomputes days-left from the current value.
 *
 * "Do not generate reminders if the deadline is uncertain" (requirement
 * 10): the query below only considers cycles with a non-null
 * application_end_date at all, and only fires at exactly 7/3/1 days out —
 * an exam whose deadline isn't published yet simply never matches.
 */
export async function sweepRealDeadlineReminders(): Promise<{ remindersSent: number }> {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: cycles } = await supabase
    .from("exam_cycles")
    .select("id, exam_id, application_end_date")
    .eq("status", "published")
    .not("application_end_date", "is", null);

  if (!cycles || cycles.length === 0) return { remindersSent: 0 };

  let remindersSent = 0;

  for (const cycle of cycles) {
    if (!cycle.application_end_date) continue;

    const daysLeft = Math.ceil((new Date(cycle.application_end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (!THRESHOLDS_DAYS.includes(daysLeft)) continue;

    const { data: exam } = await supabase.from("exams").select("slug, short_name").eq("id", cycle.exam_id).maybeSingle();
    if (!exam) continue;

    const title = `${exam.short_name}: ${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining to apply`;

    // Cross-user dedup: if this exact threshold's reminder already went out
    // to anyone in roughly the last day, skip re-sending this run. This is
    // a batch-level check (not per-recipient), which is the honest
    // trade-off of not having dedicated per-user delivery tracking — see
    // the README for what a more precise version would need.
    const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "deadline")
      .eq("title", title)
      .gte("created_at", twentyHoursAgo)
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    const { notified } = await notifySavedUsers({
      examSlug: exam.slug,
      title,
      body: `Source: Official notification. The application window for ${exam.short_name} closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — verify details in official notification before applying.`,
      type: "deadline",
    });
    remindersSent += notified;
  }

  return { remindersSent };
}
