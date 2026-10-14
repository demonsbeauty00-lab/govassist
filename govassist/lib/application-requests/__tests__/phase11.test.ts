import { describe, it, expect } from "vitest";
import {
  ACTIVE_STATUSES, OFFICIAL_STAGES, REQUEST_STATUSES, STATUS_LABEL, TERMINAL_STATUSES,
} from "../constants";
import {
  allowedAdminTargets, canAdminTransition, canUserCancel, canUserCompleteAction, canUserReviewForm,
  validateAdminTransition,
} from "../transitions";
import { canAdvanceOfficialStage, isOfficiallySubmitted, planOfficialUpdate, stageRank } from "../official-stage";
import { isOfficialEvent, timelineLabel } from "../timeline";
import { statusNotificationBody } from "../notify-text";
import {
  actionDoneSchema, createRequestSchema, isPastDateIST, officialStageSchema, requestChangesSchema, todayIST,
} from "../schema";
import { sniffMime } from "../file-validation";

const REQ = "5f0c2d8e-6b3a-4c1e-9d6a-1a2b3c4d5e6f";
const noRef = { officialReferenceNumber: null, hasConfirmationDocument: false };

describe("Phase 11 statuses", () => {
  it("has all ten statuses with labels, and active + terminal cover them exactly", () => {
    expect(REQUEST_STATUSES).toHaveLength(10);
    for (const s of REQUEST_STATUSES) expect(STATUS_LABEL[s]).toBeTruthy();
    expect([...ACTIVE_STATUSES, ...TERMINAL_STATUSES].sort()).toEqual([...REQUEST_STATUSES].sort());
  });
  it("labels form_filled so it can't be read as submitted", () => {
    expect(STATUS_LABEL.form_filled).toMatch(/Awaiting/);
    expect(STATUS_LABEL.submitted_on_portal).toBe("Submitted on Official Portal");
  });
});

describe("Phase 11 transitions", () => {
  it("walks the full manual path", () => {
    const path = ["submitted", "under_review", "in_progress", "form_filled", "awaiting_user_action", "submitted_on_portal", "completed"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canAdminTransition(path[i]!, path[i + 1]!)).toBe(true);
  });
  it("never lets form_filled jump to submitted_on_portal or completed", () => {
    expect(canAdminTransition("form_filled", "submitted_on_portal")).toBe(false);
    expect(canAdminTransition("form_filled", "completed")).toBe(false);
    expect(canAdminTransition("in_progress", "completed", "full_application")).toBe(false);
  });
  it("lets non-submitting assistance types complete from in_progress", () => {
    expect(canAdminTransition("in_progress", "completed", "document_check")).toBe(true);
    expect(allowedAdminTargets("in_progress", "document_check")).not.toContain("form_filled");
    expect(allowedAdminTargets("in_progress", "full_application")).not.toContain("completed");
  });
  it("terminal states have no way out", () => {
    for (const t of TERMINAL_STATUSES) {
      if (t === "completed" || t === "rejected" || t === "cancelled") expect(allowedAdminTargets(t)).toHaveLength(0);
    }
  });
  it("requires instructions for form_filled and awaiting_user_action", () => {
    expect(validateAdminTransition({ from: "in_progress", to: "form_filled", message: " ", ...noRef })).not.toBeNull();
    expect(validateAdminTransition({ from: "in_progress", to: "form_filled", message: "Check name and DOB", ...noRef })).toBeNull();
    expect(validateAdminTransition({ from: "form_filled", to: "awaiting_user_action", message: null, ...noRef })).not.toBeNull();
  });
  it("only confirms submission with a reference or confirmation document", () => {
    const base = { from: "awaiting_user_action" as const, to: "submitted_on_portal" as const, message: null };
    expect(validateAdminTransition({ ...base, ...noRef })).not.toBeNull();
    expect(validateAdminTransition({ ...base, officialReferenceNumber: "ABC123", hasConfirmationDocument: false })).toBeNull();
    expect(validateAdminTransition({ ...base, officialReferenceNumber: null, hasConfirmationDocument: true })).toBeNull();
  });
  it("blocks accepting a request whose deadline already passed", () => {
    const err = validateAdminTransition({ from: "under_review", to: "in_progress", message: null, ...noRef, deadlinePassed: true });
    expect(err).toMatch(/passed/);
    expect(validateAdminTransition({ from: "under_review", to: "rejected", message: "Deadline passed", ...noRef, deadlinePassed: true })).toBeNull();
  });
  it("defines exactly what the applicant may do", () => {
    expect(canUserReviewForm("form_filled")).toBe(true);
    expect(canUserReviewForm("in_progress")).toBe(false);
    expect(canUserCompleteAction("awaiting_user_action")).toBe(true);
    expect(canUserCompleteAction("form_filled")).toBe(false);
    expect(canUserCancel("form_filled")).toBe(false);
    expect(canUserCancel("submitted_on_portal")).toBe(false);
  });
});

