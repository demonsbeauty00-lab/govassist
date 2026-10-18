"use server";

export interface ClosingSoonExam {
  slug: string;
  shortName: string;
  daysLeft: number;
}

/**
 * Deprecated no-op (Phase 14). This used to insert deadline notifications
 * from a page load using the signed-in user's session, which RLS forbids
 * (users have no INSERT policy on `notifications`), and it was driven by the
 * DEMO exam catalog. Real deadline reminders are now created by the daily
 * sweep in lib/source-monitoring/deadline-reminders.ts through the central
 * notification engine, from the verified `exam_cycles.application_end_date`.
 * The function is kept (and does nothing) so existing callers keep compiling.
 */
export async function ensureDeadlineReminders(_closingSoonSavedExams: ClosingSoonExam[]): Promise<void> {
  return;
}
