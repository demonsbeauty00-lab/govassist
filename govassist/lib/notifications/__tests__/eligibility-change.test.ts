import { describe, it, expect } from "vitest";
import { detectEligibilityChanges, eligibilityChangeKey, eligibilityChangeText } from "../eligibility-change-plan";
import type { ResultRow } from "@/lib/eligibility/plan";

const NOW = "2026-10-01T00:00:00.000Z";
const row = (over: Partial<ResultRow>): ResultRow => ({
  user_id: "u1", exam_cycle_id: "c1", category: "potentially_eligible", checks: [], rules_fingerprint: "r", profile_fingerprint: "p",
  previous_category: null, category_changed_at: NOW, evaluated_at: NOW, ...over,
});

describe("detectEligibilityChanges", () => {
  it("ignores first-time evaluations", () => {
    expect(detectEligibilityChanges([row({ previous_category: null })])).toHaveLength(0);
  });
  it("detects a real category change", () => {
    const out = detectEligibilityChanges([row({ previous_category: "likely_not_eligible", category: "potentially_eligible" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ userId: "u1", cycleId: "c1", from: "likely_not_eligible", to: "potentially_eligible" });
  });
  it("ignores an explanation-only rewrite (change markers kept from an earlier change)", () => {
    expect(detectEligibilityChanges([row({ previous_category: "needs_review", category_changed_at: "2026-09-01T00:00:00.000Z" })])).toHaveLength(0);
  });
  it("same change at the same moment gets the same key; a later change a new one", () => {
    expect(eligibilityChangeKey("c1", "needs_review", NOW)).toBe(eligibilityChangeKey("c1", "needs_review", NOW));
    expect(eligibilityChangeKey("c1", "needs_review", NOW)).not.toBe(eligibilityChangeKey("c1", "needs_review", "2026-11-01T00:00:00.000Z"));
  });
  it("wording never guarantees eligibility", () => {
    const t = eligibilityChangeText("SSC CGL", "potentially_eligible");
    expect(`${t.title} ${t.body}`).toMatch(/not a guarantee/i);
    expect(`${t.title} ${t.body}`).not.toMatch(/you are eligible|guaranteed eligible/i);
  });
});
