import { describe, it, expect } from "vitest";
import { sendNotifications } from "../service";
import { attemptDelivery, nextAttemptAt, retryDueDeliveries, sanitizeError, MAX_DELIVERY_ATTEMPTS } from "../delivery";
import { createFakeChannel, createFakeStore } from "./fakes";
import type { NotificationDraft } from "../types";

const draft = (over: Partial<NotificationDraft> = {}): NotificationDraft => ({
  userId: "u1", event: "ADMIT_CARD_AVAILABLE", title: "T", body: "B", dedupeKey: "update:1", linkUrl: "/updates", ...over,
});

describe("sendNotifications: creation, preferences, dedupe", () => {
  it("creates an in-app notification carrying event type, link and provenance", async () => {
    const { store, notifications } = createFakeStore();
    const s = await sendNotifications({ store }, [draft({ organization: "SSC", sourceUrl: "https://ssc.gov.in/x", publishedOn: "2026-10-01" })]);
    expect(s.created).toBe(1);
    expect(notifications[0]).toMatchObject({ event_type: "ADMIT_CARD_AVAILABLE", type: "admit_card", link_url: "/updates", organization: "SSC", published_on: "2026-10-01" });
  });

  it("a repeat of the same event creates nothing (idempotent polling)", async () => {
    const { store, notifications } = createFakeStore();
    await sendNotifications({ store }, [draft()]);
    const again = await sendNotifications({ store }, [draft()]);
    expect(again.created).toBe(0);
    expect(again.duplicates).toBe(1);
    expect(notifications).toHaveLength(1);
  });

  it("a genuinely revised official update (new key) is a new notification", async () => {
    const { store, notifications } = createFakeStore();
    await sendNotifications({ store }, [draft({ dedupeKey: "update:1" })]);
    const rev = await sendNotifications({ store }, [draft({ dedupeKey: "update:2" })]);
    expect(rev.created).toBe(1);
    expect(notifications).toHaveLength(2);
  });

  it("one user with two different events in the same batch gets both", async () => {
    const { store } = createFakeStore();
    const s = await sendNotifications({ store }, [draft({ dedupeKey: "a" }), draft({ dedupeKey: "b" })]);
    expect(s.created).toBe(2);
  });

  it("skips users who turned the category off, and counts them as disabled (not failed)", async () => {
    const { store, notifications } = createFakeStore({ prefs: { u1: { admit_card: false }, u2: {} } });
    const s = await sendNotifications({ store }, [draft({ userId: "u1" }), draft({ userId: "u2" })]);
    expect(s.disabled).toBe(1);
    expect(s.failed).toBe(0);
    expect(notifications.map((n) => n.user_id)).toEqual(["u2"]);
  });

  it("an explicit draft category overrides the event's default", async () => {
    const { store } = createFakeStore({ prefs: { u1: { deadline: false } } });
    const s = await sendNotifications({ store }, [draft({ event: "NEW_NOTIFICATION", category: "deadline" })]);
    expect(s.disabled).toBe(1);
  });

  it("fails closed when preferences cannot be read: nothing is sent", async () => {
    const { store, notifications } = createFakeStore({ failPrefs: true });
    const s = await sendNotifications({ store }, [draft()]);
    expect(s.failed).toBe(1);
    expect(notifications).toHaveLength(0);
  });

  it("reports a storage failure as failed and creates nothing", async () => {
    const { store } = createFakeStore({ failInsert: true });
    const s = await sendNotifications({ store }, [draft()]);
    expect(s.failed).toBe(1);
    expect(s.created).toBe(0);
  });

  it("drops an unsafe link instead of storing it", async () => {
    const { store, notifications } = createFakeStore();
    await sendNotifications({ store }, [draft({ linkUrl: "https://evil.example/phish" })]);
    expect(notifications[0]?.link_url).toBeNull();
  });
});

describe("privacy isolation", () => {
  it("each notification goes only to its own recipient, and one user's request link never reaches another", async () => {
    const { store, notifications } = createFakeStore();
    await sendNotifications({ store }, [
      draft({ userId: "alice", event: "APPLICATION_REQUEST_COMPLETED", dedupeKey: "apprequest:rA:e1", linkUrl: "/apply-assistant/rA" }),
      draft({ userId: "bob", event: "APPLICATION_REQUEST_COMPLETED", dedupeKey: "apprequest:rB:e1", linkUrl: "/apply-assistant/rB" }),
    ]);
    const alice = notifications.filter((n) => n.user_id === "alice");
    const bob = notifications.filter((n) => n.user_id === "bob");
    expect(alice.map((n) => n.link_url)).toEqual(["/apply-assistant/rA"]);
    expect(bob.map((n) => n.link_url)).toEqual(["/apply-assistant/rB"]);
  });
});

