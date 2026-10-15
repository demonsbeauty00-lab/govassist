// Client-safe labels and text builders for official stage updates.

import { UpdateType } from "../types";

export const STAGE_LABEL: Record<UpdateType, string> = {
  new_notification: "New notification",
  corrigendum: "Corrigendum",
  application_start_date: "Applications open",
  application_end_date_change: "Last date changed",
  exam_date: "Exam date",
  admit_card: "Admit card",
  answer_key: "Answer key",
  response_sheet: "Response sheet",
  objection_window: "Objection window",
  result: "Result",
  cutoff: "Cut-off",
  other: "Official update",
  exam_city_intimation: "Exam city intimation",
  scorecard: "Scorecard",
};

export function noticeTitle(updateType: UpdateType, examName: string, revised: boolean): string {
  const label = STAGE_LABEL[updateType].toLowerCase();
  if (revised) return `${examName} — revised ${label} published`;
  switch (updateType) {
    case "new_notification": return `${examName} — new notification released`;
    case "corrigendum": return `${examName} — corrigendum released`;
    case "application_start_date": return `${examName} — applications are now open`;
    case "application_end_date_change": return `${examName} — application deadline changed`;
    case "exam_date": return `${examName} — exam date announced`;
    case "admit_card": return `${examName} admit card is now available`;
    case "answer_key": return `${examName} answer key has been released`;
    case "response_sheet": return `${examName} — response sheet available`;
    case "objection_window": return `${examName} — objection window is open`;
    case "result": return `${examName} result has been declared`;
    case "cutoff": return `${examName} — official cut-offs published`;
    case "exam_city_intimation": return `${examName} — exam city intimation released`;
    case "scorecard": return `${examName} — scorecard available`;
    default: return `${examName} — official update`;
  }
}

/** The text every alert carries: organization, publication date (only when
 *  known — never a placeholder date) and the official link. */
export function buildNotificationBody(p: {
  organization: string;
  publicationDate: string | null;
  sourceUrl: string;
  title: string;
}): string {
  const parts = [`Official source: ${p.organization}`];
  if (p.publicationDate) parts.push(`Published ${p.publicationDate}`);
  parts.push(p.sourceUrl);
  return `${parts.join(" · ")}. ${p.title}`;
}
