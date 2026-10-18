import { describe, it, expect } from "vitest";
import { REQUEST_STATUSES } from "../constants";
import { ADMIN_STATUS_LABEL, compareByUrgency, countQueues, deadlineUrgency, isOverdueRequest, OPEN_STATUSES } from "../admin-queues";

const TODAY = "2026-10-17";

describe("overdue requests", () => {
  it("an open request past its last date is overdue", () => {
    for (const status of OPEN_STATUSES) expect(isOverdueRequest({ status, application_deadline: "2026-10-16" }, TODAY)).toBe(true);
  });
  it("finished requests are never overdue, including a verified portal submission", () => {
    for (const status of ["completed", "rejected", "cancelled", "submitted_on_portal"]) {
      expect(isOverdueRequest({ status, application_deadline: "2026-01-01" }, TODAY)).toBe(false);
    }
  });
  it("the last date itself is not overdue yet, and no deadline is never overdue", () => {
    expect(isOverdueRequest({ status: "in_progress", application_deadline: TODAY }, TODAY)).toBe(false);
    expect(isOverdueRequest({ status: "in_progress", application_deadline: null }, TODAY)).toBe(false);
  });
  it("urgency bands", () => {
    const u = (d: string | null, status = "in_progress") => deadlineUrgency({ status, application_deadline: d }, TODAY);
    expect(u("2026-10-10")).toBe("overdue");
    expect(u(TODAY)).toBe("today");
    expect(u("2026-10-19")).toBe("soon");
    expect(u("2026-11-30")).toBe("later");
    expect(u(null)).toBe("none");
    expect(u("2026-10-10", "completed")).toBe("none");
  });
});

describe("queue counts", () => {
  it("counts every status, the open total and overdue", () => {
    const rows = [
      { status: "submitted", application_deadline: "2026-10-01" },
      { status: "form_filled", application_deadline: "2026-12-01" },
      { status: "completed", application_deadline: "2026-10-01" },
      { status: "mystery", application_deadline: null },
    ];
    const c = countQueues(rows, TODAY);
    expect(c.byStatus.submitted).toBe(1);
    expect(c.byStatus.form_filled).toBe(1);
    expect(c.byStatus.completed).toBe(1);
    expect(c.overdue).toBe(1);
    // an unknown status is ignored rather than crashing the dashboard
    expect(c.open).toBe(2);
  });
  it("has an admin label for every status", () => {
    for (const s of REQUEST_STATUSES) expect(ADMIN_STATUS_LABEL[s].length).toBeGreaterThan(2);
  });
  it("sorts the nearest deadline first, no-deadline last", () => {
    const rows = [
      { status: "submitted", application_deadline: null, created_at: "2026-10-01" },
      { status: "submitted", application_deadline: "2026-11-01", created_at: "2026-10-02" },
      { status: "submitted", application_deadline: "2026-10-05", created_at: "2026-10-03" },
    ];
    expect([...rows].sort(compareByUrgency).map((r) => r.application_deadline)).toEqual(["2026-10-05", "2026-11-01", null]);
  });
});