describe("channels and delivery states", () => {
  const optedIn = { u1: { channel_email: true } };

  it("no email is queued when the provider is not configured, even if the user opted in", async () => {
    const { store, deliveries, notifications } = createFakeStore({ prefs: optedIn });
    const { channel, sent } = createFakeChannel({ configured: false });
    await sendNotifications({ store, channels: [channel] }, [draft()]);
    expect(notifications).toHaveLength(1); // in-app still works
    expect(deliveries).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("no email unless the user opted in (default off)", async () => {
    const { store, deliveries } = createFakeStore({ prefs: { u1: {} } });
    const { channel, sent } = createFakeChannel();
    await sendNotifications({ store, channels: [channel] }, [draft()]);
    expect(deliveries).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("a successful send is 'sent' - never 'delivered' (only the provider webhook can say that)", async () => {
    const { store, deliveries } = createFakeStore({ prefs: optedIn });
    const { channel, sent } = createFakeChannel();
    const s = await sendNotifications({ store, channels: [channel] }, [draft()]);
    expect(sent).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("sent");
    expect(deliveries[0]?.deliveredAt).toBeNull();
    expect(deliveries[0]?.providerMessageId).toBe("pm-1");
    expect(s.deliveries.sentInline).toBe(1);
  });

  it("a duplicate event never triggers a second email", async () => {
    const { store } = createFakeStore({ prefs: optedIn });
    const { channel, sent } = createFakeChannel();
    await sendNotifications({ store, channels: [channel] }, [draft()]);
    await sendNotifications({ store, channels: [channel] }, [draft()]);
    expect(sent).toHaveLength(1);
  });

  it("a category the user turned off sends neither in-app nor email", async () => {
    const { store, deliveries, notifications } = createFakeStore({ prefs: { u1: { channel_email: true, admit_card: false } } });
    const { channel, sent } = createFakeChannel();
    await sendNotifications({ store, channels: [channel] }, [draft()]);
    expect(notifications).toHaveLength(0);
    expect(deliveries).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("a failed send is recorded as failed with a retry time; the in-app notification still exists", async () => {
    const { store, deliveries, notifications } = createFakeStore({ prefs: optedIn });
    const { channel } = createFakeChannel({ results: [{ ok: false, error: "provider responded 500", permanent: false }] });
    const now = new Date("2026-10-01T00:00:00Z");
    const s = await sendNotifications({ store, channels: [channel], now }, [draft()]);
    expect(notifications).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("failed");
    expect(deliveries[0]?.lastError).toBe("provider responded 500");
    expect(deliveries[0]?.nextAttemptAt).toBe(nextAttemptAt(1, now));
    expect(s.deliveries.failedInline).toBe(1);
  });

  it("a permanent failure is not retried", async () => {
    const { store, deliveries } = createFakeStore({ prefs: optedIn });
    const { channel } = createFakeChannel({ results: [{ ok: false, error: "no email address on file", permanent: true }] });
    await sendNotifications({ store, channels: [channel] }, [draft()]);
    expect(deliveries[0]?.status).toBe("failed");
    expect(deliveries[0]?.nextAttemptAt).toBeNull();
  });
});

describe("retries", () => {
  const optedIn = { u1: { channel_email: true } };
  const t0 = new Date("2026-10-01T00:00:00Z");

  it("backs off exponentially and gives up after the maximum attempts", () => {
    const a1 = Date.parse(nextAttemptAt(1, t0) ?? "") - t0.getTime();
    const a2 = Date.parse(nextAttemptAt(2, t0) ?? "") - t0.getTime();
    expect(a2).toBe(a1 * 2);
    expect(nextAttemptAt(MAX_DELIVERY_ATTEMPTS, t0)).toBeNull();
  });

  it("retries a failed delivery after its backoff, and does not send before it", async () => {
    const { store, deliveries } = createFakeStore({ prefs: optedIn });
    const { channel, sent } = createFakeChannel({ results: [{ ok: false, error: "timeout", permanent: false }] });
    await sendNotifications({ store, channels: [channel], now: t0 }, [draft()]);

    const early = await retryDueDeliveries({ store, channels: [channel], now: new Date(t0.getTime() + 60_000) });
    expect(early.due).toBe(0);
    expect(sent).toHaveLength(1);

    const later = await retryDueDeliveries({ store, channels: [channel], now: new Date(t0.getTime() + 60 * 60_000) });
    expect(later).toMatchObject({ due: 1, sent: 1, failed: 0 });
    expect(sent).toHaveLength(2);
    expect(deliveries[0]?.status).toBe("sent");
    expect(deliveries[0]?.attempts).toBe(2);
  });

  it("stops after the maximum number of failed attempts", async () => {
    const { store, deliveries } = createFakeStore({ prefs: optedIn });
    const fail = { ok: false as const, error: "timeout", permanent: false };
    const { channel } = createFakeChannel({ results: Array.from({ length: 10 }, () => fail) });
    await sendNotifications({ store, channels: [channel], now: t0 }, [draft()]);
    let now = t0.getTime();
    for (let i = 0; i < 10; i++) {
      now += 48 * 60 * 60_000;
      await retryDueDeliveries({ store, channels: [channel], now: new Date(now) });
    }
    expect(deliveries[0]?.attempts).toBe(MAX_DELIVERY_ATTEMPTS);
    expect(deliveries[0]?.status).toBe("failed");
    expect(deliveries[0]?.nextAttemptAt).toBeNull();
  });

  it("two workers racing for the same delivery send it once", async () => {
    const { store, deliveries } = createFakeStore({ prefs: optedIn });
    const { channel, sent } = createFakeChannel({ configured: true });
    // Queue a pending delivery manually (as if the inline budget was exhausted).
    await store.insertNotifications([{ user_id: "u1", title: "T", body: "B", type: "result", dedupe_key: "k", event_type: "RESULT_DECLARED", link_url: null, organization: null, source_url: null, published_on: null, stage_update_id: null }]);
    const rec = await store.insertDelivery({ notificationId: "n1", userId: "u1", channel: "email", status: "pending" });
    const msg = { notificationId: "n1", userId: "u1", title: "T", body: "B", linkUrl: null };
    const [a, b] = await Promise.all([
      attemptDelivery({ store, channel, delivery: rec!, message: msg }),
      attemptDelivery({ store, channel, delivery: rec!, message: msg }),
    ]);
    expect([a, b].filter((x) => x === "not_claimed")).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("sent");
  });

  it("leaves deliveries untouched while the provider is not configured", async () => {
    const { store } = createFakeStore({ prefs: optedIn });
    const { channel } = createFakeChannel({ results: [{ ok: false, error: "x", permanent: false }] });
    await sendNotifications({ store, channels: [channel], now: t0 }, [draft()]);
    const off = createFakeChannel({ configured: false });
    const r = await retryDueDeliveries({ store, channels: [off.channel], now: new Date(t0.getTime() + 3600_000) });
    expect(r).toMatchObject({ due: 1, sent: 0, skipped: 1 });
    expect(off.sent).toHaveLength(0);
  });

  it("stored errors never contain email addresses or API keys", () => {
    const msg = sanitizeError("failed for jane.doe@example.com with key re_abcdefgh12345 and Bearer sk_secretvalue99");
    expect(msg).not.toContain("jane.doe@example.com");
    expect(msg).not.toContain("re_abcdefgh12345");
    expect(msg).not.toContain("sk_secretvalue99");
  });
});

describe("inline delivery budget", () => {
  it("deliveries beyond the inline limit stay pending and are picked up by the retry sweep", async () => {
    const users = Array.from({ length: 60 }, (_, i) => `u${i}`);
    const prefs = Object.fromEntries(users.map((u) => [u, { channel_email: true }]));
    const { store, deliveries } = createFakeStore({ prefs });
    const { channel, sent } = createFakeChannel();
    const s = await sendNotifications({ store, channels: [channel] }, users.map((userId) => draft({ userId })));
    expect(s.created).toBe(60);
    expect(sent).toHaveLength(50);
    expect(deliveries.filter((d) => d.status === "pending")).toHaveLength(10);
    const sweep = await retryDueDeliveries({ store, channels: [channel], now: new Date() });
    expect(sweep.sent).toBe(10);
    expect(sent).toHaveLength(60);
  });
});
