import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationPreferences } from "../preferences";
import type { DeliveryChannel, DeliveryRecord, DeliveryStatus, EngineStore, OutboundMessage } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

interface DeliveryRow {
  id: string; notification_id: string; user_id: string; channel: DeliveryChannel; status: DeliveryStatus; attempts: number;
}
function toRecord(r: DeliveryRow): DeliveryRecord {
  return { id: r.id, notificationId: r.notification_id, userId: r.user_id, channel: r.channel, status: r.status, attempts: r.attempts };
}

/** Service-role store. Used only from server code; every query is scoped by
 *  explicit ids, never by anything a client sent. */
export function supabaseEngineStore(admin: AdminClient): EngineStore {
  return {
    async getPreferences(userIds) {
      const { data, error } = await admin.from("profiles").select("user_id, notification_preferences").in("user_id", userIds);
      if (error || !data) return null;
      const map = new Map<string, NotificationPreferences | null>();
      for (const row of data as { user_id: string; notification_preferences: NotificationPreferences | null }[]) {
        map.set(row.user_id, row.notification_preferences);
      }
      return map;
    },

    async insertNotifications(rows) {
      // ON CONFLICT (user_id, dedupe_key) DO NOTHING; .select() returns only the created rows.
      const { data, error } = await admin
        .from("notifications")
        .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
        .select("id, user_id, dedupe_key");
      if (error || !data) return { error: error?.message ?? "insert failed" };
      return {
        created: (data as { id: string; user_id: string; dedupe_key: string }[]).map((r) => ({ id: r.id, userId: r.user_id, dedupeKey: r.dedupe_key })),
      };
    },

    async insertDelivery(row) {
      const { data, error } = await admin
        .from("notification_deliveries")
        .upsert(
          {
            notification_id: row.notificationId, user_id: row.userId, channel: row.channel, status: row.status, last_error: row.lastError ?? null,
            // A pending delivery is due immediately, so the retry sweep picks it up if it is not sent inline.
            next_attempt_at: row.status === "pending" ? new Date().toISOString() : null,
          },
          { onConflict: "notification_id,channel", ignoreDuplicates: true },
        )
        .select("id, notification_id, user_id, channel, status, attempts");
      if (error || !data || data.length === 0) return null;
      return toRecord((data as DeliveryRow[])[0] as DeliveryRow);
    },

    async claimDelivery(id, expectedAttempts) {
      // Compare-and-set on attempts: only one concurrent caller can win.
      const { data } = await admin
        .from("notification_deliveries")
        .update({ attempts: expectedAttempts + 1, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("attempts", expectedAttempts)
        .in("status", ["pending", "failed"])
        .select("id");
      return !!data && data.length === 1;
    },

    async finishDelivery(id, u) {
      await admin
        .from("notification_deliveries")
        .update({
          status: u.status,
          last_error: u.lastError ?? null,
          provider_message_id: u.providerMessageId ?? null,
          next_attempt_at: u.nextAttemptAt ?? null,
          sent_at: u.sentAt ?? null,
          delivered_at: u.deliveredAt ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    },

    async listDueDeliveries(nowIso, limit) {
      const { data: rows } = await admin
        .from("notification_deliveries")
        .select("id, notification_id, user_id, channel, status, attempts")
        .in("status", ["pending", "failed"])
        .not("next_attempt_at", "is", null)
        .lte("next_attempt_at", nowIso)
        .order("next_attempt_at", { ascending: true })
        .limit(limit);
      return attachMessages(admin, (rows ?? []) as DeliveryRow[]);
    },

    async findDeliveryByProviderId(providerMessageId) {
      const { data } = await admin
        .from("notification_deliveries")
        .select("id, notification_id, user_id, channel, status, attempts")
        .eq("provider_message_id", providerMessageId)
        .maybeSingle();
      return data ? toRecord(data as DeliveryRow) : null;
    },
  };
}

async function attachMessages(admin: AdminClient, rows: DeliveryRow[]): Promise<{ delivery: DeliveryRecord; message: OutboundMessage }[]> {
  if (rows.length === 0) return [];
  const { data } = await admin.from("notifications").select("id, title, body, link_url").in("id", rows.map((r) => r.notification_id));
  const byId = new Map((data as { id: string; title: string; body: string; link_url: string | null }[] | null ?? []).map((n) => [n.id, n]));
  const out: { delivery: DeliveryRecord; message: OutboundMessage }[] = [];
  for (const r of rows) {
    const n = byId.get(r.notification_id);
    if (!n) continue;
    out.push({ delivery: toRecord(r), message: { notificationId: r.notification_id, userId: r.user_id, title: n.title, body: n.body, linkUrl: n.link_url } });
  }
  return out;
}
