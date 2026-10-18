// Refines a freshly parsed update before classification: normalises an empty
// link to null, resolves a generic type from the title, and records the
// stage's own date ONLY when the title states one explicitly.

import { ExtractedNoticeField, ParsedUpdate } from "../types";
import { detectStageType } from "./detect-type";
import { extractDateRange } from "./dates";

export interface EnrichedUpdate {
  update: ParsedUpdate;
  typeAmbiguous: boolean;
  dateAmbiguous: boolean;
}

const GENERIC_TYPES = new Set(["new_notification", "other"]);
// Phase 16: application start/end notices also carry their date in the title; reading it explicitly
// (instead of falling back to the publication date) is what lets the cycle patch stay honest.
const RANGE_TYPES = new Set(["exam_date", "objection_window", "application_start_date", "application_end_date_change"]);

function withField(fields: ExtractedNoticeField[], field: ExtractedNoticeField): ExtractedNoticeField[] {
  return [...fields.filter((f) => f.label !== field.label), field];
}

export function enrichParsedUpdate(parsed: ParsedUpdate): EnrichedUpdate {
  const detection = detectStageType(parsed.title);
  let updateType = parsed.updateType;
  // A parser that read real markup and chose a specific type is trusted; a
  // generic type is upgraded only when the title unambiguously says more.
  if (GENERIC_TYPES.has(parsed.updateType) && detection.matched && !detection.ambiguous) {
    updateType = detection.type;
  }

  let fields = parsed.extractedFields;
  let eventDate = parsed.eventDate ?? null;
  let dateAmbiguous = false;

  if (RANGE_TYPES.has(updateType)) {
    const range = extractDateRange(parsed.title);
    dateAmbiguous = range.ambiguous;
    if (range.start && !eventDate) {
      eventDate = range.start;
      fields = withField(fields, { label: "Event date", value: range.start, confidence: "high" });
      if (range.end) fields = withField(fields, { label: "Event end date", value: range.end, confidence: "high" });
    }
  }

  const documentUrl = parsed.documentUrl && parsed.documentUrl.trim() ? parsed.documentUrl.trim() : null;

  return {
    update: { ...parsed, updateType, documentUrl, eventDate, extractedFields: fields },
    typeAmbiguous: detection.ambiguous,
    dateAmbiguous,
  };
}
