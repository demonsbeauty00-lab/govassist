import { STATUS_LABEL, type RequestStatus } from "./constants";

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
