// Single source of truth for Manual Application Assistance. Must stay in
// sync with the check constraints in 0016_application_requests.sql.

export const REQUEST_STATUSES = [
  "submitted", "under_review", "waiting_for_user", "in_progress", "completed", "rejected", "cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  waiting_for_user: "Waiting for You",
  in_progress: "In Progress",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const ACTIVE_STATUSES: RequestStatus[] = ["submitted", "under_review", "waiting_for_user", "in_progress"];
export const TERMINAL_STATUSES: RequestStatus[] = ["completed", "rejected", "cancelled"];

export const ASSISTANCE_TYPES = ["full_application", "form_review", "document_check"] as const;
export type AssistanceType = (typeof ASSISTANCE_TYPES)[number];
export const ASSISTANCE_LABEL: Record<AssistanceType, string> = {
  full_application: "Fill my application form for me",
  form_review: "Review my application before I submit",
  document_check: "Check my documents against the requirements",
};

export const CONSENT_VERSION = "2026-10-v1";
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
