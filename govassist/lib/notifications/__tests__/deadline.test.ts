import { describe, it, expect } from "vitest";
import {
  deadlineInstant, deadlineReminderKey, isObsoleteReminderKey, isValidDateOnly, istDaysLeft, istToday,
  planDeadlineReminder, reminderText,
} from "../deadline";

// 2026-11-10 is the deadline day in most tests. IST = UTC+5:30.
const at = (iso: string) => new Date(iso);

describe("IST handling", () => {
  it("uses the IST calendar date, not UTC", () => {
    // 20:00 UTC on 9 Nov is already 01:30 IST on 10 Nov.
    expect(istToday(at("2026-11-09T20:00:00Z"))).toBe("2026-11-10");
    expect(istToday(at("2026-11-09T18:00:00Z"))).toBe("2026-11-09");
  });
  it("counts IST calendar days", () => {
    expect(istDaysLeft("2026-11-10", at("2026-11-03T05:00:00Z"))).toBe(7);
    expect(istDaysLeft("2026-11-10", at("2026-11-10T01:00:00Z"))).toBe(0);
  });
  it("deadline instant is the end of the deadline day in IST", () => {
    expect(deadlineInstant("2026-11-10").toISOString()).toBe("2026-11-10T18:29:59.000Z");
  });
});

describe("planDeadlineReminder", () => {
  const D = "2026-11-10";
  it("no reminder when more than 7 days away", () => {
    expect(planDeadlineReminder({ deadlineDate: D, now: at("2026-11-01T05:00:00Z") })).toBeNull();
  });
  it("7, 3 and 1 day thresholds", () => {
    expect(planDeadlineReminder({ deadlineDate: D, now: at("2026-11-03T05:00:00Z") })?.threshold).toBe(7);
    expect(planDeadlineReminder({ deadlineDate: D, now: at("2026-11-07T05:00:00Z") })?.threshold).toBe(3);
    expect(planDeadlineReminder({ deadlineDate: D, now: at("2026-11-09T05:00:00Z") })?.threshold).toBe(1);
  });
  it("sends only the smallest reached threshold (never 7+3+1 together)", () => {
    expect(planDeadlineReminder({ deadlineDate: D, now: at("2026-11-05T05:00:00Z") })?.threshold).toBe(7); // 5 days left
    expect(planDeadlineReminder({ deadlineDate: D, now: at("2026-11-08T05:00:00Z") })?.threshold).toBe(3); // 2 days left
  });
  it("still reminds on the deadline day itself, until the deadline passes", () => {
    const plan = planDeadlineReminder({ deadlineDate: D, now: at("2026-11-10T10:00:00Z") });
    expect(plan?.threshold).toBe(1);
    expect(plan?.daysLeft).toBe(0);
  });
  it("nothing after the deadline has passed (IST end of day)", () => {
    expect(planDeadlineReminder({ deadlineDate: D, now: at("2026-11-10T18:30:00Z") })).toBeNull();
    expect(planDeadlineReminder({ deadlineDate: D, now: at("2026-11-12T05:00:00Z") })).toBeNull();
  });
  it("nothing for a missing, malformed or impossible deadline", () => {
    for (const bad of [null, undefined, "", "10/11/2026", "2026-13-40", "2026-02-30"]) {
      expect(planDeadlineReminder({ deadlineDate: bad, now: at("2026-11-09T05:00:00Z") })).toBeNull();
    }
    expect(isValidDateOnly("2026-11-10")).toBe(true);
  });
  it("nothing while a corrigendum is pending (deadline is uncertain)", () => {
    expect(planDeadlineReminder({ deadlineDate: D, now: at("2026-11-09T05:00:00Z"), corrigendumPending: true })).toBeNull();
  });
});

describe("reminder keys and cancellation", () => {
  it("the key includes cycle, deadline and threshold, so a repeat is deduped", () => {
    expect(deadlineReminderKey("c1", "2026-11-10", 3)).toBe("deadline:c1:2026-11-10:3d");
    expect(deadlineReminderKey("c1", "2026-11-10", 3)).toBe(deadlineReminderKey("c1", "2026-11-10", 3));
  });
  it("a changed deadline produces different keys (new reminders for the new date)", () => {
    expect(deadlineReminderKey("c1", "2026-11-17", 7)).not.toBe(deadlineReminderKey("c1", "2026-11-10", 7));
  });
  it("reminders for an old date are obsolete; the current date's and other cycles' are not", () => {
    expect(isObsoleteReminderKey("deadline:c1:2026-11-10:3d", "c1", "2026-11-17")).toBe(true);
    expect(isObsoleteReminderKey("deadline:c1:2026-11-17:7d", "c1", "2026-11-17")).toBe(false);
    expect(isObsoleteReminderKey("deadline:c2:2026-11-10:3d", "c1", "2026-11-17")).toBe(false);
    expect(isObsoleteReminderKey("update:abc", "c1", "2026-11-17")).toBe(false);
    expect(isObsoleteReminderKey("deadline:c1:2026-11-10:3d", "c1", null)).toBe(true);
  });
  it("text states the official date and asks to verify", () => {
    const plan = planDeadlineReminder({ deadlineDate: "2026-11-10", now: at("2026-11-09T05:00:00Z") });
    const t = reminderText("SSC CGL", plan!);
    expect(t.title).toContain("1 day");
    expect(t.body).toContain("2026-11-10");
    expect(t.body).toMatch(/verify/i);
  });
});
