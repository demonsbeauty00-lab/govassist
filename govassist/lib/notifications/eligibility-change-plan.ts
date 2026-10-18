// Pure rules for ELIGIBILITY_CHANGED notifications (no I/O).
import { RESULT_CATEGORY_LABEL, type EligibilityCategory } from "@/lib/eligibility/types";
import type { ResultRow } from "@/lib/eligibility/plan";

export interface EligibilityChange { userId: string; cycleId: string; from: EligibilityCategory; to: EligibilityCategory; changedAt: string }

/**
 * A row represents a REAL change only when the engine just moved the category
 * (category_changed_at === evaluated_at) away from a previously stored one.
 * First-time evaluations (previous_category null) and explanation-only
 * rewrites are not changes, so nobody is notified for them.
 */
export function detectEligibilityChanges(rows: ResultRow[]): EligibilityChange[] {
  const out: EligibilityChange[] = [];
  for (const r of rows) {
    if (r.previous_category === null) continue;
    if (r.category_changed_at !== r.evaluated_at) continue;
    if (r.previous_category === r.category) continue;
    out.push({ userId: r.user_id, cycleId: r.exam_cycle_id, from: r.previous_category, to: r.category, changedAt: r.category_changed_at });
  }
  return out;
}

/** Same change at the same moment => same key; a later, different change => new key. */
export function eligibilityChangeKey(cycleId: string, to: EligibilityCategory, changedAt: string): string {
  return `eligibility:${cycleId}:${to}:${changedAt}`;
}

/** Deliberately cautious wording: a category is an indication from the
 *  published rules and the user's profile, never a guarantee. */
export function eligibilityChangeText(examName: string, to: EligibilityCategory): { title: string; body: string } {
  return {
    title: `${examName}: your eligibility status changed`,
    body: `Based on the exam's published rules and your profile, your status is now "${RESULT_CATEGORY_LABEL[to]}". This is an indication only, not a guarantee - please check the official notification before applying.`,
  };
}