describe("official stage (separate from request status)", () => {
  it("only advances forward, and only after a confirmed submission", () => {
    expect(canAdvanceOfficialStage("not_submitted", "admit_card")).toBe(false);
    expect(canAdvanceOfficialStage("not_submitted", "submitted")).toBe(true);
    expect(canAdvanceOfficialStage("submitted", "admit_card")).toBe(true);
    expect(canAdvanceOfficialStage("result", "admit_card")).toBe(false);
    expect(canAdvanceOfficialStage("answer_key", "answer_key")).toBe(false);
    expect(stageRank("result")).toBe(OFFICIAL_STAGES.length - 1);
  });
  it("form_filled / awaiting_user_action are not official submission", () => {
    expect(isOfficiallySubmitted("form_filled")).toBe(false);
    expect(isOfficiallySubmitted("awaiting_user_action")).toBe(false);
    expect(isOfficiallySubmitted("submitted_on_portal")).toBe(true);
    expect(isOfficiallySubmitted("completed")).toBe(true);
  });
});

describe("planOfficialUpdate", () => {
  const base = { updateId: "u1", examName: "SSC CGL", publicationDate: "2026-11-01", requestId: REQ, requestDeadline: "2026-10-30" };
  it("advances the stage for a confirmed-submitted request and says it was not a portal check", () => {
    const p = planOfficialUpdate({ ...base, updateType: "admit_card", requestStatus: "submitted_on_portal", requestStage: "submitted" });
    expect(p?.newStage).toBe("admit_card");
    expect(p?.eventStage).toBe("admit_card");
    expect(p?.eventMessage).toMatch(/not checked your individual application/);
  });
  it("records a notice but does NOT advance a request that wasn't officially submitted", () => {
    const p = planOfficialUpdate({ ...base, updateType: "result", requestStatus: "form_filled", requestStage: "not_submitted" });
    expect(p?.newStage).toBeNull();
    expect(p?.eventMessage).toMatch(/not recorded as officially submitted/);
  });
  it("never moves the stage backwards", () => {
    const p = planOfficialUpdate({ ...base, updateType: "admit_card", requestStatus: "completed", requestStage: "result" });
    expect(p?.newStage).toBeNull();
  });
  it("updates the deadline only for unsubmitted requests and only with a valid date", () => {
    const open = planOfficialUpdate({ ...base, updateType: "application_end_date_change", requestStatus: "in_progress", requestStage: "not_submitted" });
    expect(open?.newDeadline).toBe("2026-11-01");
    expect(open?.eventStage).toBe("deadline");
    expect(planOfficialUpdate({ ...base, updateType: "application_end_date_change", requestStatus: "submitted_on_portal", requestStage: "submitted" })).toBeNull();
    expect(planOfficialUpdate({ ...base, updateType: "application_end_date_change", requestStatus: "in_progress", requestStage: "not_submitted", publicationDate: null })).toBeNull();
    expect(planOfficialUpdate({ ...base, updateType: "application_end_date_change", requestStatus: "in_progress", requestStage: "not_submitted", publicationDate: "soon" })).toBeNull();
    expect(planOfficialUpdate({ ...base, updateType: "application_end_date_change", requestStatus: "in_progress", requestStage: "not_submitted", publicationDate: "2026-10-30" })).toBeNull();
  });
  it("ignores rejected/cancelled requests and irrelevant update types", () => {
    expect(planOfficialUpdate({ ...base, updateType: "result", requestStatus: "rejected", requestStage: "not_submitted" })).toBeNull();
    expect(planOfficialUpdate({ ...base, updateType: "result", requestStatus: "cancelled", requestStage: "not_submitted" })).toBeNull();
    expect(planOfficialUpdate({ ...base, updateType: "new_notification", requestStatus: "in_progress", requestStage: "not_submitted" })).toBeNull();
  });
  it("uses stable dedupe keys so a repeat can't notify or record twice", () => {
    const p = planOfficialUpdate({ ...base, updateType: "answer_key", requestStatus: "submitted_on_portal", requestStage: "submitted" });
    expect(p?.notificationDedupeKey).toBe("update:u1");
    expect(p?.eventDedupeKey).toBe("official:u1");
  });
  it("keeps sensitive details out of notification text", () => {
    const p = planOfficialUpdate({ ...base, updateType: "result", requestStatus: "submitted_on_portal", requestStage: "submitted" });
    expect(`${p?.notificationTitle} ${p?.notificationBody}`).not.toMatch(/aadhaar|passport|pan|@|\d{10}/i);
  });
});

