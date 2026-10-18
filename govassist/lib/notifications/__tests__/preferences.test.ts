import { describe, it, expect } from "vitest";
import { isCategoryEnabled, isEligibleAlertEnabled, isEmailChannelEnabled, isPreferenceKey, isTypeEnabled, PREFERENCE_KEYS, PREFERENCE_LABELS, resolvePreferences } from "../preferences";

describe("isTypeEnabled", () => {
  it("treats a missing key as enabled (legacy rows and new users default on)", () => {
    expect(isTypeEnabled({}, "admit_card")).toBe(true);
    expect(isTypeEnabled(null, "result")).toBe(true);
    expect(isTypeEnabled(undefined, "deadline")).toBe(true);
  });

  it("only an explicit false disables a type", () => {
    expect(isTypeEnabled({ admit_card: false }, "admit_card")).toBe(false);
    expect(isTypeEnabled({ admit_card: false }, "result")).toBe(true);
  });
});

describe("isEligibleAlertEnabled", () => {
  it("is OFF unless the user explicitly opted in", () => {
    expect(isEligibleAlertEnabled({})).toBe(false);
    expect(isEligibleAlertEnabled(null)).toBe(false);
    expect(isEligibleAlertEnabled({ eligible_alerts: false })).toBe(false);
    expect(isEligibleAlertEnabled({ eligible_alerts: true })).toBe(true);
  });
});

describe("resolvePreferences", () => {
  it("resolves every key to a concrete boolean with the documented defaults", () => {
    expect(resolvePreferences({})).toEqual({
      new_notification: true, deadline: true, exam_date: true, admit_card: true, answer_key: true, result: true,
      eligibility: true, application_requests: true, system: true, eligible_alerts: false, channel_email: false,
    });
  });

  it("reflects stored values", () => {
    expect(resolvePreferences({ deadline: false, eligible_alerts: true }).deadline).toBe(false);
    expect(resolvePreferences({ deadline: false, eligible_alerts: true }).eligible_alerts).toBe(true);
  });
});

describe("isPreferenceKey", () => {
  it("accepts only known keys — an arbitrary client-supplied key never passes", () => {
    expect(isPreferenceKey("deadline")).toBe(true);
    expect(isPreferenceKey("eligible_alerts")).toBe(true);
    expect(isPreferenceKey("is_admin")).toBe(false);
    expect(isPreferenceKey("__proto__")).toBe(false);
  });
});

describe("Phase 14 categories", () => {
  it("categories added later inherit the key that used to govern them", () => {
    // Someone who turned results off before answer_key existed keeps answer keys off.
    expect(isCategoryEnabled({ result: false }, "answer_key")).toBe(false);
    expect(isCategoryEnabled({ system: false }, "exam_date")).toBe(false);
    expect(isCategoryEnabled({ system: false }, "application_requests")).toBe(false);
    expect(isCategoryEnabled({ system: false }, "eligibility")).toBe(false);
    expect(isCategoryEnabled({ system: false }, "new_notification")).toBe(false);
  });

  it("an explicit value for the new key beats the inherited one", () => {
    expect(isCategoryEnabled({ result: false, answer_key: true }, "answer_key")).toBe(true);
    expect(isCategoryEnabled({ system: true, application_requests: false }, "application_requests")).toBe(false);
  });

  it("does not let an unrelated key switch a category off", () => {
    expect(isCategoryEnabled({ deadline: false }, "admit_card")).toBe(true);
  });

  it("ignores non-boolean stored values rather than treating them as off", () => {
    expect(isCategoryEnabled({ deadline: "no" } as never, "deadline")).toBe(true);
  });

  it("email is an explicit opt-in", () => {
    expect(isEmailChannelEnabled({})).toBe(false);
    expect(isEmailChannelEnabled(null)).toBe(false);
    expect(isEmailChannelEnabled({ channel_email: true })).toBe(true);
  });

  it("every preference key has a Settings label, and none is unknown to isPreferenceKey", () => {
    expect(PREFERENCE_LABELS.map((l) => l.key).sort()).toEqual([...PREFERENCE_KEYS].sort());
    for (const key of PREFERENCE_KEYS) expect(isPreferenceKey(key)).toBe(true);
  });

  it("isTypeEnabled still works for the legacy four types", () => {
    expect(isTypeEnabled({ result: false }, "result")).toBe(false);
    expect(isTypeEnabled({}, "system")).toBe(true);
  });
});
