// Shared types for the central notification engine. No I/O here.

import type { NotificationCategory, NotificationEvent } from "../events";
import type { NotificationPreferences } from "../preferences";

export interface NotificationDraft {
  userId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  /** Stable event identity, unique per recipient (see 0013). */
  dedupeKey: string;
  /** In-app path only; anything else is dropped. */
  linkUrl?: string | null;
  /** Overrides the event's default preference category (e.g. "applications
   *  open" is governed by the deadline preference). */
  category?: NotificationCategory;
  organization?: string | null;
  sourceUrl?: string | null;
  publishedOn?: string | null;
  stageUpdateId?: string | null;
}

export interface NotificationInsertRow {
  user_id: string;
  title: string;
  body: string;
  type: "deadline" | "admit_card" | "result" | "system";
  dedupe_key: string;
  event_type: string;
  link_url: string | null;
  organization: string | null;
  source_url: string | null;
  published_on: string | null;
  stage_update_id: string | null;
}

export interface CreatedNotification { id: string; userId: string; dedupeKey: string }

export type DeliveryChannel = "email" | "push";
export type DeliveryStatus = "pending" | "sent" | "delivered" | "failed" | "skipped";

export interface DeliveryRecord {
  id: string;
  notificationId: string;
  userId: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  attempts: number;
}

/** What a channel needs to send one notification. Never contains documents
 *  or free-text from applicants: title/body are the same generic strings the
 *  in-app notification carries. */
export interface OutboundMessage {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  linkUrl: string | null;
}

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; /** true = retrying cannot help (bad address, rejected) */ permanent: boolean };

export interface Channel {
  name: DeliveryChannel;
  /** False when the provider/credentials are not configured. */
  isConfigured(): boolean;
  /** Does this user want this channel? (preference opt-in) */
  wantsChannel(prefs: NotificationPreferences | null): boolean;
  send(message: OutboundMessage): Promise<SendResult>;
}

export interface EngineStore {
  /** null = the read FAILED (callers must not send: fail closed). A user with
   *  no profile row is simply absent from the map (defaults apply). */
  getPreferences(userIds: string[]): Promise<Map<string, NotificationPreferences | null> | null>;
  /** Inserts with ON CONFLICT (user_id, dedupe_key) DO NOTHING and returns
   *  only the rows that were actually created. */
  insertNotifications(rows: NotificationInsertRow[]): Promise<{ created: CreatedNotification[] } | { error: string }>;
  insertDelivery(row: { notificationId: string; userId: string; channel: DeliveryChannel; status: DeliveryStatus; lastError?: string | null }): Promise<DeliveryRecord | null>;
  /** Atomically takes a delivery for sending: only succeeds if it is still
   *  pending/failed with the expected attempt count. */
  claimDelivery(id: string, expectedAttempts: number): Promise<boolean>;
  finishDelivery(id: string, update: {
    status: DeliveryStatus; lastError?: string | null; providerMessageId?: string | null;
    nextAttemptAt?: string | null; sentAt?: string | null; deliveredAt?: string | null;
  }): Promise<void>;
  listDueDeliveries(nowIso: string, limit: number): Promise<{ delivery: DeliveryRecord; message: OutboundMessage }[]>;
  findDeliveryByProviderId(providerMessageId: string): Promise<DeliveryRecord | null>;
}
