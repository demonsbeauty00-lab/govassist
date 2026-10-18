// Pure deadline-reminder rules (no I/O) so they can be unit tested.
//
// Time zone: Indian government deadlines are stated as calendar dates in IST.
// A deadline of 2026-11-10 means "until the end of 10 Nov, India time", so the
// deadline INSTANT is 2026-11-10T23:59:59+05:30 and "days left" counts IST
// calendar days (never UTC days, which would be off by a day for ~5.5h/day).

export const REMINDER_THRESHOLDS_DAYS = [7, 3, 1] as const;
export type ReminderThreshold = (typeof REMINDER_THRESHOLDS_DAYS)[number];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value: string | null | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The moment the application window actually closes (end of day, IST). */
export function deadlineInstant(deadlineDate: string): Date {
  return new Date(`${deadlineDate}T23:59:59+05:30`);
}

/** Today's calendar date in IST, as YYYY-MM-DD. */
export function istToday(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole IST calendar days from today until the deadline day (0 = closes today). */
export function istDaysLeft(deadlineDate: string, now: Date): number {
  const diff = Date.parse(`${deadlineDate}T00:00:00Z`) - Date.parse(`${istToday(now)}T00:00:00Z`);
  return Math.round(diff / 86_400_000);
}

export interface ReminderPlan { threshold: ReminderThreshold; daysLeft: number; deadlineDate: string }

/**
 * Which reminder (if any) is due right now for a cycle.
 *  - none when the deadline is missing/invalid, or a corrigendum is pending
 *    (the date may be about to change, so it is not reliable),
 *  - none once the deadline has passed,
 *  - otherwise the SMALLEST threshold that has been reached (7, 3 or 1), so a
 *    run on day 5 sends the "7 days" reminder at most once, and never sends 7,
 *    3 and 1 all at once.
 * Idempotency comes from the dedupe key (deadlineReminderKey), not from here.
 */
export function planDeadlineReminder(params: {
  deadlineDate: string | null | undefined;
  now: Date;
  corrigendumPending?: boolean;
}): ReminderPlan | null {
  const { deadlineDate, now } = params;
  if (!isValidDateOnly(deadlineDate)) return null;
  if (params.corrigendumPending) return null;
  if (now.getTime() >= deadlineInstant(deadlineDate).getTime()) return null;

  const daysLeft = istDaysLeft(deadlineDate, now);
  if (daysLeft < 0) return null;
  const reached = REMINDER_THRESHOLDS_DAYS.filter((t) => daysLeft <= t);
  if (reached.length === 0) return null;
  return { threshold: Math.min(...reached) as ReminderThreshold, daysLeft, deadlineDate };
}

/** Includes the deadline date: a changed deadline produces fresh keys, so the
 *  new date gets its own reminders while the old date's can never repeat. */
export function deadlineReminderKey(cycleId: string, deadlineDate: string, threshold: number): string {
  return `deadline:${cycleId}:${deadlineDate}:${threshold}d`;
}
export function deadlineKeyPrefix(cycleId: string): string {
  return `deadline:${cycleId}:`;
}
/** Reminder keys for this cycle whose date is NOT the current deadline. */
export function isObsoleteReminderKey(key: string, cycleId: string, currentDeadline: string | null): boolean {
  if (!key.startsWith(deadlineKeyPrefix(cycleId))) return false;
  if (!currentDeadline) return true;
  return !key.startsWith(`${deadlineKeyPrefix(cycleId)}${currentDeadline}:`);
}

export function reminderText(examName: string, plan: ReminderPlan): { title: string; body: string } {
  const when = plan.daysLeft === 0 ? "closes today" : `closes in ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"}`;
  return {
    title: `${examName}: applications ${when}`,
    body: `The application window for ${examName} ${when} (last date ${plan.deadlineDate}, as per the official notification). Please verify the date on the official website before applying.`,
  };
}
