// Single source of truth for Manual Application Assistance. Must stay in
// sync with the check constraints in 0016_application_requests.sql.

export const REQUEST_STATUSES = [
  "submitted", "under_review", "waiting_for_user", "in_progress", "form_filled",
  "awaiting_user_action", "submitted_on_portal", "completed", "rejected", "cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  waiting_for_user: "Waiting for You",
  in_progress: "Accepted / In Progress",
  form_filled: "Form Filled — Awaiting Your Review",
  awaiting_user_action: "Awaiting Your Action",
  submitted_on_portal: "Submitted on Official Portal",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const ACTIVE_STATUSES: RequestStatus[] = [
  "submitted", "under_review", "waiting_for_user", "in_progress", "form_filled", "awaiting_user_action", "submitted_on_portal",
];
export const TERMINAL_STATUSES: RequestStatus[] = ["completed", "rejected", "cancelled"];

export const ASSISTANCE_TYPES = ["full_application", "form_review", "document_check"] as const;
export type AssistanceType = (typeof ASSISTANCE_TYPES)[number];
export const ASSISTANCE_LABEL: Record<AssistanceType, string> = {
  full_application: "Fill my application form for me",
  form_review: "Review my application before I submit",
  document_check: "Check my documents against the requirements",
};

/** Status of the OFFICIAL exam application — separate from the request status.
 *  Only moves forward; "form filled" never sets it past not_submitted. */
export const OFFICIAL_STAGES = ["not_submitted", "submitted", "admit_card", "exam_completed", "answer_key", "result"] as const;
export type OfficialStage = (typeof OFFICIAL_STAGES)[number];
export const OFFICIAL_STAGE_LABEL: Record<OfficialStage, string> = {
  not_submitted: "Not submitted on the official portal",
  submitted: "Official application submitted",
  admit_card: "Admit card available",
  exam_completed: "Exam completed",
  answer_key: "Answer key available",
  result: "Result declared",
};

/** Plain-language service terms shown before submission. No fee is charged
 *  by this app — payment is not implemented, so none is shown or assumed. */
export const SERVICE_TERMS = [
  "An admin fills the official form manually using what you provide. GovAssist does not log in to portals automatically.",
  "You must review the filled form and personally handle the declaration, any fee payment, OTP/CAPTCHA and the final submit.",
  "Your application counts as submitted only after the admin records an official reference number or confirmation document.",
  "No fee is collected through GovAssist. Any official application fee is paid by you on the official portal.",
];

export const CONSENT_VERSION = "2026-10-v2";
export const CONSENT_TEXT =
  "I authorise a GovAssist administrator to view the details and documents I provide here, only to process this " +
  "request. I understand GovAssist will not know my official portal password, OTP or payment details and I must never " +
  "share them. I understand an application is only submitted once an admin confirms it in this request, and that I " +
  "can delete my uploaded documents after the request is closed.";

export const DOCUMENT_REASON =
  "Upload only what this request needs (for example photo, signature, category certificate). Admins use these files " +
  "solely to complete the official form on your behalf.";

// Uploads
export const MAX_FILES_PER_REQUEST = 4;
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_UPLOAD_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export type AllowedMime = (typeof ALLOWED_UPLOAD_MIME)[number];

export const RETENTION_DAYS = 90;
export const SIGNED_URL_SECONDS = 120;
