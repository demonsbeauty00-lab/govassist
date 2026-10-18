import { describe, it, expect } from "vitest";
import { REQUEST_STATUSES } from "@/lib/application-requests/constants";
import {
  categoryForEvent, categoryForUpdateType, eventForRequestStatus, eventForUpdateType, isNotificationEvent,
  isSafeInternalLink, legacyTypeForEvent, NOTIFICATION_EVENTS, requestLink, type UpdateType,
} from "../events";

const ALL_UPDATE_TYPES: UpdateType[] = [
  "new_notification", "corrigendum", "application_start_date", "application_end_date_change", "exam_date", "admit_card",
  "answer_key", "response_sheet", "objection_window", "result", "cutoff", "other", "exam_city_intimation", "scorecard",
];

describe("event classification", () => {
  it("every detected update type maps to a known event", () => {
    for (const t of ALL_UPDATE_TYPES) expect(isNotificationEvent(eventForUpdateType(t))).toBe(true);
  });

  it("maps the official stages to the briefed events", () => {
    expect(eventForUpdateType("new_notification")).toBe("NEW_NOTIFICATION");
    expect(eventForUpdateType("application_end_date_change")).toBe("DEADLINE_CHANGED");
    expect(eventForUpdateType("exam_date")).toBe("EXAM_DATE_CHANGED");
    expect(eventForUpdateType("admit_card")).toBe("ADMIT_CARD_AVAILABLE");
    expect(eventForUpdateType("exam_city_intimation")).toBe("CITY_INTIMATION_AVAILABLE");
    expect(eventForUpdateType("answer_key")).toBe("ANSWER_KEY_AVAILABLE");
    expect(eventForUpdateType("objection_window")).toBe("OBJECTION_WINDOW_OPEN");
    expect(eventForUpdateType("result")).toBe("RESULT_DECLARED");
    expect(eventForUpdateType("cutoff")).toBe("CUTOFF_AVAILABLE");
  });

  it("every request status maps to an event, and form_filled never claims an official submission", () => {
    for (const s of REQUEST_STATUSES) expect(isNotificationEvent(eventForRequestStatus(s))).toBe(true);
    expect(eventForRequestStatus("form_filled")).toBe("APPLICATION_REQUEST_FORM_FILLED");
    expect(eventForRequestStatus("form_filled")).not.toBe("APPLICATION_STATUS_CHANGED");
    expect(eventForRequestStatus("submitted")).toBe("APPLICATION_REQUEST_SUBMITTED");
    expect(eventForRequestStatus("in_progress")).toBe("APPLICATION_REQUEST_ACCEPTED");
    expect(eventForRequestStatus("waiting_for_user")).toBe("APPLICATION_REQUEST_WAITING_FOR_USER");
    expect(eventForRequestStatus("rejected")).toBe("APPLICATION_REQUEST_REJECTED");
    expect(eventForRequestStatus("completed")).toBe("APPLICATION_REQUEST_COMPLETED");
  });

  it("covers all events requested in the brief", () => {
    for (const e of [
      "NEW_NOTIFICATION", "DEADLINE_CHANGED", "DEADLINE_APPROACHING", "EXAM_DATE_CHANGED", "ADMIT_CARD_AVAILABLE",
      "CITY_INTIMATION_AVAILABLE", "ANSWER_KEY_AVAILABLE", "OBJECTION_WINDOW_OPEN", "RESULT_DECLARED", "CUTOFF_AVAILABLE",
      "APPLICATION_STATUS_CHANGED", "ELIGIBILITY_CHANGED", "APPLICATION_REQUEST_SUBMITTED", "APPLICATION_REQUEST_ACCEPTED",
      "APPLICATION_REQUEST_IN_PROGRESS", "APPLICATION_REQUEST_WAITING_FOR_USER", "APPLICATION_REQUEST_FORM_FILLED",
      "APPLICATION_REQUEST_REJECTED", "APPLICATION_REQUEST_COMPLETED",
    ]) expect(NOTIFICATION_EVENTS.includes(e as never)).toBe(true);
  });

  it("routes events to the preference category the user can switch", () => {
    expect(categoryForEvent("DEADLINE_APPROACHING")).toBe("deadline");
    expect(categoryForEvent("ADMIT_CARD_AVAILABLE")).toBe("admit_card");
    expect(categoryForEvent("CITY_INTIMATION_AVAILABLE")).toBe("admit_card");
    expect(categoryForEvent("OBJECTION_WINDOW_OPEN")).toBe("answer_key");
    expect(categoryForEvent("CUTOFF_AVAILABLE")).toBe("result");
    expect(categoryForEvent("ELIGIBILITY_CHANGED")).toBe("eligibility");
    expect(categoryForEvent("APPLICATION_REQUEST_COMPLETED")).toBe("application_requests");
    expect(categoryForUpdateType("application_start_date")).toBe("deadline");
  });

  it("keeps a legacy notifications.type for every event", () => {
    for (const e of NOTIFICATION_EVENTS) expect(["deadline", "admit_card", "result", "system"].includes(legacyTypeForEvent(e))).toBe(true);
  });
});

describe("links", () => {
  it("accepts only in-app paths", () => {
    expect(isSafeInternalLink("/apply-assistant/abc")).toBe(true);
    expect(isSafeInternalLink("https://evil.example")).toBe(false);
    expect(isSafeInternalLink("//evil.example")).toBe(false);
    expect(isSafeInternalLink("javascript:alert(1)")).toBe(false);
    expect(isSafeInternalLink("/a\\b")).toBe(false);
    expect(isSafeInternalLink("")).toBe(false);
    expect(isSafeInternalLink(null)).toBe(false);
    expect(requestLink("r1")).toBe("/apply-assistant/r1");
  });
});
