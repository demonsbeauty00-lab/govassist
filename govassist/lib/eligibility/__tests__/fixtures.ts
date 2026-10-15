import type { ApplicantProfile, EligibilityRules } from "../types";

export const RULES: EligibilityRules = {
  ageMin: 18, ageMax: 27, ageCutoffDate: "2026-08-01", ageRelaxationByCategory: { OBC: 3, SC: 5 },
  requiredDegree: "Bachelor's Degree", requiredSubject: null, minPercentage: null, eligibleCategories: null,
  domicileRequired: false, examState: null, genderRequirement: null, physicalRequirements: null,
  experienceRequirements: null, otherConditions: null, notificationDate: "2026-06-01",
};

export const PROFILE: ApplicantProfile = {
  dob: "2000-01-01", gender: "Male", category: "General", state: "Bihar", isPwbd: false,
  qualifications: [{ qualificationLevel: "Graduate", subject: "Science", percentageOrCgpa: "70%" }],
};

export const NO_RULES: EligibilityRules = {
  ...RULES, ageMin: null, ageMax: null, requiredDegree: null,
};
