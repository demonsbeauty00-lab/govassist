// Maps a published update onto the exam_cycles columns it genuinely
// represents. Pure. Rules: never write a null over an existing value, never
// move current_status backwards, never invent a cut-off or a date.

import { Database } from "@/lib/supabase/database.types";

type DetectedUpdateRow = Database["public"]["Tables"]["detected_updates"]["Row"];
type ExamCyclesUpdate = Database["public"]["Tables"]["exam_cycles"]["Update"];
type CurrentStatus = NonNullable<Database["public"]["Tables"]["exam_cycles"]["Row"]["current_status"]>;

const STATUS_ORDER: CurrentStatus[] = [
  "upcoming", "applications_open", "applications_closed", "exam_date_announced", "admit_card_available",
  "exam_completed", "answer_key_available", "objection_window_open", "result_declared", "completed",
];

function advance(current: CurrentStatus | null, next: CurrentStatus): { current_status?: CurrentStatus } {
  if (current === null) return { current_status: next };
  return STATUS_ORDER.indexOf(next) > STATUS_ORDER.indexOf(current) ? { current_status: next } : {};
}

function field(update: DetectedUpdateRow, label: string): string | null {
  return update.extracted_fields.find((f) => f.label === label)?.value ?? null;
}

export function buildExamCycleUpdate(update: DetectedUpdateRow, currentStatus: CurrentStatus | null): ExamCyclesUpdate {
  const patch: ExamCyclesUpdate = {};
  const set = <K extends keyof ExamCyclesUpdate>(key: K, value: ExamCyclesUpdate[K] | null | undefined) => {
    if (value !== null && value !== undefined && value !== "") patch[key] = value;
  };

  switch (update.update_type) {
    case "application_start_date":
      set("application_start_date", update.publication_date);
      break;
    case "application_end_date_change":
      set("application_end_date", update.publication_date);
      break;
    case "exam_date":
      if (update.event_date) {
        set("exam_date", update.event_date);
        set("exam_date_end", field(update, "Event end date"));
        Object.assign(patch, advance(currentStatus, "exam_date_announced"));
      }
      break;
    case "exam_city_intimation":
      set("exam_city_intimation_url", update.document_url);
      break;
    case "admit_card":
      set("admit_card_date", update.publication_date);
      set("admit_card_url", update.document_url);
      Object.assign(patch, advance(currentStatus, "admit_card_available"));
      break;
    case "response_sheet":
      set("response_sheet_url", update.document_url);
      break;
    case "answer_key":
      set("answer_key_date", update.publication_date);
      set("answer_key_url", update.document_url);
      Object.assign(patch, advance(currentStatus, "answer_key_available"));
      break;
    case "objection_window":
      if (update.event_date) {
        set("objection_window_start", update.event_date);
        set("objection_window_end", field(update, "Event end date"));
      }
      Object.assign(patch, advance(currentStatus, "objection_window_open"));
      break;
    case "result":
      set("result_date", update.publication_date);
      set("result_url", update.document_url);
      Object.assign(patch, advance(currentStatus, "result_declared"));
      break;
    case "scorecard":
      set("scorecard_url", update.document_url);
      break;
    case "cutoff": {
      const cutoff = update.extracted_fields.find((f) => f.label === "Cutoff" && f.confidence === "high");
      set("cutoff_summary", cutoff?.value);
      break;
    }
    default:
      // corrigendum / other / new_notification: informational only.
      break;
  }
  return patch;
}
