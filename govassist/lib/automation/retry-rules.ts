// Pure rules that decide whether a RETRY is safe. Every admin retry goes
// through these, so a retry can never publish unreviewed data or hammer a site.

export const MIN_RECHECK_INTERVAL_MS = 5 * 60_000;
/** Same cap as the delivery engine (lib/notifications/engine/delivery.ts). */
export const MAX_DELIVERY_ATTEMPTS = 5;
const STUCK_AFTER_MS = 60 * 60_000;

export type Decision = { ok: true } | { ok: false; reason: string };

export function canRecheckSource(
  s: { enabled: boolean; needs_parser_maintenance: boolean; last_checked_at: string | null },
  now: Date = new Date(),
): Decision {
  if (!s.enabled) return { ok: false, reason: "This source is inactive. Turn it on first." };
  if (s.needs_parser_maintenance) {
    return { ok: false, reason: "This source is waiting for parser maintenance. Fix the parser, then clear the flag." };
  }
  if (s.last_checked_at && now.getTime() - Date.parse(s.last_checked_at) < MIN_RECHECK_INTERVAL_MS) {
    return { ok: false, reason: "This source was checked a moment ago. Please wait a few minutes before checking again." };
  }
  return { ok: true };
}

export interface UpdateForRetry { status: string; classification: string; detected_at: string }

/**
 * Only an update that ALREADY passed the automatic checks (classification
 * auto_publish) and is still pending (its publish step failed or was
 * interrupted) may be retried. Anything uncertain (needs_review) must go
 * through the human review queue, and rejected ones are never retried.
 */
export function canRetryPublish(u: UpdateForRetry): Decision {
  if (u.status !== "pending") return { ok: false, reason: "This update is no longer pending." };
  if (u.classification === "reject") return { ok: false, reason: "Rejected updates are never published." };
  if (u.classification !== "auto_publish") {
    return { ok: false, reason: "This update needs a human decision. Use the review queue instead." };
  }
  return { ok: true };
}

/** An auto-publish update still pending after an hour: its publish step failed. */
export function isStuckAutoPublish(u: UpdateForRetry, now: Date = new Date()): boolean {
  return u.status === "pending" && u.classification === "auto_publish" && now.getTime() - Date.parse(u.detected_at) > STUCK_AFTER_MS;
}

/** Failures where sending again cannot help (bad address, bounce, spam complaint). */
const PERMANENT_ERROR = /no email address|bounced|marked as spam|not implemented/i;

export function isRequeueableDelivery(d: { status: string; attempts: number; last_error: string | null }): boolean {
  if (d.status !== "failed") return false;
  if (d.attempts >= MAX_DELIVERY_ATTEMPTS) return false;
  if (d.last_error && PERMANENT_ERROR.test(d.last_error)) return false;
  return true;
}
