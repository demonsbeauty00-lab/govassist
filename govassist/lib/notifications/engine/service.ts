// ---------------------------------------------------------------------------
// The central notification service. Every feature that wants to tell a user
// something calls sendNotifications() with drafts; nothing else inserts into
// `notifications`. For each draft:
//
//   preference check  (category, with legacy fallbacks; fail CLOSED if the
//                      preferences could not be read)
//   -> deduplicate    (unique (user_id, dedupe_key); a repeat inserts nothing)
//   -> in-app row     (the inbox; read state lives on the row)
//   -> other channels (email today, only if configured AND the user opted in;
//                      each tracked in notification_deliveries)
//
// Recipient SELECTION (who is relevant) stays with the callers, which already
// know their audience (see relevance.ts, deadline.ts, request notifications);
// the engine never widens it.
// ---------------------------------------------------------------------------

import { categoryForEvent, isSafeInternalLink, legacyTypeForEvent } from "../events";
import { isCategoryEnabled, type NotificationPreferences } from "../preferences";
import { attemptDelivery } from "./delivery";
import type { Channel, EngineStore, NotificationDraft, NotificationInsertRow, OutboundMessage } from "./types";

const INSERT_CHUNK = 200;
const PREF_CHUNK = 200;
/** Channel sends attempted inline; the rest stay "pending" for the retry sweep. */
export const MAX_INLINE_DELIVERIES = 50;

export interface SendSummary {
  /** New in-app notifications created. */
  created: number;
  /** Skipped because the same event was already sent to that user. */
  duplicates: number;
  /** Skipped because the user turned that category off. */
  disabled: number;
  /** Could not be processed (preferences unreadable, or a write failed). */
  failed: number;
  createdUserIds: Set<string>;
  disabledUserIds: Set<string>;
  deliveries: { queued: number; sentInline: number; failedInline: number };
}

function emptySummary(): SendSummary {
  return {
    created: 0, duplicates: 0, disabled: 0, failed: 0,
    createdUserIds: new Set(), disabledUserIds: new Set(),
    deliveries: { queued: 0, sentInline: 0, failedInline: 0 },
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function draftToRow(draft: NotificationDraft): NotificationInsertRow {
  return {
    user_id: draft.userId,
    title: draft.title.slice(0, 120),
    body: draft.body.slice(0, 500),
    type: legacyTypeForEvent(draft.event),
    dedupe_key: draft.dedupeKey,
    event_type: draft.event,
    link_url: isSafeInternalLink(draft.linkUrl) ? draft.linkUrl : null,
    organization: draft.organization ?? null,
    source_url: draft.sourceUrl ?? null,
    published_on: draft.publishedOn ?? null,
    stage_update_id: draft.stageUpdateId ?? null,
  };
}

export async function sendNotifications(
  deps: { store: EngineStore; channels?: Channel[]; now?: Date },
  drafts: NotificationDraft[],
): Promise<SendSummary> {
  const summary = emptySummary();
  if (drafts.length === 0) return summary;
  const { store } = deps;
  const channels = (deps.channels ?? []).filter((c) => c.isConfigured());

  // Preferences for every recipient. Unreadable -> send nothing (fail closed):
  // the dedupe key makes the retry safe.
  const userIds = Array.from(new Set(drafts.map((d) => d.userId)));
  const prefs = new Map<string, NotificationPreferences | null>();
  for (const ids of chunk(userIds, PREF_CHUNK)) {
    const got = await store.getPreferences(ids);
    if (got === null) {
      summary.failed += drafts.length;
      return summary;
    }
    for (const [id, p] of Array.from(got.entries())) prefs.set(id, p);
  }

  const allowed: NotificationDraft[] = [];
  for (const draft of drafts) {
    const category = draft.category ?? categoryForEvent(draft.event);
    if (isCategoryEnabled(prefs.get(draft.userId) ?? null, category)) allowed.push(draft);
    else {
      summary.disabled += 1;
      summary.disabledUserIds.add(draft.userId);
    }
  }

  const byKey = new Map(allowed.map((d) => [`${d.userId}\u0000${d.dedupeKey}`, d]));
  const createdDrafts: { id: string; draft: NotificationDraft }[] = [];

  for (const part of chunk(allowed, INSERT_CHUNK)) {
    const result = await store.insertNotifications(part.map(draftToRow));
    if ("error" in result) {
      summary.failed += part.length;
      continue;
    }
    summary.created += result.created.length;
    summary.duplicates += part.length - result.created.length;
    for (const row of result.created) {
      summary.createdUserIds.add(row.userId);
      const draft = byKey.get(`${row.userId}\u0000${row.dedupeKey}`);
      if (draft) createdDrafts.push({ id: row.id, draft });
    }
  }

  // Other channels: only for NEWLY created notifications, so a duplicate can
  // never trigger a second email.
  let inline = 0;
  for (const { id, draft } of createdDrafts) {
    const userPrefs = prefs.get(draft.userId) ?? null;
    const message: OutboundMessage = {
      notificationId: id, userId: draft.userId, title: draft.title.slice(0, 120), body: draft.body.slice(0, 500),
      linkUrl: isSafeInternalLink(draft.linkUrl) ? draft.linkUrl : null,
    };
    for (const channel of channels) {
      if (!channel.wantsChannel(userPrefs)) continue;
      const delivery = await store.insertDelivery({ notificationId: id, userId: draft.userId, channel: channel.name, status: "pending" });
      if (!delivery) continue; // already exists (unique per notification + channel) or write failed
      summary.deliveries.queued += 1;
      if (inline >= MAX_INLINE_DELIVERIES) continue; // left pending for the retry sweep
      inline += 1;
      const outcome = await attemptDelivery({ store, channel, delivery, message, now: deps.now });
      if (outcome !== "not_claimed") {
        if (outcome.status === "sent") summary.deliveries.sentInline += 1;
        else summary.deliveries.failedInline += 1;
      }
    }
  }
  return summary;
}
