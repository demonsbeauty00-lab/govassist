// ---------------------------------------------------------------------------
// The eligibility engine.
//
// Deliberately a pure function: given a profile and one exam cycle's rules,
// it returns a result. No network calls, no LLM, no randomness — the same
// inputs always produce the same output, and every check can be read and
// verified by a person, which is the whole point of an "explain why" engine.
// This file must never import anything OCR/LLM-related; see the Phase 1
// architecture note this project started from: extraction is what AI is
// for, eligibility decisions are not.
//
// Each check is independent and only runs when the exam cycle actually
// publishes that condition (a null field means "not applicable", not "pass"
// or "fail") — this is what lets a brand-new exam with a completely
// different combination of rules work correctly with zero changes to this
// file: you add data, not code.
// ---------------------------------------------------------------------------

import {
  ApplicantProfile,
  ApplicantQualification,
  EligibilityCheck,
  EligibilityRules,
  EligibilityResult,
  EligibilityCategory,
} from "./types";

function ageInYears(dobIso: string, asOfIso: string): number {
  const dob = new Date(dobIso);
  const asOf = new Date(asOfIso);
  let age = asOf.getFullYear() - dob.getFullYear();
  const monthDiff = asOf.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/** Parses a leading numeric value out of strings like "82.4%", "8.2 CGPA",
 *  "76.8". Returns null if nothing numeric can be found — never guesses. */
function parseLeadingNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}

function highestQualification(qualifications: ApplicantQualification[]): ApplicantQualification | null {
  // "Highest" by a simple, explicit rank rather than assuming array order
  // carries meaning — a profile could have rows inserted in any order.
  const rank: Record<string, number> = {
    "Below 10th": 0,
    "10th pass": 1,
    "12th pass": 2,
    Diploma: 3,
    Graduate: 4,
    "Post Graduate": 5,
  };
  return qualifications.reduce<ApplicantQualification | null>((best, q) => {
    const qRank = rank[q.qualificationLevel] ?? -1;
    const bestRank = best ? rank[best.qualificationLevel] ?? -1 : -1;
    return qRank > bestRank ? q : best;
  }, null);
}

function checkAge(profile: ApplicantProfile, rules: EligibilityRules): EligibilityCheck | null {
  if (rules.ageMin == null && rules.ageMax == null) return null; // not published

  if (!profile.dob) {
    return { label: "Age", status: "review", explanation: "Add your date of birth to your profile to check this." };
  }

  const asOf = rules.ageCutoffDate || rules.notificationDate;
  const age = ageInYears(profile.dob, asOf);

  const relaxation = profile.category ? rules.ageRelaxationByCategory[profile.category] ?? 0 : 0;
  const effectiveMax = rules.ageMax != null ? rules.ageMax + relaxation : null;

  if (rules.ageMin != null && age < rules.ageMin) {
    return {
      label: "Age",
      status: "fail",
      explanation: `You'd be ${age} as of the cutoff date — below the minimum of ${rules.ageMin}.`,
    };
  }
  if (effectiveMax != null && age > effectiveMax) {
    const relaxNote = relaxation > 0 ? ` (including your ${relaxation}-year category relaxation)` : "";
    return {
      label: "Age",
      status: "fail",
      explanation: `You'd be ${age} as of the cutoff date — above the maximum of ${effectiveMax}${relaxNote}.`,
    };
  }

  const rangeLabel = [rules.ageMin, rules.ageMax].filter((v) => v != null).join("–");
  return { label: "Age", status: "pass", explanation: `You'd be ${age} as of the cutoff date, within the ${rangeLabel} window.` };
}

function checkDegree(profile: ApplicantProfile, rules: EligibilityRules): EligibilityCheck | null {
  if (!rules.requiredDegree) return null;

  const highest = highestQualification(profile.qualifications);
  if (!highest) {
    return {
      label: "Qualification",
      status: "review",
      explanation: `This cycle requires ${rules.requiredDegree} — add your education details to check this.`,
    };
  }

  // A loose, explicit mapping rather than a fuzzy string match — "close
  // enough" string matching on qualification names is exactly the kind of
  // generic assumption the brief asks us not to make.
  const satisfiesDegree =
    rules.requiredDegree.toLowerCase().includes("10th") ? highest.qualificationLevel !== "Below 10th" :
    rules.requiredDegree.toLowerCase().includes("12th") ? ["12th pass", "Diploma", "Graduate", "Post Graduate"].includes(highest.qualificationLevel) :
    rules.requiredDegree.toLowerCase().includes("diploma") ? ["Diploma", "Graduate", "Post Graduate"].includes(highest.qualificationLevel) :
    rules.requiredDegree.toLowerCase().includes("post") ? highest.qualificationLevel === "Post Graduate" :
    ["Graduate", "Post Graduate"].includes(highest.qualificationLevel); // default: treat as a bachelor's-level requirement

  if (!satisfiesDegree) {
    return {
      label: "Qualification",
      status: "fail",
      explanation: `This cycle requires ${rules.requiredDegree} — your highest recorded qualification is ${highest.qualificationLevel}.`,
    };
  }
  return { label: "Qualification", status: "pass", explanation: `${rules.requiredDegree} requirement satisfied.` };
}

