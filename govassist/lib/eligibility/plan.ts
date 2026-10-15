import { evaluateCycleEligibility, type CycleContext } from "./evaluate";
import { profileFingerprint, rulesFingerprint } from "./fingerprint";
import type { ApplicantProfile, EligibilityCategory, EligibilityCheck, EligibilityRules } from "./types";

// Pure planning helpers for the re-evaluation job (no I/O), so the "what
// should be written" decisions can be unit tested.

/** A corrigendum is "pending" when one was published (processed) on a later
 *  date than the day the cycle's rules were last verified by a person.
 *  Re-verifying the rules on or after that day clears it. Dates are compared
 *  as YYYY-MM-DD strings. */
export function isCorrigendumPending(lastVerifiedDate: string, corrigendumProcessedAt: (string | null)[]): boolean {
  return corrigendumProcessedAt.some((at) => !!at && at.slice(0, 10) > lastVerifiedDate.slice(0, 10));
}

export interface CycleInput {
  id: string;
  rules: EligibilityRules;
  corrigendumPending: boolean;
  fingerprint: string;
}

export function buildCycleInput(id: string, rules: EligibilityRules, ctx: CycleContext): CycleInput {
  return { id, rules, corrigendumPending: ctx.corrigendumPending, fingerprint: rulesFingerprint(rules, ctx.corrigendumPending) };
}

export interface ExistingResult {
  exam_cycle_id: string;
  category: EligibilityCategory;
  rules_fingerprint: string;
  profile_fingerprint: string;
  previous_category: EligibilityCategory | null;
  category_changed_at: string;
}

export interface ResultRow {
  user_id: string;
  exam_cycle_id: string;
  category: EligibilityCategory;
  checks: EligibilityCheck[];
  rules_fingerprint: string;
  profile_fingerprint: string;
  previous_category: EligibilityCategory | null;
  category_changed_at: string;
  evaluated_at: string;
}

/** Evaluates one user against one cycle and decides whether a row needs
 *  writing. Returns null when neither the profile nor the rules changed since
 *  the stored result (nothing to do). When the category changes, the old one
 *  is kept as previous_category and category_changed_at moves to now; when
 *  only the explanation changed, the change markers are kept. */
export function planResultRow(args: {
  userId: string;
  profile: ApplicantProfile;
  profileFp?: string;
  cycle: CycleInput;
  existing: ExistingResult | undefined;
  now?: Date;
}): ResultRow | null {
  const profileFp = args.profileFp ?? profileFingerprint(args.profile);
  const { existing, cycle } = args;
  if (existing && existing.rules_fingerprint === cycle.fingerprint && existing.profile_fingerprint === profileFp) return null;

  const result = evaluateCycleEligibility(args.profile, cycle.rules, { corrigendumPending: cycle.corrigendumPending });
  const nowIso = (args.now ?? new Date()).toISOString();
  const changed = !existing || existing.category !== result.category;
  return {
    user_id: args.userId,
    exam_cycle_id: cycle.id,
    category: result.category,
    checks: result.checks,
    rules_fingerprint: cycle.fingerprint,
    profile_fingerprint: profileFp,
    previous_category: changed ? existing?.category ?? null : existing?.previous_category ?? null,
    category_changed_at: changed ? nowIso : existing!.category_changed_at,
    evaluated_at: nowIso,
  };
}
