import { describe, it, expect } from "vitest";
import { evaluateEligibility } from "../engine";
import { PROFILE, RULES } from "./fixtures";

describe("evaluateEligibility (unchanged pure engine)", () => {
  it("is Potentially Eligible when every published rule passes", () => {
    const r = evaluateEligibility(PROFILE, RULES);
    expect(r.category).toBe("potentially_eligible");
    expect(r.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("is deterministic", () => {
    expect(evaluateEligibility(PROFILE, RULES)).toEqual(evaluateEligibility(PROFILE, RULES));
  });

  it("a clearly failed published rule is Likely Not Eligible", () => {
    const r = evaluateEligibility({ ...PROFILE, dob: "1990-01-01" }, RULES);
    expect(r.category).toBe("likely_not_eligible");
    expect(r.checks.find((c) => c.label === "Age")?.status).toBe("fail");
  });

  it("applies the published category age relaxation", () => {
    const p = { ...PROFILE, dob: "1996-01-01" }; // 30 on the cutoff date
    expect(evaluateEligibility({ ...p, category: "General" }, RULES).category).toBe("likely_not_eligible");
    expect(evaluateEligibility({ ...p, category: "OBC" }, RULES).category).toBe("potentially_eligible");
  });

  it("missing profile data is Needs Review with reason missing_info, never a pass", () => {
    const r = evaluateEligibility({ ...PROFILE, dob: null }, RULES);
    expect(r.category).toBe("needs_review");
    expect(r.checks.find((c) => c.label === "Age")).toMatchObject({ status: "review", reason: "missing_info" });
    const noEdu = evaluateEligibility({ ...PROFILE, qualifications: [] }, RULES);
    expect(noEdu.category).toBe("needs_review");
    expect(noEdu.checks.find((c) => c.label === "Qualification")?.reason).toBe("missing_info");
  });

  it("unverifiable published conditions are manual review", () => {
    const r = evaluateEligibility(PROFILE, { ...RULES, physicalRequirements: "Height 165 cm" });
    expect(r.category).toBe("needs_review");
    expect(r.checks.find((c) => c.label === "Physical standards")).toMatchObject({ status: "review", reason: "manual_review" });
  });

  it("a subject-name mismatch is review (equivalence may apply), not a fail", () => {
    const r = evaluateEligibility(PROFILE, { ...RULES, requiredSubject: "Commerce" });
    const c = r.checks.find((x) => x.label === "Subject");
    expect(c).toMatchObject({ status: "review", reason: "manual_review" });
    expect(r.category).toBe("needs_review");
  });

  it("a failed check wins over review checks", () => {
    const r = evaluateEligibility({ ...PROFILE, dob: "1990-01-01", gender: null }, { ...RULES, genderRequirement: "Female" });
    expect(r.category).toBe("likely_not_eligible");
  });

  it("no published rules at all is Needs Review, never eligible", () => {
    const r = evaluateEligibility(PROFILE, { ...RULES, ageMin: null, ageMax: null, requiredDegree: null });
    expect(r.category).toBe("needs_review");
    expect(r.checks).toHaveLength(0);
  });
});
