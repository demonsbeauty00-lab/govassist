import type { EligibilityCheck } from "./types";

export interface CheckGroups {
  passed: EligibilityCheck[];
  failed: EligibilityCheck[];
  /** Something is missing: from the applicant (profile) or from the official rules. */
  missing: EligibilityCheck[];
  /** Conditions a person must verify against the official notification. */
  manualReview: EligibilityCheck[];
}

/** Splits an engine result into the four groups shown to the user. A review
 *  check with no stated reason is treated as manual review (the safe reading). */
export function groupChecks(checks: EligibilityCheck[]): CheckGroups {
  const groups: CheckGroups = { passed: [], failed: [], missing: [], manualReview: [] };
  for (const c of checks) {
    if (c.status === "pass") groups.passed.push(c);
    else if (c.status === "fail") groups.failed.push(c);
    else if (c.reason === "missing_info" || c.reason === "incomplete_rules") groups.missing.push(c);
    else groups.manualReview.push(c);
  }
  return groups;
}
