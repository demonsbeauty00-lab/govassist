import { describe, it, expect } from "vitest";
import { isAuthorizedCron, selectSourcesForRun, withinBudget } from "../cron";

describe("isAuthorizedCron", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedCron("Bearer s3cret ", "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer other!", "s3cret")).toBe(false);
    expect(isAuthorizedCron("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
  });
});

describe("selectSourcesForRun", () => {
  const mk = (id: string, at: string | null) => ({ id, last_checked_at: at });
  it("checks never-checked sources first, then the stalest, and defers the rest", () => {
    const due = [mk("new", "2027-03-02T00:00:00Z"), mk("never", null), mk("old", "2027-03-01T00:00:00Z")];
    const { selected, deferred } = selectSourcesForRun(due, 2);
    expect(selected.map((s) => s.id)).toEqual(["never", "old"]);
    expect(deferred).toBe(1);
  });
  it("does not mutate its input and handles zero", () => {
    const due = [mk("a", null)];
    expect(selectSourcesForRun(due, 0)).toEqual({ selected: [], deferred: 1 });
    expect(due).toHaveLength(1);
  });
});

describe("withinBudget", () => {
  it("stops starting work once the budget is spent", () => {
    expect(withinBudget(0, 10_000, 35_000)).toBe(true);
    expect(withinBudget(0, 35_000, 35_000)).toBe(false);
  });
});
