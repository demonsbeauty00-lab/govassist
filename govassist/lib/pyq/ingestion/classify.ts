// ---------------------------------------------------------------------------
// Classification is a pure function of what a parser actually extracted —
// same principle as lib/source-monitoring/classify.ts. The bar for
// auto-publishing a PYQ paper is deliberately stricter than for a
// notification update: a wrong "correct answer" silently shown to someone
// studying for a real exam is a much worse failure than a slightly-stale
// notification, so a paper only ever auto-publishes when every question in
// it has a confidently-extracted correct answer.
// ---------------------------------------------------------------------------

import { ParsedPaper, ParsedQuestion, PaperClassification } from "./types";

const MIN_QUESTIONS_TO_PUBLISH = 1;
const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const REJECT_BELOW = 0.2;

/** A single question's own classification — used to decide its `status`
 *  column independently of the paper's overall classification, so a
 *  handful of low-confidence questions inside an otherwise good paper can
 *  be individually held back for review rather than blocking (or
 *  silently including) the rest. */
export function classifyQuestion(q: ParsedQuestion): PaperClassification {
  const promptValid = q.prompt.trim().length >= 4;
  if (!promptValid || q.confidence < REJECT_BELOW) return "reject";

  if (q.questionType === "numerical") {
    if (!q.correctNumericValue || q.correctNumericValue.trim().length === 0) return "needs_review";
  } else {
    const hasOptions = q.options.length >= 2;
    const hasExactlyOneCorrectForSingle = q.questionType !== "mcq_single" || q.options.filter((o) => o.isCorrect).length === 1;
    const hasAtLeastOneCorrect = q.options.some((o) => o.isCorrect);
    if (!hasOptions || !hasAtLeastOneCorrect || !hasExactlyOneCorrectForSingle) return "needs_review";
  }

  return q.confidence >= HIGH_CONFIDENCE_THRESHOLD ? "auto_publish" : "needs_review";
}

/** The paper's overall classification. AUTO_PUBLISH requires every single
 *  question to independently classify as auto_publish too — see file
 *  header. A paper can still be created (as 'needs_review') with a mix of
 *  question-level confidences; it just won't be auto-published. */
export function classifyPaper(paper: ParsedPaper): PaperClassification {
  if (paper.questions.length < MIN_QUESTIONS_TO_PUBLISH || paper.confidence < REJECT_BELOW) {
    return "reject";
  }

  const questionClassifications = paper.questions.map(classifyQuestion);
  if (questionClassifications.some((c) => c === "reject")) {
    // Not a whole-paper reject — a handful of unusable questions doesn't
    // invalidate an otherwise real, verified paper. Falls through to
    // needs_review so a human decides what to do with those specific rows.
    return "needs_review";
  }

  const allAutoPublish = questionClassifications.every((c) => c === "auto_publish");
  const durationKnown = paper.durationMinutes > 0;

  if (allAutoPublish && durationKnown && paper.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return "auto_publish";
  }

  return "needs_review";
}
