// Pure: where an exam cycle is in its APPLICATION window (no I/O).
// Dates are YYYY-MM-DD calendar dates in India, compared as strings.

export type CycleTiming = "upcoming" | "current" | "expired" | "undated";

export interface CycleDates { application_start_date: string | null; application_end_date: string | null }

/** Today's calendar date in India (UTC+5:30), as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 *  expired  - the last date has passed
 *  upcoming - applications have not opened yet
 *  current  - the window is open (a missing last date counts as open: nothing
 *             has been announced, and we never invent a closing date)
 *  undated  - no dates at all, so GovAssist cannot say where it is
 */
export function classifyCycleTiming(cycle: CycleDates, today: string): CycleTiming {
  const { application_start_date: start, application_end_date: end } = cycle;
  if (end && end < today) return "expired";
  if (start && start > today) return "upcoming";
  if (!start && !end) return "undated";
  return "current";
}

export interface CycleCounts { current: number; expired: number; upcoming: number; undated: number; total: number }

export function countCycles(cycles: CycleDates[], today: string): CycleCounts {
  const counts: CycleCounts = { current: 0, expired: 0, upcoming: 0, undated: 0, total: cycles.length };
  for (const c of cycles) counts[classifyCycleTiming(c, today)] += 1;
  return counts;
}

/** Whole days from today until `date` (0 = today, negative = past). */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
