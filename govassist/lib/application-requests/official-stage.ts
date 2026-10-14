import { OFFICIAL_STAGES, OFFICIAL_STAGE_LABEL, TERMINAL_STATUSES, type OfficialStage, type RequestStatus } from "./constants";

// Pure rules for how a VERIFIED official update (from Phase 5.5 source
// monitoring) affects an assistance request. Nothing here reads or claims an
// individual application status on an official portal: stages only advance
// from what an official public notice says for the exam cycle, and only for
// a request whose official submission was already confirmed by an admin.

export type OfficialUpdateType =
  | "new_notification" | "corrigendum" | "application_start_date" | "application_end_date_change"
  | "exam_date" | "admit_card" | "answer_key" | "response_sheet" | "objection_window" | "result" | "cutoff" | "other";

export type EventStage = "admit_card" | "exam_completed" | "answer_key" | "result" | "deadline" | "notice";

const STAGE_FOR_UPDATE: Partial<Record<OfficialUpdateType, "admit_card" | "answer_key" | "result">> = {
  admit_card: "admit_card",
  answer_key: "answer_key",
  result: "result",
};

const NOTICE_TYPES: OfficialUpdateType[] = ["corrigendum", "exam_date", "response_sheet", "objection_window", "cutoff"];

export function stageRank(stage: OfficialStage): number {
  return OFFICIAL_STAGES.indexOf(stage);
}

/** Forward-only, and never from "not_submitted" (a request that was not
 *  confirmed as submitted must not be shown as having reached a later stage). */
export function canAdvanceOfficialStage(current: OfficialStage, next: OfficialStage): boolean {
  if (current === "not_submitted") return next === "submitted";
  return stageRank(next) > stageRank(current);
}

export function isOfficiallySubmitted(status: RequestStatus): boolean {
  return status === "submitted_on_portal" || status === "completed";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface OfficialUpdateInput {
  updateId: string;
  updateType: OfficialUpdateType;
  examName: string;
  publicationDate: string | null;
  requestId: string;
  requestStatus: RequestStatus;
  requestStage: OfficialStage;
  requestDeadline: string | null;
}

export interface OfficialUpdatePlan {
  eventStage: EventStage;
  eventMessage: string;
  newStage: OfficialStage | null;
  newDeadline: string | null;
  notificationTitle: string;
  notificationBody: string;
  /** Same key notifyRelevantUsers uses, so one user never gets two alerts. */
  notificationDedupeKey: string;
  eventDedupeKey: string;
}

const NOT_A_PORTAL_CHECK = "This is from an official public notice for the exam — GovAssist has not checked your individual application on the portal.";

/** Returns null when the update is irrelevant to this request (closed
 *  request, or an update type that doesn't concern an applicant). */
export function planOfficialUpdate(i: OfficialUpdateInput): OfficialUpdatePlan | null {
  if ((TERMINAL_STATUSES as RequestStatus[]).includes(i.requestStatus) && i.requestStatus !== "completed") return null;

  const common = {
    notificationDedupeKey: `update:${i.updateId}`,
    eventDedupeKey: `official:${i.updateId}`,
  };
  const submitted = isOfficiallySubmitted(i.requestStatus);

  // Deadline change: only while the application hasn't been officially submitted.
  if (i.updateType === "application_end_date_change") {
    if (submitted) return null;
    if (!i.publicationDate || !ISO_DATE.test(i.publicationDate)) return null;
    if (i.publicationDate === i.requestDeadline) return null;
    return {
      ...common,
      eventStage: "deadline",
      eventMessage: `The official last date for ${i.examName} was updated to ${i.publicationDate}. ${NOT_A_PORTAL_CHECK}`,
      newStage: null,
      newDeadline: i.publicationDate,
      notificationTitle: `${i.examName}: official last date changed`,
      notificationBody: `The official last date is now ${i.publicationDate}. Check your request for details.`,
    };
  }

  const stage = STAGE_FOR_UPDATE[i.updateType];
  if (stage) {
    // Only an officially submitted request can advance; otherwise it is just a notice.
    const advance = submitted && canAdvanceOfficialStage(
      i.requestStage === "not_submitted" ? "submitted" : i.requestStage, stage,
    );
    const label = OFFICIAL_STAGE_LABEL[stage];
    return {
      ...common,
      eventStage: stage,
      eventMessage: advance
        ? `${label} for ${i.examName}. ${NOT_A_PORTAL_CHECK}`
        : `${label} for ${i.examName} (official notice). ${submitted ? "" : "Your request is not recorded as officially submitted, so its stage was not changed. "}${NOT_A_PORTAL_CHECK}`,
      newStage: advance ? stage : null,
      newDeadline: null,
      notificationTitle: `${i.examName}: ${label.toLowerCase()}`,
      notificationBody: `An official notice was published. Open your request for details.`,
    };
  }

  if (NOTICE_TYPES.includes(i.updateType)) {
    return {
      ...common,
      eventStage: "notice",
      eventMessage: `An official update was published for ${i.examName}. ${NOT_A_PORTAL_CHECK}`,
      newStage: null,
      newDeadline: null,
      notificationTitle: `${i.examName}: official update`,
      notificationBody: `An official notice was published for this exam. Open your request for details.`,
    };
  }
  return null;
}
