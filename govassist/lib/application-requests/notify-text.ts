import { STATUS_LABEL, type RequestStatus } from "./constants";
import { ASSIST_PHONE_DISPLAY } from "./contact";

// In-app notification wording. Deliberately GENERIC: it never repeats the
// admin's free-text message, document names or any applicant data, so
// nothing sensitive can end up in a notification list. The details are
// inside the request, behind the applicant's login.

const BODY: Partial<Record<RequestStatus, string>> = {
  under_review: "An admin has started reviewing your request.",
  waiting_for_user: "The admin needs more information from you. Open your request to reply.",
  in_progress: "Your request was accepted and is being worked on.",
  form_filled: "Your form has been filled. Please open your request to review it and see what to do next.",
  awaiting_user_action: "A step is waiting for you (for example declaration, payment, OTP/CAPTCHA or final submit). Open your request for instructions.",
  submitted_on_portal: "The admin confirmed your application was submitted on the official portal.",
  completed: "Your request is completed.",
  rejected: "Your request could not be processed. Open it to see the reason.",
  cancelled: "Your request was cancelled.",
};

export function statusNotificationBody(to: RequestStatus): string {
  return BODY[to] ?? `Your request status is now ${STATUS_LABEL[to]}.`;
}

export const MESSAGE_NOTIFICATION_BODY = "The admin sent you a message. Open your request to read it.";
export const CONFIRMATION_NOTIFICATION_BODY = "A confirmation document was added to your request.";
export const FORM_FILLING_NOTIFICATION_BODY = "An admin has started filling your form.";
export const OFFICIAL_STAGE_NOTIFICATION_BODY = "An official exam stage update was recorded on your request.";

// ---------------------------------------------------------------------------
// Title + body per status change (Phase 11 follow-up). Same rules as above:
// generic wording, no free text. Additionally, NOTHING here claims the
// application was submitted on the official portal unless `officiallySubmitted`
// is true, which callers derive only from a status/record that an admin set
// after verifying a reference number or confirmation document.
// ---------------------------------------------------------------------------

export interface StatusNotificationInput {
  status: RequestStatus;
  requestCode: string;
  /** Verified official submission is recorded for this request. */
  officiallySubmitted: boolean;
}

const NOT_YET_OFFICIAL = "It has not been submitted on the official portal.";

export function buildStatusNotification(i: StatusNotificationInput): { title: string; body: string } {
  const code = i.requestCode;
  switch (i.status) {
    case "submitted":
      return {
        title: `Request ${code} submitted`,
        body: `We received your request and an admin will pick it up. ${NOT_YET_OFFICIAL} Need faster help? WhatsApp, call or SMS ${ASSIST_PHONE_DISPLAY} and quote ${code}.`,
      };
    case "under_review":
      return { title: `Request ${code} is under review`, body: "An admin has started reviewing your request." };
    case "in_progress":
      return {
        title: `Request ${code} accepted and in progress`,
        body: `Your request was accepted and is being worked on. ${i.officiallySubmitted ? "" : NOT_YET_OFFICIAL}`.trim(),
      };
    case "waiting_for_user":
      return { title: `Request ${code} needs your information`, body: BODY.waiting_for_user as string };
    case "form_filled":
      return {
        title: `Request ${code}: form filled, please review`,
        body: `Your form has been filled. Please open your request to review it and see what to do next. ${NOT_YET_OFFICIAL}`,
      };
    case "awaiting_user_action":
      return { title: `Request ${code} needs your action`, body: BODY.awaiting_user_action as string };
    case "submitted_on_portal":
      // The one status that claims official submission: only with verification.
      return i.officiallySubmitted
        ? { title: `Request ${code}: submission confirmed`, body: BODY.submitted_on_portal as string }
        : { title: `Update on your request ${code}`, body: "Your request was updated. Open it to see the details." };
    case "completed":
      return {
        title: `Request ${code} completed`,
        body: i.officiallySubmitted
          ? "Your request is completed. An admin confirmed the official submission."
          : "Your assistance request is completed. This does not mean an application was submitted on the official portal.",
      };
    case "rejected":
      return { title: `Request ${code} could not be processed`, body: BODY.rejected as string };
    case "cancelled":
      return { title: `Request ${code} cancelled`, body: BODY.cancelled as string };
  }
}

/** Title + body for events that are not a status change (message, form
 *  filling started, confirmation added, official stage recorded). */
export function genericRequestNotification(requestCode: string, body: string): { title: string; body: string } {
  return { title: `Update on your request ${requestCode}`, body };
}
