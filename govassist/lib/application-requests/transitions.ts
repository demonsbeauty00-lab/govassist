import type { AssistanceType, RequestStatus } from "./constants";

/** Admin-controlled workflow. Terminal states have no outgoing edges.
 *
 *  full_application path:
 *    submitted → under_review → in_progress → form_filled
 *      → (applicant reviews) → awaiting_user_action → submitted_on_portal → completed
 *  "form_filled" is NOT an official submission; only submitted_on_portal is,
 *  and that needs a verified reference number or confirmation document. */
const ADMIN_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  submitted: ["under_review", "rejected", "cancelled"],
  under_review: ["waiting_for_user", "in_progress", "rejected", "cancelled"],
  waiting_for_user: ["under_review", "in_progress", "rejected", "cancelled"],
  in_progress: ["waiting_for_user", "form_filled", "awaiting_user_action", "submitted_on_portal", "rejected", "cancelled"],
  form_filled: ["in_progress", "awaiting_user_action", "waiting_for_user", "rejected", "cancelled"],
  awaiting_user_action: ["in_progress", "submitted_on_portal", "waiting_for_user", "rejected", "cancelled"],
  submitted_on_portal: ["completed"],
  completed: [],
  rejected: [],
  cancelled: [],
};

/** Assistance types where nothing is ever submitted on a portal by us, so
 *  the request may be completed straight from in_progress with a summary. */
const NO_PORTAL_SUBMISSION: AssistanceType[] = ["form_review", "document_check"];

export function canAdminTransition(from: RequestStatus, to: RequestStatus, assistanceType?: AssistanceType): boolean {
  if (ADMIN_TRANSITIONS[from].includes(to)) return true;
  return from === "in_progress" && to === "completed" && !!assistanceType && NO_PORTAL_SUBMISSION.includes(assistanceType);
}

export function allowedAdminTargets(from: RequestStatus, assistanceType?: AssistanceType): RequestStatus[] {
  const base = ADMIN_TRANSITIONS[from];
  if (from === "in_progress" && assistanceType && NO_PORTAL_SUBMISSION.includes(assistanceType)) {
    return [...base.filter((s) => s !== "form_filled" && s !== "submitted_on_portal"), "completed"];
  }
  return base;
}

/** Users may cancel only before the form has been filled/submitted. */
export function canUserCancel(status: RequestStatus): boolean {
  return status === "submitted" || status === "under_review" || status === "waiting_for_user";
}

export function canUserReply(status: RequestStatus): boolean {
  return status === "waiting_for_user";
}

/** Applicant reviews the filled form: approve it or ask for changes. */
export function canUserReviewForm(status: RequestStatus): boolean {
  return status === "form_filled";
}

/** Applicant says they finished the step only they can do. */
export function canUserCompleteAction(status: RequestStatus): boolean {
  return status === "awaiting_user_action";
}

export interface AdminTransitionInput {
  from: RequestStatus;
  to: RequestStatus;
  message: string | null;
  officialReferenceNumber: string | null;
  hasConfirmationDocument: boolean;
  assistanceType?: AssistanceType;
  /** application_deadline is a past date (YYYY-MM-DD < today). */
  deadlinePassed?: boolean;
}

/** Statuses that need an instruction/explanation for the applicant. */
const MESSAGE_REQUIRED: Partial<Record<RequestStatus, string>> = {
  waiting_for_user: "Tell the applicant what information is missing.",
  rejected: "Give the applicant a reason for rejecting.",
  form_filled: "Tell the applicant what to review and what they must do next.",
  awaiting_user_action: "Tell the applicant exactly what they must do (declaration, payment, OTP/CAPTCHA or final submit).",
};

/** Server-side validation of one admin status change. Returns an error
 *  string, or null when the change is allowed. */
export function validateAdminTransition(i: AdminTransitionInput): string | null {
  if (i.from === i.to) return "The request is already in that status.";
  if (!canAdminTransition(i.from, i.to, i.assistanceType)) return "That status change isn't allowed from the current status.";
  const msg = i.message?.trim() ?? "";
  const need = MESSAGE_REQUIRED[i.to];
  if (need && !msg) return need;

  if (i.deadlinePassed && i.to === "in_progress" && (i.from === "under_review" || i.from === "waiting_for_user")) {
    return "The last date the applicant gave has already passed. Reject the request with a reason, or ask the applicant to confirm the correct date first.";
  }
  if (i.to === "submitted_on_portal" && !i.officialReferenceNumber?.trim() && !i.hasConfirmationDocument) {
    return "Only mark as submitted once confirmed: add the official reference number or upload the confirmation document.";
  }
  if (i.to === "completed" && i.from === "in_progress" && !msg) {
    return "Add a short summary of what was done for the applicant.";
  }
  return null;
}