describe("timeline labels", () => {
  it("maps the required timeline events", () => {
    expect(timelineLabel({ event_type: "submitted" })).toBe("Request Submitted");
    expect(timelineLabel({ event_type: "status_changed", to_status: "under_review", from_status: "submitted" })).toBe("Admin Review Started");
    expect(timelineLabel({ event_type: "info_requested", to_status: "waiting_for_user" })).toBe("Additional Information Requested");
    expect(timelineLabel({ event_type: "status_changed", to_status: "in_progress", from_status: "under_review" })).toBe("Request Accepted");
    expect(timelineLabel({ event_type: "form_filling_started" })).toBe("Form Filling Started");
    expect(timelineLabel({ event_type: "status_changed", to_status: "form_filled" })).toBe("Form Filled");
    expect(timelineLabel({ event_type: "status_changed", to_status: "awaiting_user_action" })).toBe("User Review / Action Required");
    expect(timelineLabel({ event_type: "status_changed", to_status: "submitted_on_portal" })).toBe("Official Application Submitted");
    expect(timelineLabel({ event_type: "confirmation_uploaded" })).toBe("Confirmation Received");
    expect(timelineLabel({ event_type: "official_update", official_stage: "admit_card" })).toBe("Admit Card Available");
    expect(timelineLabel({ event_type: "official_update", official_stage: "exam_completed" })).toBe("Exam Completed");
    expect(timelineLabel({ event_type: "official_update", official_stage: "answer_key" })).toBe("Answer Key Available");
    expect(timelineLabel({ event_type: "official_update", official_stage: "result" })).toBe("Result Declared");
  });
  it("distinguishes 'Form Filled' from an official submission", () => {
    expect(timelineLabel({ event_type: "status_changed", to_status: "form_filled" }))
      .not.toBe(timelineLabel({ event_type: "status_changed", to_status: "submitted_on_portal" }));
  });
  it("flags official events and returns a readable fallback for unknown types", () => {
    expect(isOfficialEvent({ event_type: "official_update" })).toBe(true);
    expect(isOfficialEvent({ event_type: "status_changed" })).toBe(false);
    expect(timelineLabel({ event_type: "some_new_type" })).toBe("some new type");
  });
});

describe("notification text", () => {
  it("is generic for every status and never echoes free text", () => {
    for (const s of REQUEST_STATUSES) {
      const body = statusNotificationBody(s);
      expect(body.length).toBeGreaterThan(10);
      expect(body).not.toMatch(/\d{6,}/);
    }
    expect(statusNotificationBody("form_filled")).toMatch(/review/i);
    expect(statusNotificationBody("waiting_for_user")).toMatch(/information/i);
  });
});

describe("Phase 11 input rules", () => {
  const VALID = { examSlug: "ssc-cgl-2026", assistanceType: "full_application", applicantName: "Asha", applicantPhone: "9876543210", consent: true };
  it("rejects a deadline in the past and accepts a future one", () => {
    expect(isPastDateIST("2000-01-01")).toBe(true);
    expect(todayIST(new Date("2026-10-13T20:00:00Z"))).toBe("2026-10-14"); // IST is already the next day
    expect(createRequestSchema.safeParse({ ...VALID, applicationDeadline: "2000-01-01" }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...VALID, applicationDeadline: "2999-01-01" }).success).toBe(true);
  });
  it("validates the official application link and cycle id", () => {
    expect(createRequestSchema.safeParse({ ...VALID, officialApplicationUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...VALID, officialApplicationUrl: "https://ssc.gov.in/apply" }).success).toBe(true);
    expect(createRequestSchema.safeParse({ ...VALID, examCycleId: "not-a-uuid" }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...VALID, examSlug: "", examCycleId: REQ }).success).toBe(true);
  });
  it("limits saved-document picks and rejects bad ids", () => {
    const ids = Array.from({ length: 5 }, () => REQ);
    expect(createRequestSchema.safeParse({ ...VALID, vaultDocumentIds: ids }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...VALID, vaultDocumentIds: ["x"] }).success).toBe(false);
    expect(createRequestSchema.safeParse({ ...VALID, vaultDocumentIds: [REQ] }).success).toBe(true);
  });
  it("validates the new action schemas", () => {
    expect(requestChangesSchema.safeParse({ requestId: REQ, message: " " }).success).toBe(false);
    expect(actionDoneSchema.safeParse({ requestId: REQ }).success).toBe(true);
    expect(officialStageSchema.safeParse({ requestId: REQ, stage: "submitted" }).success).toBe(false);
    expect(officialStageSchema.safeParse({ requestId: REQ, stage: "result" }).success).toBe(true);
  });
  it("sniffs real file types and rejects others", () => {
    expect(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("application/pdf");
    expect(sniffMime(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });
});
