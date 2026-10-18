// Pure helpers for the notification list / bell (no I/O, safe on the client).
import { categoryForEvent, isNotificationEvent, isSafeInternalLink, type NotificationCategory } from "./events";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  eventType: string | null;
  legacyType: "deadline" | "admit_card" | "result" | "system";
  isRead: boolean;
  createdAt: string;
  /** Always an internal path or null - re-validated here even though the DB also checks it. */
  linkUrl: string | null;
  organization: string | null;
  sourceUrl: string | null;
  publishedOn: string | null;
  /** Latest email delivery state for this notification, if one was queued. */
  emailStatus: "pending" | "sent" | "delivered" | "failed" | "skipped" | null;
}

export interface NotificationRowInput {
  id: string; title: string; body: string; type: NotificationItem["legacyType"]; is_read: boolean; created_at: string;
  event_type: string | null; link_url: string | null; organization: string | null; source_url: string | null; published_on: string | null;
}

export function toNotificationItem(row: NotificationRowInput, emailStatus: NotificationItem["emailStatus"] = null): NotificationItem {
  return {
    id: row.id, title: row.title, body: row.body, eventType: row.event_type, legacyType: row.type, isRead: row.is_read,
    createdAt: row.created_at, linkUrl: isSafeInternalLink(row.link_url) ? row.link_url : null,
    organization: row.organization, sourceUrl: row.source_url, publishedOn: row.published_on, emailStatus,
  };
}

export function countUnread(items: NotificationItem[]): number {
  return items.reduce((n, i) => n + (i.isRead ? 0 : 1), 0);
}

export function markRead(items: NotificationItem[], ids: string[] | "all"): NotificationItem[] {
  const set = ids === "all" ? null : new Set(ids);
  return items.map((i) => (set === null || set.has(i.id) ? { ...i, isRead: true } : i));
}

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  new_notification: "New notification",
  deadline: "Deadline",
  exam_date: "Exam date",
  admit_card: "Admit card",
  answer_key: "Answer key",
  result: "Result",
  eligibility: "Eligibility",
  application_requests: "Your request",
  system: "Update",
};

export function categoryLabelFor(item: Pick<NotificationItem, "eventType" | "legacyType">): string {
  if (item.eventType && isNotificationEvent(item.eventType)) return CATEGORY_LABEL[categoryForEvent(item.eventType)];
  return { deadline: "Deadline", admit_card: "Admit card", result: "Result", system: "Update" }[item.legacyType];
}

export const EMAIL_STATUS_LABEL: Record<NonNullable<NotificationItem["emailStatus"]>, string> = {
  pending: "Email queued",
  sent: "Email sent",
  delivered: "Email delivered",
  failed: "Email could not be sent",
  skipped: "Email skipped",
};

/** Window event the list dispatches so the bell badge refetches. */
export const NOTIFICATIONS_CHANGED_EVENT = "govassist:notifications-changed";
