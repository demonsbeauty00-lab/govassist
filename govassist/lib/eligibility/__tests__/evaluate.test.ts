import { describe, it, expect } from "vitest";
import { evaluateCycleEligibility, incompleteRuleParts } from "../evaluate";
import { groupChecks } from "../explain";
import { profileFingerprint, rulesFingerprint } from "../fingerprint";
import { buildCycleInput, isCorrigendumPending, planResultRow, type ExistingResult } from "../plan";
import { NO_RULES, PROFILE, RULES } from "./fixtures";

const OK = { corrigendumPending: false };

describe("evaluateCycleEligibility — incomplete official rules", () => {
  it("lists which core rules are unpublished (never guesses them)", () => {
    expect(incompleteRuleParts(RULES)).toEqual([]);
    expect(incompleteRuleParts({ ...RULES, ageMin: null, ageMax: null })).toEqual(["age limits"]);
    expect(incompleteRuleParts(NO_RULES)).toEqual(["age limits", "educational qualification"]);
  });
  it("downgrades a would-be 'eligible' to Needs Review when the rules are incomplete", () => {
    const rules = { ...RULES, requiredDegree: null }; // age published and passes, qualification unpublished
    const r = evaluateCycleEligibility(PROFILE, rules, OK);
    expect(r.category).toBe("needs_review");
    expect(r.checks.find((c) => c.reason === "incomplete_rules")?.explanation).toMatch(/educational qualification/);
  });
  it("a cycle with no usable rules is Needs Review", () => {
    expect(evaluateCycleEligibility(PROFILE, NO_RULES, OK).category).toBe("needs_review");
  });
  it("a clearly failed published rule stays Likely Not Eligible even if other rules are incomplete", () => {
    const r = evaluateCycleEligibility({ ...PROFILE, dob: "1990-01-01" }, { ...RULES, requiredDegree: null }, OK);
    expect(r.category).toBe("likely_not_eligible");
  });
  it("complete rules + all checks passing is still only 'Potentially' eligible", () => {
    const r = evaluateCycleEligibility(PROFILE, RULES, OK);
    expect(r.category).toBe("potentially_eligible");
    expect(r.disclaimer).toMatch(/appear to meet/);
  });
});

describe("evaluateCycleEligibility — corrigendum", () => {
  it("a pending corrigendum forces Needs Review, even over a fail", () => {
    const pass = evaluateCycleEligibility(PROFILE, RULES, { corrigendumPending: true });
    expect(pass.category).toBe("needs_review");
    expect(pass.checks.some((c) => c.reason === "pending_corrigendum")).toBe(true);
    const fail = evaluateCycleEligibility({ ...PROFILE, dob: "1990-01-01" }, RULES, { corrigendumPending: true });
    expect(fail.category).toBe("needs_review");
    expect(fail.checks.find((c) => c.label === "Age")?.status).toBe("fail"); // the failure is still shown
  });
  it("is pending only when a corrigendum was processed after the last verification date", () => {
    expect(isCorrigendumPending("2026-09-01", ["2026-09-05T10:00:00Z"])).toBe(true);
    expect(isCorrigendumPending("2026-09-05", ["2026-09-05T10:00:00Z"])).toBe(false); // re-verified same day
    expect(isCorrigendumPending("2026-09-10", ["2026-09-05T10:00:00Z"])).toBe(false);
    expect(isCorrigendumPending("2026-09-01", [])).toBe(false);
    expect(isCorrigendumPending("2026-09-01", [null])).toBe(false);
  });
});

