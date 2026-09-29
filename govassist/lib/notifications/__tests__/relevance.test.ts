import { describe, it, expect } from "vitest";
import { decideRecipients, isDiscoveryUpdate, notificationTypeForUpdate, RecipientCandidate } from "../relevance";

function candidate(overrides: Partial<RecipientCandidate> = {}): RecipientCandidate {
  return {
    userId: "u1",
    preferences: {},
    preferredCategories: [],
    applied: false,
    saved: false,
    potentiallyEligible: false,
    ...overrides,
  };
}

describe("notificationTypeForUpdate", () => {
  it("maps application/deadline updates to the deadline preference", () => {
    expect(notificationTypeForUpdate("application_start_date")).toBe("deadline");
    expect(notificationTypeForUpdate("application_end_date_change")).toBe("deadline");
  });
  it("maps admit cards, and answer keys/results/cutoffs to their own preferences", () => {
    expect(notificationTypeForUpdate("admit_card")).toBe("admit_card");
    expect(notificationTypeForUpdate("answer_key")).toBe("result");
    expect(notificationTypeForUpdate("result")).toBe("result");
    expect(notificationTypeForUpdate("cutoff")).toBe("result");
  });
  it("maps everything else to system", () => {
    expect(notificationTypeForUpdate("new_notification")).toBe("system");
    expect(notificationTypeForUpdate("corrigendum")).toBe("system");
    expect(notificationTypeForUpdate("exam_date")).toBe("system");
  });
});

describe("isDiscoveryUpdate", () => {
  it("is true only for a new notification or applications opening", () => {
    expect(isDiscoveryUpdate("new_notification")).toBe(true);
    expect(isDiscoveryUpdate("application_start_date")).toBe(true);
    expect(isDiscoveryUpdate("corrigendum")).toBe(false);
    expect(isDiscoveryUpdate("answer_key")).toBe(false);
    expect(isDiscoveryUpdate("result")).toBe(false);
  });
});

describe("decideRecipients", () => {
  it("notifies a user who saved the exam, for any update type", () => {
    const r = decideRecipients({ updateType: "corrigendum", examCategory: "SSC", candidates: [candidate({ saved: true })] });
    expect(r).toEqual([{ userId: "u1", reason: "saved" }]);
  });

  it("notifies a user who recorded an application, and prefers that reason over saved", () => {
    const r = decideRecipients({ updateType: "admit_card", examCategory: "SSC", candidates: [candidate({ saved: true, applied: true })] });
    expect(r).toEqual([{ userId: "u1", reason: "applied" }]);
  });

  it("never notifies someone with no relationship to the exam and no opt-in", () => {
    const r = decideRecipients({ updateType: "new_notification", examCategory: "SSC", candidates: [candidate({ potentiallyEligible: true })] });
    expect(r).toEqual([]);
  });

  it("notifies an opted-in, potentially eligible user about a DISCOVERY update", () => {
    const r = decideRecipients({
      updateType: "new_notification",
      examCategory: "SSC",
      candidates: [candidate({ potentiallyEligible: true, preferences: { eligible_alerts: true } })],
    });
    expect(r).toEqual([{ userId: "u1", reason: "eligible" }]);
  });

  it("does NOT ping an eligible-but-unsaved user about a non-discovery update", () => {
    for (const updateType of ["corrigendum", "answer_key", "result", "admit_card", "application_end_date_change", "exam_date"] as const) {
      const r = decideRecipients({
        updateType,
        examCategory: "SSC",
        candidates: [candidate({ potentiallyEligible: true, preferences: { eligible_alerts: true } })],
      });
      expect(r).toEqual([]);
    }
  });

  it("requires potentially_eligible — a user who isn't eligible gets nothing even if opted in", () => {
    const r = decideRecipients({
      updateType: "new_notification",
      examCategory: "SSC",
      candidates: [candidate({ potentiallyEligible: false, preferences: { eligible_alerts: true } })],
    });
    expect(r).toEqual([]);
  });

  it("respects preferred categories: a mismatch is excluded, a match or an empty list is included", () => {
    const base = { potentiallyEligible: true, preferences: { eligible_alerts: true } };
    const mismatch = decideRecipients({ updateType: "new_notification", examCategory: "SSC", candidates: [candidate({ ...base, preferredCategories: ["Banking"] })] });
    const match = decideRecipients({ updateType: "new_notification", examCategory: "SSC", candidates: [candidate({ ...base, preferredCategories: ["SSC", "Banking"] })] });
    const none = decideRecipients({ updateType: "new_notification", examCategory: "SSC", candidates: [candidate({ ...base, preferredCategories: [] })] });
    expect(mismatch).toEqual([]);
    expect(match).toHaveLength(1);
    expect(none).toHaveLength(1);
  });

  it("with unknown exam category, a user who set preferred categories is not matched by guesswork", () => {
    const r = decideRecipients({
      updateType: "new_notification",
      examCategory: null,
      candidates: [candidate({ potentiallyEligible: true, preferences: { eligible_alerts: true }, preferredCategories: ["SSC"] })],
    });
    expect(r).toEqual([]);
  });

  it("honors per-type preferences even for saved and applied users", () => {
    const saved = decideRecipients({ updateType: "admit_card", examCategory: "SSC", candidates: [candidate({ saved: true, preferences: { admit_card: false } })] });
    const applied = decideRecipients({ updateType: "application_end_date_change", examCategory: "SSC", candidates: [candidate({ applied: true, preferences: { deadline: false } })] });
    expect(saved).toEqual([]);
    expect(applied).toEqual([]);
  });

  it("turning off one type does not silence the others", () => {
    const r = decideRecipients({ updateType: "result", examCategory: "SSC", candidates: [candidate({ saved: true, preferences: { admit_card: false } })] });
    expect(r).toHaveLength(1);
  });

  it("never returns the same user twice", () => {
    const r = decideRecipients({ updateType: "admit_card", examCategory: "SSC", candidates: [candidate({ saved: true }), candidate({ applied: true })] });
    expect(r).toHaveLength(1);
  });

  it("handles a mixed audience and returns only the relevant users", () => {
    const r = decideRecipients({
      updateType: "application_start_date",
      examCategory: "SSC",
      candidates: [
        candidate({ userId: "saved", saved: true }),
        candidate({ userId: "eligible-optin", potentiallyEligible: true, preferences: { eligible_alerts: true } }),
        candidate({ userId: "eligible-no-optin", potentiallyEligible: true }),
        candidate({ userId: "stranger" }),
      ],
    });
    expect(r.map((x) => x.userId).sort()).toEqual(["eligible-optin", "saved"]);
  });
});
