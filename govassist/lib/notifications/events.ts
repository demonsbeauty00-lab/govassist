// ---------------------------------------------------------------------------
// The one place that defines GovAssist's notification EVENTS: their names,
// which preference category governs them, and who may receive them. Pure.
//
// Event names follow the phase brief and reuse the existing monitoring /
// assistance vocabulary instead of inventing parallel ones. Two events beyond
// the brief's list exist because dropping them would regress behaviour that
// already shipped:
//   OFFICIAL_UPDATE                corrigenda and other official notices
//   APPLICATION_REQUEST_MESSAGE    an admin message / document on a request
// ---------------------------------------------------------------------------

import type { Database } from "@/lib/supabase/database.types";
import type { RequestStatus } from "@/lib/application-requests/constants";

export type UpdateType = Database["public"]["Tables"]["detected_updates"]["Row"]["update_type"];
/** The legacy 4-value column notifications.type (kept; see 0001). */
export type LegacyNotificationType = Database["public"]["Tables"]["notifications"]["Row"]["type"];

export const NOTIFICATION_EVENTS = [
  "NEW_NOTIFICATION",
  "DEADLINE_CHANGED",
  "DEADLINE_APPROACHING",
  "EXAM_DATE_CHANGED",
  "ADMIT_CARD_AVAILABLE",
  "CITY_INTIMATION_AVAILABLE",
  "ANSWER_KEY_AVAILABLE",
  "OBJECTION_WINDOW_OPEN",
  "RESULT_DECLARED",
  "CUTOFF_AVAILABLE",
  "APPLICATION_STATUS_CHANGED",
  "ELIGIBILITY_CHANGED",
  "APPLICATION_REQUEST_SUBMITTED",
  "APPLICATION_REQUEST_ACCEPTED",
  "APPLICATION_REQUEST_IN_PROGRESS",
  "APPLICATION_REQUEST_WAITING_FOR_USER",
  "APPLICATION_REQUEST_FORM_FILLED",
  "APPLICATION_REQUEST_REJECTED",
  "APPLICATION_REQUEST_COMPLETED",
  "OFFICIAL_UPDATE",
  "APPLICATION_REQUEST_MESSAGE",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export function isNotificationEvent(value: unknown): value is NotificationEvent {
  return typeof value === "string" && (NOTIFICATION_EVENTS as readonly string[]).includes(value);
}

/** The user-facing preference categories (keys of profiles.notification_preferences). */
export type NotificationCategory =
  | "new_notification" | "deadline" | "exam_date" | "admit_card" | "answer_key"
  | "result" | "eligibility" | "application_requests" | "system";

interface EventDef {
  category: NotificationCategory;
  legacyType: LegacyNotificationType;
  /** A discovery event may also reach opted-in users whose profile matches. */
  discovery: boolean;
}

const EVENT_DEFS: Record<NotificationEvent, EventDef> = {
  NEW_NOTIFICATION: { category: "new_notification", legacyType: "system", discovery: true },
  DEADLINE_CHANGED: { category: "deadline", legacyType: "deadline", discovery: false },
  DEADLINE_APPROACHING: { category: "deadline", legacyType: "deadline", discovery: false },
  EXAM_DATE_CHANGED: { category: "exam_date", legacyType: "system", discovery: false },
  ADMIT_CARD_AVAILABLE: { category: "admit_card", legacyType: "admit_card", discovery: false },
  CITY_INTIMATION_AVAILABLE: { category: "admit_card", legacyType: "admit_card", discovery: false },
  ANSWER_KEY_AVAILABLE: { category: "answer_key", legacyType: "result", discovery: false },
  OBJECTION_WINDOW_OPEN: { category: "answer_key", legacyType: "result", discovery: false },
  RESULT_DECLARED: { category: "result", legacyType: "result", discovery: false },
  CUTOFF_AVAILABLE: { category: "result", legacyType: "result", discovery: false },
  APPLICATION_STATUS_CHANGED: { category: "application_requests", legacyType: "system", discovery: false },
  ELIGIBILITY_CHANGED: { category: "eligibility", legacyType: "system", discovery: false },
  APPLICATION_REQUEST_SUBMITTED: { category: "application_requests", legacyType: "system", discovery: false },
  APPLICATION_REQUEST_ACCEPTED: { category: "application_requests", legacyType: "system", discovery: false },
  APPLICATION_REQUEST_IN_PROGRESS: { category: "application_requests", legacyType: "system", discovery: false },
  APPLICATION_REQUEST_WAITING_FOR_USER: { category: "application_requests", legacyType: "system", discovery: false },
  APPLICATION_REQUEST_FORM_FILLED: { category: "application_requests", legacyType: "system", discovery: false },
  APPLICATION_REQUEST_REJECTED: { category: "application_requests", legacyType: "system", discovery: false },
  APPLICATION_REQUEST_COMPLETED: { category: "application_requests", legacyType: "system", discovery: false },
  OFFICIAL_UPDATE: { category: "system", legacyType: "system", discovery: false },
  APPLICATION_REQUEST_MESSAGE: { category: "application_requests", legacyType: "system", discovery: false },
};

export function categoryForEvent(event: NotificationEvent): NotificationCategory {
  return EVENT_DEFS[event].category;
}
export function legacyTypeForEvent(event: NotificationEvent): LegacyNotificationType {
  return EVENT_DEFS[event].legacyType;
}
export function isDiscoveryEvent(event: NotificationEvent): boolean {
  return EVENT_DEFS[event].discovery;
}

/** A detected official update -> the event it raises. Total over UpdateType. */
export function eventForUpdateType(type: UpdateType): NotificationEvent {
  switch (type) {
    case "new_notification":
    case "application_start_date":
      return "NEW_NOTIFICATION";
    case "application_end_date_change":
      return "DEADLINE_CHANGED";
    case "exam_date":
      return "EXAM_DATE_CHANGED";
    case "admit_card":
      return "ADMIT_CARD_AVAILABLE";
    case "exam_city_intimation":
      return "CITY_INTIMATION_AVAILABLE";
    case "answer_key":
    case "response_sheet":
      return "ANSWER_KEY_AVAILABLE";
    case "objection_window":
      return "OBJECTION_WINDOW_OPEN";
    case "result":
    case "scorecard":
      return "RESULT_DECLARED";
    case "cutoff":
      return "CUTOFF_AVAILABLE";
    case "corrigendum":
    case "other":
      return "OFFICIAL_UPDATE";
  }
}

/** The preference category governing a detected update. Same as the event's
 *  category, except "applications open", which has always been governed by the
 *  deadline preference (it is an application-window alert). */
export function categoryForUpdateType(type: UpdateType): NotificationCategory {
  return type === "application_start_date" ? "deadline" : categoryForEvent(eventForUpdateType(type));
}

/**
 * An assistance-request STATUS change -> the event it raises. The request
 * status is separate from the official application status: only
 * submitted_on_portal (set after a verified reference/confirmation) maps to an
 * official-application event; form_filled never does.
 *
 *   submitted            -> SUBMITTED
 *   under_review         -> IN_PROGRESS   (an admin started working on it)
 *   in_progress          -> ACCEPTED      ("Accepted / In Progress" is one status)
 *   waiting_for_user     -> WAITING_FOR_USER
 *   awaiting_user_action -> WAITING_FOR_USER  (a step only the user can do)
 *   form_filled          -> FORM_FILLED
 *   submitted_on_portal  -> APPLICATION_STATUS_CHANGED (verified official submission)
 *   completed            -> COMPLETED
 *   rejected             -> REJECTED
 *   cancelled            -> APPLICATION_STATUS_CHANGED
 */
export function eventForRequestStatus(status: RequestStatus): NotificationEvent {
  switch (status) {
    case "submitted": return "APPLICATION_REQUEST_SUBMITTED";
    case "under_review": return "APPLICATION_REQUEST_IN_PROGRESS";
    case "in_progress": return "APPLICATION_REQUEST_ACCEPTED";
    case "waiting_for_user":
    case "awaiting_user_action": return "APPLICATION_REQUEST_WAITING_FOR_USER";
    case "form_filled": return "APPLICATION_REQUEST_FORM_FILLED";
    case "submitted_on_portal": return "APPLICATION_STATUS_CHANGED";
    case "completed": return "APPLICATION_REQUEST_COMPLETED";
    case "rejected": return "APPLICATION_REQUEST_REJECTED";
    case "cancelled": return "APPLICATION_STATUS_CHANGED";
  }
}

// --- Links ------------------------------------------------------------------

/** Only an in-app path is ever stored or followed: no scheme, no host, no
 *  protocol-relative "//", no backslashes, no control characters. */
export function isSafeInternalLink(link: unknown): link is string {
  return (
    typeof link === "string" &&
    link.length > 0 &&
    link.length <= 300 &&
    link.startsWith("/") &&
    !link.startsWith("//") &&
    !link.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(link)
  );
}

export function requestLink(requestId: string): string {
  return `/apply-assistant/${requestId}`;
}
export const UPDATES_LINK = "/updates";
export const DISCOVER_LINK = "/discover";
