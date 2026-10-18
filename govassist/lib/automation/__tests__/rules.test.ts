import { describe, it, expect } from "vitest";
import { classifyCycleTiming, countCycles, daysUntil, todayIST } from "../cycles";
import { countSources, FAILING_THRESHOLD, shortError, sourceHealth, type SourceHealthInput } from "../sources";
import { canRecheckSource, canRetryPublish, isRequeueableDelivery, isStuckAutoPublish, MAX_DELIVERY_ATTEMPTS } from "../retry-rules";

const T = "2026-10-17";

describe("exam cycle timing", () => {
  it("classifies by application window", () => {
    expect(classifyCycleTiming({ application_start_date: "2026-09-01", application_end_date: "2026-10-01" }, T)).toBe("expired");
    expect(classifyCycleTiming({ application_start_date: "2026-11-01", application_end_date: "2026-12-01" }, T)).toBe("upcoming");
    expect(classifyCycleTiming({ application_start_date: "2026-10-01", application_end_date: "2026-11-01" }, T)).toBe("current");
  });
  it("the last date itself is still current; the day after is expired", () => {
    expect(classifyCycleTiming({ application_start_date: null, application_end_date: T }, T)).toBe("current");
    expect(classifyCycleTiming({ application_start_date: null, application_end_date: "2026-10-16" }, T)).toBe("expired");
  });
  it("never invents dates: open-ended is current, no dates is undated", () => {
    expect(classifyCycleTiming({ application_start_date: "2026-10-01", application_end_date: null }, T)).toBe("current");
    expect(classifyCycleTiming({ application_start_date: null, application_end_date: null }, T)).toBe("undated");
  });
  it("counts add up and todayIST uses India's date", () => {
    const c = countCycles([
      { application_start_date: null, application_end_date: "2026-01-01" },
      { application_start_date: "2027-01-01", application_end_date: null },
      { application_start_date: null, application_end_date: null },
    ], T);
    expect(c).toEqual({ current: 0, expired: 1, upcoming: 1, undated: 1, total: 3 });
    expect(todayIST(new Date("2026-10-16T20:00:00Z"))).toBe("2026-10-17");
    expect(daysUntil("2026-10-20", T)).toBe(3);
  });
});

const NOW = new Date("2026-10-17T06:00:00Z");
const src = (over: Partial<SourceHealthInput> = {}): SourceHealthInput => ({
  enabled: true, needs_parser_maintenance: false, last_checked_at: "2026-10-17T03:00:00Z", last_success_at: "2026-10-17T03:00:00Z",
  last_error: null, consecutive_failures: 0, check_frequency_minutes: 1440, ...over,
});

describe("source health", () => {
  it("covers each state in priority order", () => {
    expect(sourceHealth(src(), NOW)).toBe("healthy");
    expect(sourceHealth(src({ enabled: false, needs_parser_maintenance: true }), NOW)).toBe("disabled");
    expect(sourceHealth(src({ needs_parser_maintenance: true, last_error: "Parser error: x" }), NOW)).toBe("maintenance");
    expect(sourceHealth(src({ last_error: "HTTP 500", consecutive_failures: 1 }), NOW)).toBe("error");
    expect(sourceHealth(src({ last_error: "HTTP 500", consecutive_failures: FAILING_THRESHOLD }), NOW)).toBe("failing");
    expect(sourceHealth(src({ last_checked_at: null, last_success_at: null }), NOW)).toBe("never_checked");
    expect(sourceHealth(src({ last_checked_at: "2026-10-10T03:00:00Z" }), NOW)).toBe("stale");
  });
  it("a source checked a little late is not stale", () => {
    expect(sourceHealth(src({ last_checked_at: "2026-10-15T08:00:00Z" }), NOW)).toBe("healthy");
  });
  it("counts: inactive and maintenance are not 'active'", () => {
    const c = countSources([src(), src({ enabled: false }), src({ needs_parser_maintenance: true }), src({ last_error: "x", consecutive_failures: 1 })], NOW);
    expect(c).toMatchObject({ total: 4, active: 2, inactive: 1, maintenance: 1, withErrors: 1 });
  });
  it("shortens long external errors", () => {
    expect(shortError(null)).toBeNull();
    expect(shortError("a\n\n  b")).toBe("a b");
    expect((shortError("x".repeat(500)) ?? "").length).toBe(200);
  });
});

describe("retry safety rules", () => {
  const ok = { enabled: true, needs_parser_maintenance: false, last_checked_at: "2026-10-17T00:00:00Z" };
  it("allows a re-check of an active, healthy-flagged source that was not checked just now", () => {
    expect(canRecheckSource(ok, NOW).ok).toBe(true);
  });
  it("refuses inactive, maintenance-flagged and just-checked sources", () => {
    expect(canRecheckSource({ ...ok, enabled: false }, NOW).ok).toBe(false);
    expect(canRecheckSource({ ...ok, needs_parser_maintenance: true }, NOW).ok).toBe(false);
    expect(canRecheckSource({ ...ok, last_checked_at: "2026-10-17T05:58:00Z" }, NOW).ok).toBe(false);
  });
  it("only a pending auto_publish update can be retried; uncertain or rejected ones never", () => {
    const u = { status: "pending", classification: "auto_publish", detected_at: "2026-10-17T00:00:00Z" };
    expect(canRetryPublish(u).ok).toBe(true);
    expect(canRetryPublish({ ...u, classification: "needs_review" }).ok).toBe(false);
    expect(canRetryPublish({ ...u, classification: "reject" }).ok).toBe(false);
    expect(canRetryPublish({ ...u, status: "published" }).ok).toBe(false);
    expect(canRetryPublish({ ...u, status: "rejected" }).ok).toBe(false);
  });
  it("detects a stuck auto-publish only after an hour", () => {
    const u = { status: "pending", classification: "auto_publish", detected_at: "2026-10-17T05:30:00Z" };
    expect(isStuckAutoPublish(u, NOW)).toBe(false);
    expect(isStuckAutoPublish({ ...u, detected_at: "2026-10-17T03:00:00Z" }, NOW)).toBe(true);
    expect(isStuckAutoPublish({ ...u, classification: "needs_review", detected_at: "2026-10-16T00:00:00Z" }, NOW)).toBe(false);
  });
  it("requeues only failed deliveries that can still succeed", () => {
    const d = { status: "failed", attempts: 2, last_error: "provider responded 500" };
    expect(isRequeueableDelivery(d)).toBe(true);
    expect(isRequeueableDelivery({ ...d, attempts: MAX_DELIVERY_ATTEMPTS })).toBe(false);
    expect(isRequeueableDelivery({ ...d, last_error: "bounced" })).toBe(false);
    expect(isRequeueableDelivery({ ...d, last_error: "no email address on file" })).toBe(false);
    expect(isRequeueableDelivery({ ...d, status: "sent" })).toBe(false);
  });
});
