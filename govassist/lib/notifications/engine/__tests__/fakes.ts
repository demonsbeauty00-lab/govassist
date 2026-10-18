// In-memory EngineStore + fake channel for tests. Mirrors the real database's
// rules: unique (user_id, dedupe_key), unique (notification_id, channel),
// compare-and-set claiming.
import type {
  Channel, CreatedNotification, DeliveryRecord, EngineStore, NotificationInsertRow, OutboundMessage, SendResult,
} from "../types";
import type { NotificationPreferences } from "../../preferences";

export interface FakeDelivery extends DeliveryRecord {
  lastError: string | null; providerMessageId: string | null; nextAttemptAt: string | null; sentAt: string | null; deliveredAt: string | null;
}

export function createFakeStore(opts: {
  prefs?: Record<string, NotificationPreferences | null>;
  failPrefs?: boolean;
  failInsert?: boolean;
} = {}) {
  const notifications: (NotificationInsertRow & { id: string })[] = [];
  const deliveries: FakeDelivery[] = [];
  let n = 0;

  const store: EngineStore = {
    async getPreferences(userIds) {
      if (opts.failPrefs) return null;
      const m = new Map<string, NotificationPreferences | null>();
      for (const id of userIds) if (opts.prefs && id in opts.prefs) m.set(id, opts.prefs[id] ?? null);
      return m;
    },
    async insertNotifications(rows) {
      if (opts.failInsert) return { error: "boom" };
      const created: CreatedNotification[] = [];
      for (const r of rows) {
        if (notifications.some((x) => x.user_id === r.user_id && x.dedupe_key === r.dedupe_key)) continue;
        const id = `n${++n}`;
        notifications.push({ ...r, id });
        created.push({ id, userId: r.user_id, dedupeKey: r.dedupe_key });
      }
      return { created };
    },
    async insertDelivery(row) {
      if (deliveries.some((d) => d.notificationId === row.notificationId && d.channel === row.channel)) return null;
      const d: FakeDelivery = {
        id: `d${deliveries.length + 1}`, notificationId: row.notificationId, userId: row.userId, channel: row.channel,
        status: row.status, attempts: 0, lastError: row.lastError ?? null, providerMessageId: null, nextAttemptAt: row.status === "pending" ? new Date(0).toISOString() : null, sentAt: null, deliveredAt: null,
      };
      deliveries.push(d);
      return { id: d.id, notificationId: d.notificationId, userId: d.userId, channel: d.channel, status: d.status, attempts: 0 };
    },
    async claimDelivery(id, expectedAttempts) {
      const d = deliveries.find((x) => x.id === id);
      if (!d || d.attempts !== expectedAttempts || (d.status !== "pending" && d.status !== "failed")) return false;
      d.attempts += 1;
      return true;
    },
    async finishDelivery(id, u) {
      const d = deliveries.find((x) => x.id === id);
      if (!d) return;
      d.status = u.status;
      d.lastError = u.lastError ?? null;
      d.providerMessageId = u.providerMessageId ?? d.providerMessageId;
      d.nextAttemptAt = u.nextAttemptAt ?? null;
      d.sentAt = u.sentAt ?? d.sentAt;
      d.deliveredAt = u.deliveredAt ?? d.deliveredAt;
    },
    async listDueDeliveries(nowIso, limit) {
      return deliveries
        .filter((d) => (d.status === "pending" || d.status === "failed") && d.nextAttemptAt !== null && d.nextAttemptAt <= nowIso)
        .slice(0, limit)
        .map((d) => {
          const note = notifications.find((x) => x.id === d.notificationId);
          const message: OutboundMessage = { notificationId: d.notificationId, userId: d.userId, title: note?.title ?? "", body: note?.body ?? "", linkUrl: note?.link_url ?? null };
          return { delivery: { id: d.id, notificationId: d.notificationId, userId: d.userId, channel: d.channel, status: d.status, attempts: d.attempts }, message };
        });
    },
    async findDeliveryByProviderId(pid) {
      const d = deliveries.find((x) => x.providerMessageId === pid);
      return d ? { id: d.id, notificationId: d.notificationId, userId: d.userId, channel: d.channel, status: d.status, attempts: d.attempts } : null;
    },
  };
  return { store, notifications, deliveries };
}

export function createFakeChannel(opts: { configured?: boolean; results?: SendResult[]; optIn?: boolean } = {}) {
  const sent: OutboundMessage[] = [];
  const queue = [...(opts.results ?? [])];
  const channel: Channel = {
    name: "email",
    isConfigured: () => opts.configured ?? true,
    wantsChannel: (prefs) => (opts.optIn === undefined ? prefs?.channel_email === true : opts.optIn),
    async send(message) {
      sent.push(message);
      return queue.shift() ?? { ok: true, providerMessageId: `pm-${sent.length}` };
    },
  };
  return { channel, sent };
}
