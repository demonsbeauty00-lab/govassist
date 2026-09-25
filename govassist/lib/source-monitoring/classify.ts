// ---------------------------------------------------------------------------
// Classification is a pure function of what a parser actually extracted —
// no exam-specific special-casing, so it works the same way for a brand
// new source as for one that's been running for a year. That's what makes
// it safe to trust for AUTO_PUBLISH: the bar is the same everywhere.
// ---------------------------------------------------------------------------

import { Classification, ParsedUpdate, UpdateType } from "./types";

const MIN_TITLE_LENGTH = 8;

/** Update types where trusting a date without confidently extracting one
 *  is exactly the kind of silent guess requirement 5 forbids — these can
 *  only auto-publish when a publication date was actually determined. */
const DATE_SENSITIVE_TYPES: UpdateType[] = [
  "application_start_date",
  "application_end_date_change",
  "exam_date",
  "admit_card",
  "answer_key",
  "result",
  "objection_window",
];

export function classifyUpdate(parsed: ParsedUpdate): Classification {
  const titleValid = parsed.title.trim().length >= MIN_TITLE_LENGTH;
  const hasReference = parsed.documentUrl !== null;

  // Nothing usable came out of the parser at all — most likely a parser
  // false-positive (matched something that isn't actually a notice) rather
  // than a real update worth a human's time.
  if (!titleValid && !hasReference) {
    return "reject";
  }

  // A brand-new exam cycle is a bigger claim than "this date changed" —
  // always wants a human glance before it's live, however cleanly it parsed.
  if (parsed.updateType === "new_notification") {
    return "needs_review";
  }

  const anyLowOrMediumConfidence = parsed.extractedFields.some((f) => f.confidence !== "high");
  const needsDate = DATE_SENSITIVE_TYPES.includes(parsed.updateType);
  const dateSatisfied = !needsDate || parsed.publicationDate !== null;

  if (titleValid && hasReference && !anyLowOrMediumConfidence && dateSatisfied) {
    return "auto_publish";
  }

  return "needs_review";
}
