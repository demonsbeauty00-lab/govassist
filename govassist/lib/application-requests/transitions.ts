import type { RequestStatus } from "./constants";

/** Admin-controlled workflow. Terminal states have no outgoing edges. */
const ADMIN_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  submitted: ["under_review", "rejected", "cancelled"],
  under_review: ["waiting_for_user", "in_progress", "rejected", "cancelled"],
  waiting_for_user: ["under_review", "in_progress", "rejected", "cancelled"],
  in_progress: ["waiting_for_user", "completed", "rejected", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
};

export function canAdminTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ADMIN_TRANSITIONS[from].includes(to);
}

export function allowedAdminTargets(from: RequestStatus): RequestStatus[] {
  return ADMIN_TRANSITIONS[from];
}

/** Users may cancel only before processing has started. */
export function canUserCancel(status: RequestStatus): boolean {
  return status === "submitted" || status === "under_review" || status === "waiting_for_user";
}

export function canUserReply(status: RequestStatus): boolean {
  return status === "waiting_for_user";
}

export interface AdminTransitionInput {
  from: RequestStatus;
  to: RequestStatus;
  message: string | null;
  officialReferenceNumber: string | null;
  hasConfirmationDocument: boolean;
}

/** Server-side validation of one admin status change. Returns an error
 *  string, or null when the change is allowed. */
export function validateAdminTransition(i: AdminTransitionInput): string | null {
  if (i.from === i.to) return "The request is already in that status.";
  if (!canAdminTransition(i.from, i.to)) return "That status change isn't allowed from the current status.";
  const msg = i.message?.trim() ?? "";
  if (i.to === "waiting_for_user" && !msg) return "Tell the applicant what information is missing.";
  if (i.to === "rejected" && !msg) return "Give the applicant a reason for rejecting.";
  if (i.to === "completed" && !i.officialReferenceNumber?.trim() && !i.hasConfirmationDocument) {
    return "To mark as completed, add the official reference number or upload the confirmation document.";
  }
  return null;
}
