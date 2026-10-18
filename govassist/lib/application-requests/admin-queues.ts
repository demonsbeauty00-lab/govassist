// Pure: how the admin dashboard groups manual-assistance requests, and what
// "overdue" means. No I/O.

import { REQUEST_STATUSES, TERMINAL_STATUSES, type RequestStatus } from "./constants";

export const OPEN_STATUSES: RequestStatus[] = REQUEST_STATUSES.filter(
  (s) => !TERMINAL_STATUSES.includes(s) && s !== "submitted_on_portal",
);

export interface RequestForQueue { status: string; application_deadline: string | null }

function isOpen(status: string): boolean {
  return (OPEN_STATUSES as string[]).includes(status);
}

/**
 * Overdue = still being worked on (not completed, rejected, cancelled, or
 * verified as submitted on the portal) although the official last date
 * (as the applicant entered it) has passed. A request with no deadline is
 * never "overdue": GovAssist does not invent one.
 */
export function isOverdueRequest(r: RequestForQueue, today: string): boolean {
  return isOpen(r.status) && r.application_deadline !== null && r.application_deadline < today;
}

export type DeadlineUrgency = "overdue" | "today" | "soon" | "later" | "none";

export function deadlineUrgency(r: RequestForQueue, today: string): DeadlineUrgency {
  if (!isOpen(r.status) || !r.application_deadline) return "none";
  if (r.application_deadline < today) return "overdue";
  const days = Math.round((Date.parse(`${r.application_deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return "today";
  return days <= 3 ? "soon" : "later";
}

/** Admin-facing queue names (the applicant-facing STATUS_LABELs say "you"). */
export const ADMIN_STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: "Pending",
  under_review: "Under review",
  in_progress: "In progress",
  waiting_for_user: "Waiting for user",
  awaiting_user_action: "Needs user action",
  form_filled: "Form filled – awaiting user review",
  submitted_on_portal: "Submitted on portal (verified)",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export interface QueueCounts { byStatus: Record<RequestStatus, number>; overdue: number; open: number }

export function countQueues(rows: RequestForQueue[], today: string): QueueCounts {
  const byStatus = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<RequestStatus, number>;
  let overdue = 0;
  let open = 0;
  for (const r of rows) {
    if ((REQUEST_STATUSES as readonly string[]).includes(r.status)) byStatus[r.status as RequestStatus] += 1;
    if (isOpen(r.status)) open += 1;
    if (isOverdueRequest(r, today)) overdue += 1;
  }
  return { byStatus, overdue, open };
}

/** Most urgent first: overdue, then nearest deadline, then no deadline; ties by oldest first. */
export function compareByUrgency(
  a: RequestForQueue & { created_at: string },
  b: RequestForQueue & { created_at: string },
): number {
  const rank = (r: RequestForQueue) => (r.application_deadline === null ? "9999-99-99" : r.application_deadline);
  const byDeadline = rank(a).localeCompare(rank(b));
  return byDeadline !== 0 ? byDeadline : a.created_at.localeCompare(b.created_at);
}
