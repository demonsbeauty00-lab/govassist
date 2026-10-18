// Notifies the OWNER of an application request about one change, through the
// central notification engine (lib/notifications/engine): preference check,
// (user_id, dedupe_key) deduplication, in-app row, then opted-in channels.
// The engine is injected so the rules are testable without a database.
//
//  - Owner only: the recipient is always request.user_id, never anyone else.
//  - Link: only the owner's own request page (RLS also restricts that page).
//  - Respects the 'application_requests' preference (falls back to 'system').
//    Turning it off is a choice, reported as "disabled", not a failure.
//  - Text never contains document names/contents: callers pass generic text.

import type { createAdminClient } from "@/lib/supabase/admin";
import { requestLink, type NotificationEvent } from "@/lib/notifications/events";
import type { NotificationDraft } from "@/lib/notifications/engine/types";

export type RequestNotifyOutcome = "sent" | "duplicate" | "disabled" | "failed";

export interface RequestNotificationStore {
  /** Runs one draft through the central engine. */
  deliver(draft: NotificationDraft): Promise<{ created: number; duplicates: number; disabled: number; failed: number }>;
}

export function requestDedupeKey(requestId: string, suffix: string): string {
  return `apprequest:${requestId}:${suffix}`;
}

export async function notifyRequestUser(params: {
  store: RequestNotificationStore;
  userId: string;
  requestId: string;
  /** Distinguishes events: an event id, or a fixed word like "submitted". */
  dedupeSuffix: string;
  /** The Phase 14 event type (see eventForRequestStatus for status changes). */
  event: NotificationEvent;
  title: string;
  body: string;
}): Promise<RequestNotifyOutcome> {
  const r = await params.store.deliver({
    userId: params.userId,
    event: params.event,
    title: params.title.trim().slice(0, 120),
    body: params.body.slice(0, 300),
    dedupeKey: requestDedupeKey(params.requestId, params.dedupeSuffix),
    linkUrl: requestLink(params.requestId),
  });
  if (r.created > 0) return "sent";
  if (r.failed > 0) return "failed";
  if (r.disabled > 0) return "disabled";
  return "duplicate";
}

type AdminClient = ReturnType<typeof createAdminClient>;

export function supabaseRequestNotificationStore(admin: AdminClient): RequestNotificationStore {
  return {
    async deliver(draft) {
      // Imported lazily so this module (and its unit tests) never pull in server-only code.
      const { notify } = await import("@/lib/notifications/engine");
      const s = await notify([draft], admin);
      return { created: s.created, duplicates: s.duplicates, disabled: s.disabled, failed: s.failed };
    },
  };
}
