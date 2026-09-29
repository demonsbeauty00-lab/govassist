import { describe, it, expect } from "vitest";
import { isEligibleAlertEnabled, isPreferenceKey, isTypeEnabled, resolvePreferences } from "../preferences";

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
    expect(resolvePreferences({})).toEqual({ deadline: true, admit_card: true, result: true, system: true, eligible_alerts: false });
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