function checkSubject(profile: ApplicantProfile, rules: EligibilityRules): EligibilityCheck | null {
  if (!rules.requiredSubject || rules.requiredSubject.toLowerCase() === "any") return null;

  const highest = highestQualification(profile.qualifications);
  const subject = highest?.subject?.trim();
  if (!subject) {
    return {
      label: "Subject",
      status: "review",
      explanation: `This cycle requires a subject/stream of ${rules.requiredSubject} — add your subject to check this.`,
    };
  }

  const matches = subject.toLowerCase().includes(rules.requiredSubject.toLowerCase());
  if (!matches) {
    return {
      label: "Subject",
      status: "review", // a subject-name mismatch can still be equivalent under the notification's own definitions, so this is a review, not a hard fail
      explanation: `This cycle requires ${rules.requiredSubject} — your recorded subject is "${subject}". Check the official notification's exact subject list.`,
    };
  }
  return { label: "Subject", status: "pass", explanation: `Subject requirement (${rules.requiredSubject}) satisfied.` };
}

function checkPercentage(profile: ApplicantProfile, rules: EligibilityRules): EligibilityCheck | null {
  if (rules.minPercentage == null) return null;

  const highest = highestQualification(profile.qualifications);
  const value = parseLeadingNumber(highest?.percentageOrCgpa ?? null);
  if (value == null) {
    return {
      label: "Minimum percentage",
      status: "review",
      explanation: `This cycle requires at least ${rules.minPercentage}% — add your marks to check this.`,
    };
  }
  if (value < rules.minPercentage) {
    return {
      label: "Minimum percentage",
      status: "fail",
      explanation: `This cycle requires at least ${rules.minPercentage}% — your recorded marks are ${value}%.`,
    };
  }
  return { label: "Minimum percentage", status: "pass", explanation: `Meets the ${rules.minPercentage}% minimum.` };
}

function checkCategory(profile: ApplicantProfile, rules: EligibilityRules): EligibilityCheck | null {
  if (!rules.eligibleCategories || rules.eligibleCategories.length === 0) return null; // open to all — nothing to check

  if (!profile.category) {
    return { label: "Category", status: "review", explanation: "Add your category to your profile to check this." };
  }
  if (!rules.eligibleCategories.includes(profile.category)) {
    return {
      label: "Category",
      status: "fail",
      explanation: `This cycle is restricted to ${rules.eligibleCategories.join(", ")} — your recorded category is ${profile.category}.`,
    };
  }
  return { label: "Category", status: "pass", explanation: "Category requirement satisfied." };
}

function checkDomicile(profile: ApplicantProfile, rules: EligibilityRules): EligibilityCheck | null {
  if (!rules.domicileRequired || !rules.examState) return null;

  if (!profile.state) {
    return { label: "State / domicile", status: "review", explanation: `This cycle requires ${rules.examState} domicile — add your state to check this.` };
  }
  if (profile.state !== rules.examState) {
    return {
      label: "State / domicile",
      status: "fail",
      explanation: `This cycle requires ${rules.examState} domicile — your recorded state is ${profile.state}. Category-based exceptions may apply; check the official notification.`,
    };
  }
  return { label: "State / domicile", status: "pass", explanation: `${rules.examState} domicile requirement satisfied.` };
}

function checkGender(profile: ApplicantProfile, rules: EligibilityRules): EligibilityCheck | null {
  if (!rules.genderRequirement) return null;

  if (!profile.gender) {
    return { label: "Gender", status: "review", explanation: `This cycle is restricted to ${rules.genderRequirement} candidates — add your gender to check this.` };
  }
  if (profile.gender !== rules.genderRequirement) {
    return {
      label: "Gender",
      status: "fail",
      explanation: `This cycle is restricted to ${rules.genderRequirement} candidates.`,
    };
  }
  return { label: "Gender", status: "pass", explanation: "Gender requirement satisfied." };
}

/** Physical standards, prior experience, and any other published condition
 *  are never verifiable against profile data — they always surface as
 *  "needs review" when the cycle publishes one, rather than being silently
 *  skipped or wrongly marked as passed. */
function freeformReviewCheck(label: string, value: string | null): EligibilityCheck | null {
  if (!value) return null;
  return { label, status: "review", explanation: `${value} — verify against the official notification.` };
}

const DISCLAIMER: Record<EligibilityCategory, string> = {
  potentially_eligible:
    "Based on the information currently available, you appear to meet the listed eligibility criteria. Verify the official notification before applying.",
  needs_review:
    "Based on the information currently available, we couldn't fully confirm your eligibility for one or more criteria. Review the items below and verify the official notification before applying.",
  likely_not_eligible:
    "Based on the information currently available, you don't appear to meet one or more listed eligibility criteria. Rules, exceptions, and relaxations may apply that aren't reflected here — verify the official notification before deciding not to apply.",
};

export function evaluateEligibility(profile: ApplicantProfile, rules: EligibilityRules): EligibilityResult {
  const checks = [
    checkAge(profile, rules),
    checkDegree(profile, rules),
    checkSubject(profile, rules),
    checkPercentage(profile, rules),
    checkCategory(profile, rules),
    checkDomicile(profile, rules),
    checkGender(profile, rules),
    freeformReviewCheck("Physical standards", rules.physicalRequirements),
    freeformReviewCheck("Experience", rules.experienceRequirements),
    freeformReviewCheck("Other conditions", rules.otherConditions),
  ].filter((c): c is EligibilityCheck => c !== null);

  let category: EligibilityCategory;
  if (checks.some((c) => c.status === "fail")) {
    category = "likely_not_eligible";
  } else if (checks.length === 0 || checks.some((c) => c.status === "review")) {
    // No published rules at all is treated the same as "can't confirm" —
    // never defaults to "potentially eligible" just because nothing failed.
    category = "needs_review";
  } else {
    category = "potentially_eligible";
  }

  return { category, checks, disclaimer: DISCLAIMER[category] };
}
