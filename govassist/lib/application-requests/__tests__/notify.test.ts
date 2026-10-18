import { describe, it, expect } from "vitest";
import { REQUEST_STATUSES } from "../constants";
import { buildStatusNotification, genericRequestNotification } from "../notify-text";
import { notifyRequestUser, requestDedupeKey, type RequestNotificationStore } from "../notify";
import type { NotificationPreferences } from "@/lib/notifications/preferences";
import type { NotificationEvent } from "@/lib/notifications/events";
import { sendNotifications } from "@/lib/notifications/engine/service";
import { createFakeStore } from "@/lib/notifications/engine/__tests__/fakes";

const CODE = "GA-1042";

describe("buildStatusNotification", () => {
  it("has a title and body for every status, with the request code in the title", () => {
    for (const status of REQUEST_STATUSES) {
      const n = buildStatusNotification({ status, requestCode: CODE, officiallySubmitted: status === "submitted_on_portal" });
      expect(n.title.length).toBeGreaterThan(5);
      expect(n.body.length).toBeGreaterThan(10);
    }
  });

  it("covers the requested events in plain words", () => {
    const t = (status: (typeof REQUEST_STATUSES)[number]) => buildStatusNotification({ status, requestCode: CODE, officiallySubmitted: false });
    expect(t("submitted").title).toMatch(/submitted/i);
    expect(t("in_progress").title).toMatch(/accepted/i);
    expect(t("waiting_for_user").body).toMatch(/information/i);
    expect(t("form_filled").title).toMatch(/review/i);
    expect(t("rejected").title).toMatch(/could not be processed/i);
    expect(t("completed").title).toMatch(/completed/i);
  });

  it("never says the application was submitted on the official portal without verification", () => {
    for (const status of REQUEST_STATUSES) {
      const n = buildStatusNotification({ status, requestCode: CODE, officiallySubmitted: false });
      const text = `${n.title} ${n.body}`;
      // Any mention of the official portal must be a denial.
      if (/official portal/i.test(text)) expect(text).toMatch(/not (been )?submitted on the official portal|does not mean/i);
      expect(text).not.toMatch(/submission confirmed|confirmed the official submission|confirmed your application/i);
    }
  });

  it("submitted_on_portal claims official submission ONLY when verified", () => {
    const verified = buildStatusNotification({ status: "submitted_on_portal", requestCode: CODE, officiallySubmitted: true });
    expect(verified.body).toMatch(/submitted on the official portal/i);
    const unverified = buildStatusNotification({ status: "submitted_on_portal", requestCode: CODE, officiallySubmitted: false });
    expect(`${unverified.title} ${unverified.body}`).not.toMatch(/official portal|submission confirmed/i);
  });

  it("completed mentions official submission only when it was verified", () => {
    expect(buildStatusNotification({ status: "completed", requestCode: CODE, officiallySubmitted: true }).body).toMatch(/confirmed the official submission/i);
    expect(buildStatusNotification({ status: "completed", requestCode: CODE, officiallySubmitted: false }).body).toMatch(/does not mean/i);
  });

  it("the 'submitted' notice says nothing was submitted on the portal and gives the help number", () => {
    const n = buildStatusNotification({ status: "submitted", requestCode: CODE, officiallySubmitted: false });
    expect(n.body).toMatch(/not been submitted on the official portal/i);
    expect(n.body).toContain("70174 53851");
  });

  it("wraps non-status events with the generic title", () => {
    expect(genericRequestNotification(CODE, "x")).toEqual({ title: `Update on your request ${CODE}`, body: "x" });
  });
});

function fakeStore(prefs: NotificationPreferences | null, opts: { failInsert?: boolean } = {}) {
  // The REAL engine over an in-memory database, so preferences + dedupe are exercised end to end.
  const fake = createFakeStore({ prefs: prefs === null ? {} : { u1: prefs }, failInsert: opts.failInsert });
  const store: RequestNotificationStore = {
    async deliver(draft) {
      const s = await sendNotifications({ store: fake.store }, [draft]);
      return { created: s.created, duplicates: s.duplicates, disabled: s.disabled, failed: s.failed };
    },
  };
  return { store, rows: fake.notifications };
}

const send = (store: RequestNotificationStore, suffix = "ev1", userId = "u1", event: NotificationEvent = "APPLICATION_REQUEST_ACCEPTED") =>
  notifyRequestUser({ store, userId, requestId: "r1", dedupeSuffix: suffix, event, title: "T", body: "B" });

describe("notifyRequestUser", () => {
  it("creates one notification with a request-scoped dedupe key, the event type and a link to the request", async () => {
    const { store, rows } = fakeStore(null);
    expect(await send(store)).toBe("sent");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dedupe_key).toBe(requestDedupeKey("r1", "ev1"));
    expect(rows[0]?.event_type).toBe("APPLICATION_REQUEST_ACCEPTED");
    expect(rows[0]?.link_url).toBe("/apply-assistant/r1");
  });

  it("only ever notifies the given owner", async () => {
    const { store, rows } = fakeStore(null);
    await send(store, "ev1", "u1");
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set(["u1"]));
  });

  it("never notifies twice for the same event, but does for a new event", async () => {
    const { store, rows } = fakeStore({});
    expect(await send(store, "ev1")).toBe("sent");
    expect(await send(store, "ev1")).toBe("duplicate");
    expect(await send(store, "ev2")).toBe("sent");
    expect(rows).toHaveLength(2);
  });

  it("respects the applicant's preferences: application_requests off -> nothing created, not a failure", async () => {
    const { store, rows } = fakeStore({ application_requests: false });
    expect(await send(store)).toBe("disabled");
    expect(rows).toHaveLength(0);
  });

  it("falls back to the legacy 'system' preference when application_requests was never set", async () => {
    expect(await send(fakeStore({ system: false }).store)).toBe("disabled");
    expect(await send(fakeStore({ system: false, application_requests: true }).store)).toBe("sent");
  });

  it("other preference toggles do not suppress it, and a missing key means enabled", async () => {
    expect(await send(fakeStore({ deadline: false, result: false }).store)).toBe("sent");
    expect(await send(fakeStore({}).store)).toBe("sent");
    expect(await send(fakeStore(null).store)).toBe("sent");
  });

  it("reports a real storage failure as failed", async () => {
    expect(await send(fakeStore(null, { failInsert: true }).store)).toBe("failed");
  });

  it("truncates an over-long title and body", async () => {
    const { store, rows } = fakeStore(null);
    await notifyRequestUser({ store, userId: "u1", requestId: "r1", dedupeSuffix: "e", event: "APPLICATION_REQUEST_MESSAGE", title: "t".repeat(500), body: "b".repeat(900) });
    expect(rows[0]?.title.length).toBe(120);
    expect(rows[0]?.body.length).toBe(300);
  });
});
