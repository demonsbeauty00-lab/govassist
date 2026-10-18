// Pure: how healthy is an official source? (no I/O)

export interface SourceHealthInput {
  enabled: boolean;
  needs_parser_maintenance: boolean;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  check_frequency_minutes: number;
}

export type SourceHealth =
  | "disabled"      // switched off by an admin
  | "maintenance"   // the parser failed; skipped until an admin clears it
  | "failing"       // several checks in a row failed
  | "error"         // the last check failed
  | "never_checked" // enabled but not checked yet
  | "stale"         // enabled, but no check for far longer than its schedule
  | "healthy";

/** This many failed checks in a row = "failing", not a one-off blip. */
export const FAILING_THRESHOLD = 3;
/** A source is "stale" once it is this many schedule intervals late (+ 1h grace). */
const STALE_FACTOR = 2;

export function sourceHealth(s: SourceHealthInput, now: Date = new Date()): SourceHealth {
  if (!s.enabled) return "disabled";
  if (s.needs_parser_maintenance) return "maintenance";
  if (s.consecutive_failures >= FAILING_THRESHOLD) return "failing";
  if (s.last_error) return "error";
  if (!s.last_checked_at) return "never_checked";
  const lateAfterMs = s.check_frequency_minutes * 60_000 * STALE_FACTOR + 60 * 60_000;
  if (now.getTime() - Date.parse(s.last_checked_at) > lateAfterMs) return "stale";
  return "healthy";
}

export const SOURCE_HEALTH_LABEL: Record<SourceHealth, string> = {
  disabled: "Inactive",
  maintenance: "Needs parser maintenance",
  failing: "Failing",
  error: "Last check failed",
  never_checked: "Never checked",
  stale: "Check overdue",
  healthy: "Healthy",
};

export interface SourceCounts {
  total: number;
  /** Switched on and not waiting for maintenance. */
  active: number;
  inactive: number;
  maintenance: number;
  /** Active sources whose last check failed (error + failing). */
  withErrors: number;
  stale: number;
  neverChecked: number;
}

export function countSources(sources: SourceHealthInput[], now: Date = new Date()): SourceCounts {
  const c: SourceCounts = { total: sources.length, active: 0, inactive: 0, maintenance: 0, withErrors: 0, stale: 0, neverChecked: 0 };
  for (const s of sources) {
    const h = sourceHealth(s, now);
    if (h === "disabled") c.inactive += 1;
    else if (h === "maintenance") c.maintenance += 1;
    else c.active += 1;
    if (h === "error" || h === "failing") c.withErrors += 1;
    if (h === "stale") c.stale += 1;
    if (h === "never_checked") c.neverChecked += 1;
  }
  return c;
}

/** Errors come from external websites: keep what we show short and plain. */
export function shortError(error: string | null | undefined, max = 200): string | null {
  if (!error) return null;
  const flat = error.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
