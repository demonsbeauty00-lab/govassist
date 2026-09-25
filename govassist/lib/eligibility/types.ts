// ---------------------------------------------------------------------------
// Domain types for the eligibility engine. Deliberately independent of both
// lib/mock-data.ts's frontend ExamCycle shape and the Supabase exam_cycles
// Row type — the engine only ever knows about EligibilityRules and
// ApplicantProfile. Any data source (today's mock data, tomorrow's real
// exam_cycles table) just needs a small mapper into this shape (see
// lib/eligibility/from-exam-cycle.ts and from-db-row.ts). That's what makes
// the engine modular: adding a new exam, or a new *source* of exams, never
// touches engine.ts or any UI component.
// ---------------------------------------------------------------------------

export interface EligibilityRules {
  ageMin: number | null;
  ageMax: number | null;
  /** The date age is computed as of, per the official notification — not
   *  "today". Falls back to notificationDate when not separately published. */
  ageCutoffDate: string;
  /** Years added to ageMax for a given category (e.g. { OBC: 3, SC: 5 }). */
  ageRelaxationByCategory: Record<string, number>;
  /** e.g. "Bachelor's Degree", "10th Pass". Null = this cycle doesn't restrict by degree. */
  requiredDegree: string | null;
  /** A specific subject/stream requirement. Null or "Any" = unrestricted. */
  requiredSubject: string | null;
  minPercentage: number | null;
  /** Null = open to all categories (the common case) — a restriction list is
   *  the exception, not the default, so this is never fabricated. */
  eligibleCategories: string[] | null;
  domicileRequired: boolean;
  /** The exam's own state, to compare against the applicant's — null for
   *  all-India exams. */
  examState: string | null;
  genderRequirement: "Male" | "Female" | "Other" | null;
  physicalRequirements: string | null;
  experienceRequirements: string | null;
  otherConditions: string | null;
  /** Fallback reference date when ageCutoffDate isn't more specifically known. */
  notificationDate: string;
}

export interface ApplicantQualification {
  qualificationLevel: string;
  subject: string | null;
  percentageOrCgpa: string | null;
}

export interface ApplicantProfile {
  dob: string | null;
  gender: string | null;
  category: string | null;
  state: string | null;
  isPwbd: boolean;
  qualifications: ApplicantQualification[];
}

export type CheckStatus = "pass" | "fail" | "review";

export interface EligibilityCheck {
  label: string;
  status: CheckStatus;
  explanation: string;
}

export type EligibilityCategory = "potentially_eligible" | "needs_review" | "likely_not_eligible";

export interface EligibilityResult {
  category: EligibilityCategory;
  checks: EligibilityCheck[];
  disclaimer: string;
}

export const RESULT_CATEGORY_LABEL: Record<EligibilityCategory, string> = {
  potentially_eligible: "Potentially Eligible",
  needs_review: "Eligibility Needs Review",
  likely_not_eligible: "Likely Not Eligible",
};