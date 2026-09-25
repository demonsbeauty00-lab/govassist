"use server";

import { requireUser } from "./session";

export interface ClosingSoonExam {
  slug: string;
  shortName: string;
  daysLeft: number;
}

/**
 * Creates a real notifications row for each saved exam that's closing soon,
 * unless one was already created for it in the last 24 hours (so this is
 * safe to call on every Jobs/My Exams page load without spamming — there's
 * no cron/scheduled-function infrastructure here, so "check on page visit,
 * dedupe by recency" is the honest way to do reminders without one).
 *
 * Silently no-ops if Supabase isn't configured or there's no signed-in
 * user — this is a best-effort background action, never something a page
 * should block rendering on or surface a config error for.
 */
export async function ensureDeadlineReminders(closingSoonSavedExams: ClosingSoonExam[]): Promise<void> {
  if (closingSoonSavedExams.length === 0) return;

  const result = await requireUser();
  if (!result.ok) return;
  const { supabase, user } = result;

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  for (const exam of closingSoonSavedExams) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", "deadline")
      .ilike("body", `%${exam.shortName}%`)
      .gte("created_at", oneDayAgo)
      .limit(1)
      .maybeSingle();

    if (existing) continue;

    await supabase.from("notifications").insert({
      user_id: user.id,
      title: `${exam.shortName} closes in ${exam.daysLeft} day${exam.daysLeft === 1 ? "" : "s"}`,
      body: `The application window for ${exam.shortName} — an exam you saved — is closing soon. Verify details in the official notification before applying.`,
      type: "deadline",
    });
  }
}
