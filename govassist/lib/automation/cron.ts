// Pure helpers for the scheduled routes. No I/O, so they are unit-testable.

import { timingSafeEqual } from "crypto";

/** Constant-time check of an `Authorization: Bearer <secret>` header. */
export function isAuthorizedCron(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authHeader);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** At most this many sources are fetched per run, so one run stays inside the function time limit. */
export const MAX_SOURCES_PER_RUN = 10;
/** Stop STARTING new source checks after this long (ms); maxDuration is 60s and the sweeps still need time. */
export const SOURCE_CHECK_BUDGET_MS = 35_000;

export interface Schedulable {
  last_checked_at: string | null;
}

/**
 * Picks which due sources to check this run: never-checked first, then the ones
 * checked longest ago. The rest are simply picked up by the next run — nothing is
 * skipped permanently, and a slow source cannot starve the others forever.
 */
export function selectSourcesForRun<T extends Schedulable>(due: T[], max: number = MAX_SOURCES_PER_RUN): { selected: T[]; deferred: number } {
  const sorted = [...due].sort((a, b) => {
    const at = a.last_checked_at ? new Date(a.last_checked_at).getTime() : 0;
    const bt = b.last_checked_at ? new Date(b.last_checked_at).getTime() : 0;
    return at - bt;
  });
  const selected = sorted.slice(0, Math.max(0, max));
  return { selected, deferred: sorted.length - selected.length };
}

export function withinBudget(startedAtMs: number, nowMs: number, budgetMs: number = SOURCE_CHECK_BUDGET_MS): boolean {
  return nowMs - startedAtMs < budgetMs;
}
