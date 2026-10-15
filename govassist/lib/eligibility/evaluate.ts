import { DISCLAIMER, evaluateEligibility } from "./engine";
import type { ApplicantProfile, EligibilityCategory, EligibilityCheck, EligibilityResult, EligibilityRules } from "./types";

// ---------------------------------------------------------------------------
// Phase 12 wrapper around the (unchanged) pure engine for REAL exam cycles.
//
// The engine decides every individual check. This layer only adds two honest
// "we can't be sure" conditions the engine cannot see on its own, and never
// invents a pass or a fail:
//
//  1. Incomplete official rules — a core condition (age limits or the
//     educational qualification) isn't published in the cycle row. We do not
//     guess what it would be, so the result can't be "Potentially Eligible".
//  2. Pending corrigendum — an official corrigendum was published AFTER the
//     rules were last verified, so the stored rules may be out of date. Even
//     a failed check is then not "clear" (the corrigendum may have changed
//     it), so the result is Needs Review until the rules are re-verified.
//
// A published rule that clearly fails, on rules with no pending corrigendum,
// stays "Likely Not Eligible" even if other rules are incomplete.
// ---------------------------------------------------------------------------

export interface CycleContext {
  corrigendumPending: boolean;
}

export interface CycleEvaluation extends EligibilityResult {
  /** Names of core official rules the cycle doesn't publish yet. */
  incompleteParts: string[];
}

/** Which core official rules are not published. Null fields are treated as
 *  "not published" here (not as "no restriction"), because an exam with no
 *  age limit AND no qualification at all is far more likely to be an
 *  unfinished record than a real rule. */
export function incompleteRuleParts(rules: EligibilityRules): string[] {
  const missing: string[] = [];
  if (rules.ageMin == null && rules.ageMax == null) missing.push("age limits");
  if (!rules.requiredDegree) missing.push("educational qualification");
  return missing;
}

export function evaluateCycleEligibility(
  profile: ApplicantProfile,
  rules: EligibilityRules,
  ctx: CycleContext = { corrigendumPending: false },
): CycleEvaluation {
  const base = evaluateEligibility(profile, rules);
  const incompleteParts = incompleteRuleParts(rules);
  const checks: EligibilityCheck[] = [...base.checks];

  if (incompleteParts.length > 0) {
    checks.push({
      label: "Official rules incomplete",
      status: "review",
      reason: "incomplete_rules",
      explanation: `The published rules don't include the ${incompleteParts.join(" or ")} yet, so we can't confirm eligibility. Check the official notification.`,
    });
  }
  if (ctx.corrigendumPending) {
    checks.push({
      label: "Corrigendum under review",
      status: "review",
      reason: "pending_corrigendum",
      explanation: "An official corrigendum was published after these rules were last verified, so they may have changed. Check the latest official notice.",
    });
  }

  let category: EligibilityCategory;
  if (ctx.corrigendumPending) category = "needs_review";
  else if (base.category === "likely_not_eligible") category = "likely_not_eligible";
  else if (incompleteParts.length > 0 || base.category === "needs_review") category = "needs_review";
  else category = "potentially_eligible";

  return { category, checks, disclaimer: DISCLAIMER[category], incompleteParts };
}
