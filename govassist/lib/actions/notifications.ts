"use server";

import { requireUser } from "./session";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { toNotificationItem, type NotificationItem, type NotificationRowInput } from "@/lib/notifications/inbox";

// All three actions use the signed-in user's own session (NOT the service
// role), so row-level security is the authorization: a user can only ever see
// or change their own notifications (0001 policies + 0020 column grants).

const PAGE_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listNotificationsAction(): Promise<{ error?: string; items: NotificationItem[]; unread: number }> {
  const auth = await requireUser();
  if (!auth.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, items: [], unread: 0 };
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, type, is_read, created_at, event_type, link_url, organization, source_url, published_on")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_LIMIT);
  if (error) return { error: "Couldn't load your notifications. Please try again.", items: [], unread: 0 };

  const rows = (data ?? []) as NotificationRowInput[];
  const emailByNotification = new Map<string, NotificationItem["emailStatus"]>();
  if (rows.length > 0) {
    const { data: deliveries } = await supabase
      .from("notification_deliveries")
      .select("notification_id, status")
      .eq("user_id", user.id)
      .eq("channel", "email")
      .in("notification_id", rows.map((r) => r.id));
    for (const d of (deliveries ?? []) as { notification_id: string; status: NonNullable<NotificationItem["emailStatus"]> }[]) {
      emailByNotification.set(d.notification_id, d.status);
    }
  }

  const items = rows.map((r) => toNotificationItem(r, emailByNotification.get(r.id) ?? null));
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false);
  return { items, unread: count ?? items.filter((i) => !i.isRead).length };
}

export async function markNotificationReadAction(id: string): Promise<{ error?: string; success?: boolean }> {
  if (!UUID.test(id)) return { error: "Invalid notification." };
  const auth = await requireUser();
  if (!auth.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_read", false);
  if (error) return { error: "Couldn't mark it as read. Please try again." };
  return { success: true };
}

export async function markAllNotificationsReadAction(): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireUser();
  if (!auth.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = auth;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("is_read", false);
  if (error) return { error: "Couldn't mark all as read. Please try again." };
  return { success: true };
}