describe("explanation groups", () => {
  it("splits passed / failed / missing information / manual review", () => {
    const r = evaluateCycleEligibility(
      { ...PROFILE, dob: null, category: null },
      { ...RULES, eligibleCategories: ["OBC"], physicalRequirements: "Height 165 cm", requiredDegree: null },
      OK,
    );
    const g = groupChecks(r.checks);
    expect(g.missing.map((c) => c.label)).toEqual(expect.arrayContaining(["Age", "Category", "Official rules incomplete"]));
    expect(g.manualReview.map((c) => c.label)).toContain("Physical standards");
    const f = groupChecks(evaluateCycleEligibility({ ...PROFILE, dob: "1990-01-01" }, RULES, OK).checks);
    expect(f.failed.map((c) => c.label)).toContain("Age");
    expect(f.passed.map((c) => c.label)).toContain("Qualification");
  });
  it("never claims guaranteed eligibility in any wording", () => {
    const outputs = [
      evaluateCycleEligibility(PROFILE, RULES, OK),
      evaluateCycleEligibility(PROFILE, NO_RULES, OK),
      evaluateCycleEligibility({ ...PROFILE, dob: "1990-01-01" }, RULES, OK),
    ];
    for (const o of outputs) {
      const text = [o.disclaimer, ...o.checks.map((c) => c.explanation)].join(" ");
      expect(text).not.toMatch(/guarantee|you are eligible|definitely eligible|you will be selected/i);
    }
  });
});

describe("fingerprints and result planning", () => {
  const cycle = buildCycleInput("c1", RULES, OK);
  const NOW = new Date("2026-10-15T00:00:00Z");

  it("fingerprints are stable and change only when the inputs change", () => {
    expect(rulesFingerprint(RULES, false)).toBe(rulesFingerprint({ ...RULES }, false));
    expect(rulesFingerprint(RULES, false)).not.toBe(rulesFingerprint({ ...RULES, ageMax: 30 }, false));
    expect(rulesFingerprint(RULES, false)).not.toBe(rulesFingerprint(RULES, true));
    expect(profileFingerprint(PROFILE)).toBe(profileFingerprint({ ...PROFILE }));
    expect(profileFingerprint(PROFILE)).not.toBe(profileFingerprint({ ...PROFILE, category: "OBC" }));
  });

  it("a new cycle (no stored result) produces a row classified by the engine", () => {
    const row = planResultRow({ userId: "u1", profile: PROFILE, cycle, existing: undefined, now: NOW });
    expect(row).toMatchObject({ user_id: "u1", exam_cycle_id: "c1", category: "potentially_eligible", previous_category: null });
  });

  it("returns null (no write) when neither profile nor rules changed", () => {
    const first = planResultRow({ userId: "u1", profile: PROFILE, cycle, existing: undefined, now: NOW })!;
    expect(planResultRow({ userId: "u1", profile: PROFILE, cycle, existing: first as ExistingResult, now: NOW })).toBeNull();
  });

  it("a profile change re-evaluates and records the category change", () => {
    const first = planResultRow({ userId: "u1", profile: PROFILE, cycle, existing: undefined, now: NOW })! as ExistingResult;
    const older = { ...PROFILE, dob: "1990-01-01" };
    const next = planResultRow({ userId: "u1", profile: older, cycle, existing: first, now: new Date("2026-10-16T00:00:00Z") })!;
    expect(next.category).toBe("likely_not_eligible");
    expect(next.previous_category).toBe("potentially_eligible");
    expect(next.category_changed_at).toBe("2026-10-16T00:00:00.000Z");
  });

  it("a rules change that doesn't alter the category keeps the change markers", () => {
    const first = planResultRow({ userId: "u1", profile: PROFILE, cycle, existing: undefined, now: NOW })! as ExistingResult;
    const loosened = buildCycleInput("c1", { ...RULES, ageMax: 35 }, OK);
    const next = planResultRow({ userId: "u1", profile: PROFILE, cycle: loosened, existing: first, now: new Date("2026-10-20T00:00:00Z") })!;
    expect(next.category).toBe("potentially_eligible");
    expect(next.category_changed_at).toBe(first.category_changed_at);
    expect(next.rules_fingerprint).toBe(loosened.fingerprint);
  });
});
