import { STATUS_LABEL, type RequestStatus } from "./constants";

export interface TimelineEventLike {
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  official_stage?: string | null;
}

const OFFICIAL_LABEL: Record<string, string> = {
  admit_card: "Admit Card Available",
  exam_completed: "Exam Completed",
  answer_key: "Answer Key Available",
  result: "Result Declared",
  deadline: "Official Last Date Updated",
  notice: "Official Update",
  submitted: "Official Application Submitted",
};

const STATUS_EVENT_LABEL: Partial<Record<RequestStatus, string>> = {
  under_review: "Admin Review Started",
  waiting_for_user: "Additional Information Requested",
  in_progress: "Request Accepted",
  form_filled: "Form Filled",
  awaiting_user_action: "User Review / Action Required",
  submitted_on_portal: "Official Application Submitted",
  completed: "Completed",
  rejected: "Request Rejected",
  cancelled: "Request Cancelled",
};

const OTHER_LABEL: Record<string, string> = {
  submitted: "Request Submitted",
  info_requested: "Additional Information Requested",
  admin_message: "Message from Admin",
  user_reply: "You Replied",
  reference_added: "Official Reference Number Added",
  confirmation_uploaded: "Confirmation Received",
  document_added: "Document Added",
  documents_deleted: "Documents Deleted",
  cancelled_by_user: "You Cancelled the Request",
  form_filling_started: "Form Filling Started",
  user_review_approved: "You Approved the Form — Your Action Required",
  user_changes_requested: "You Asked for Changes",
  user_action_completed: "You Marked Your Step as Done",
  cycle_linked: "Exam Cycle Linked",
  admin_claimed: "Admin Assigned",
  internal_note: "Internal Note",
  document_viewed: "Document Viewed",
  notification_failed: "Notification Failed",
};

/** Human label for a timeline row. Request-status events and official-stage
 *  events are labelled differently on purpose: "Form Filled" is a request
 *  status, never an official submission. */
export function timelineLabel(ev: TimelineEventLike): string {
  if (ev.event_type === "official_update") return OFFICIAL_LABEL[ev.official_stage ?? "notice"] ?? "Official Update";
  if (ev.event_type === "status_changed" && ev.to_status) {
    if (ev.to_status === "in_progress" && (ev.from_status === "form_filled" || ev.from_status === "awaiting_user_action")) {
      return "Back to In Progress";
    }
    if (ev.to_status === "under_review" && ev.from_status === "waiting_for_user") return "Reply Received — Back Under Review";
    return STATUS_EVENT_LABEL[ev.to_status as RequestStatus] ?? STATUS_LABEL[ev.to_status as RequestStatus] ?? ev.to_status;
  }
  return OTHER_LABEL[ev.event_type] ?? ev.event_type.replace(/_/g, " ");
}

/** True for timeline rows that come from official public notices rather than
 *  from the assistance workflow — the UI marks them differently. */
export function isOfficialEvent(ev: TimelineEventLike): boolean {
  return ev.event_type === "official_update";
}
