// ---------------------------------------------------------------------------
// Notification status — like the eligibility engine, a pure function of
// dates. Same reasoning applies: deterministic, no I/O, and a single value
// a person can sanity-check against the dates shown right next to it.
//
// Status reflects the single most relevant thing happening with a cycle
// right now, in priority order — a result declared matters more than
// whether it was "new" three months ago, so later checks win.
// ---------------------------------------------------------------------------

import { ExamCycle, ImportantDate } from "@/lib/types";

export type NotificationStatus =
  | "new"
  | "applications_open"
  | "closing_soon"
  | "closed"
  | "exam_upcoming"
  | "result_released";

export const NOTIFICATION_STATUS_LABEL: Record<NotificationStatus, string> = {
  new: "New",
  applications_open: "Applications Open",
  closing_soon: "Closing Soon",
  closed: "Closed",
  exam_upcoming: "Exam Upcoming",
  result_released: "Result Released",
};

const NEW_WINDOW_DAYS = 7;
const CLOSING_SOON_WINDOW_DAYS = 7;

const NON_EXAM_DATE_LABEL_PATTERN = /notification|application|admit card|answer key|result/i;
const EXAM_DATE_LABEL_PATTERN = /exam|tier|prelim|mains|cbt|stage/i;

/** Best-effort: picks the exam-sitting date out of importantDates by label,
 *  since the exam catalog doesn't (yet) carry a single dedicated exam-date
 *  field — see lib/types.ts. Not used for anything but display/status; the
 *  eligibility engine never depends on this. */
export function deriveExamDate(importantDates: ImportantDate[]): string | null {
  const candidates = importantDates.filter(
    (d) => EXAM_DATE_LABEL_PATTERN.test(d.label) && !NON_EXAM_DATE_LABEL_PATTERN.test(d.label)
  );
  if (candidates.length === 0) return null;
  // Earliest exam-labeled date — the first sitting is what "exam upcoming" should track.
  return candidates.reduce((earliest, d) => (d.date < earliest.date ? d : earliest)).date;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.ceil((new Date(toIso).getTime() - new Date(fromIso).getTime()) / (1000 * 60 * 60 * 24));
}

export function computeNotificationStatus(exam: ExamCycle, now: Date = new Date()): NotificationStatus {
  const nowIso = now.toISOString();
  const examDate = deriveExamDate(exam.importantDates);

  if (exam.resultDate && nowIso >= exam.resultDate) {
    return "result_released";
  }

  const applicationsClosed = exam.applicationWindow.status === "closed";

  if (applicationsClosed) {
    if (examDate && nowIso < examDate) return "exam_upcoming";
    return "closed";
  }

  if (exam.applicationWindow.status === "closing_soon") {
    return "closing_soon";
  }
  // Belt-and-suspenders: recompute closing-soon from the actual end date too,
  // in case applicationWindow.status is stale relative to `now`.
  if (daysBetween(nowIso, exam.applicationWindow.endDate) <= CLOSING_SOON_WINDOW_DAYS) {
    return "closing_soon";
  }

  if (daysBetween(exam.notificationDate, nowIso) <= NEW_WINDOW_DAYS) {
    return "new";
  }

  return "applications_open";
}
