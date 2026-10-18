// Which questions GovAssist can score reliably today. Pure.
//
// Attempts store ONE selected option per question, and the answer-key calculator compares
// that one option with ONE correct option. A "multiple correct options" question therefore
// cannot be scored correctly — it would be graded as if it were single-answer. Rather than
// show a wrong score, such papers are held back until multi-select scoring is built.

export interface SupportCheckQuestion {
  question_type: string;
  question_status_flag: string;
}

export const MULTI_SELECT_UNSUPPORTED_MESSAGE =
  "This paper has multiple-correct-answer questions, which GovAssist can't score reliably yet. It needs verification before an attempt can be scored.";

/** Dropped and bonus questions never depend on the candidate's answer, so they are safe. */
export function findUnsupportedScoring(questions: SupportCheckQuestion[]): string | null {
  const unsupported = questions.some(
    (q) => q.question_type === "mcq_multiple" && q.question_status_flag !== "dropped" && q.question_status_flag !== "bonus_awarded"
  );
  return unsupported ? MULTI_SELECT_UNSUPPORTED_MESSAGE : null;
}
