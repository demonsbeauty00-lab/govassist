// ---------------------------------------------------------------------------
// lib/scoring/answer-key-calculator.ts — Phase 7.5.
//
// This does NOT duplicate lib/pyq/scoring.ts / lib/pyq/analytics.ts — it
// composes them. The reason this file exists at all, rather than just
// calling scoreAttempt() directly, is the handful of answer-key-specific
// rules those two modules correctly know nothing about:
//   - a 'dropped' question must be excluded from scoring AND from
//     maximum_marks, as if it were never on the paper;
//   - a 'bonus_awarded' question must award full marks to every
//     candidate, whether or not they answered it (a common official
//     answer-key outcome for a technically-flawed question);
//   - "the marking scheme is missing" must produce an honest
//     needs_review result instead of scoring against scoring.ts's
//     generic 1-mark/no-negative-marking fallback, which is a reasonable
//     default for casual practice-paper scoring but not for a
//     real-money-matters expected-score calculation.
// Everything else — the actual correct/incorrect/unattempted logic,
// section grouping, marks totals — is the exact same engine Phase 6/7
// already ship, reused rather than re-implemented.
// ---------------------------------------------------------------------------

import { scoreAttempt, ScoringAnswer, ScoringOutcome, ScoringQuestion } from "@/lib/pyq/scoring";
import { computeAttemptPercentage, computeMarksBreakdown, computeSectionBreakdown, SectionAwareQuestion } from "@/lib/pyq/analytics";
import { SectionBreakdownEntry } from "@/lib/supabase/database.types";

export type QuestionStatusFlag = "normal" | "dropped" | "bonus_awarded" | "disputed";

export interface AnswerKeyQuestion extends ScoringQuestion {
  questionNumber: number;
  sectionId: string | null;
  sectionName: string;
  statusFlag: QuestionStatusFlag;
}

export type CalculationStatus = "calculated" | "needs_review";

export interface QuestionWiseResult {
  questionNumber: number;
  sectionName: string;
  candidateAnswer: string | null; // option label or numeric value the candidate gave, null if unattempted
  officialAnswer: string | null; // option label or numeric value, null only when statusFlag is 'dropped'
  outcome: "correct" | "incorrect" | "unattempted" | "dropped" | "bonus";
  marksAwarded: number;
  negativeMarksApplied: number;
  statusFlag: QuestionStatusFlag;
}

export interface AnswerKeyCalculationResult {
  calculationStatus: CalculationStatus;
  /** Only set when calculationStatus is 'needs_review' — never paired
   *  with a numeric score, since that combination would be exactly the
   *  "misleading final score" the brief prohibits. */
  reviewMessage: string | null;

  totalQuestions: number;
  attempted: number;
  unattempted: number;
  correct: number;
  incorrect: number;
  droppedCount: number;
  bonusCount: number;

  marksFromCorrect: number;
  negativeMarks: number;
  finalScore: number | null;
  maximumMarks: number | null;
  accuracy: number | null;
  attemptPercentage: number | null;

  sectionWiseScores: SectionBreakdownEntry[];
  questionWiseResults: QuestionWiseResult[];
}

function needsReview(message: string): AnswerKeyCalculationResult {
  return {
    calculationStatus: "needs_review",
    reviewMessage: message,
    totalQuestions: 0,
    attempted: 0,
    unattempted: 0,
    correct: 0,
    incorrect: 0,
    droppedCount: 0,
    bonusCount: 0,
    marksFromCorrect: 0,
    negativeMarks: 0,
    finalScore: null,
    maximumMarks: null,
    accuracy: null,
    attemptPercentage: null,
    sectionWiseScores: [],
    questionWiseResults: [],
  };
}

export interface CalculateFromAnswerKeyInput {
  questions: AnswerKeyQuestion[];
  answers: ScoringAnswer[];
  /** Whether ANY marking_scheme row (paper-wide default or section
   *  override) exists for this paper. Passed in rather than re-derived
   *  here, because only the caller knows whether the empty scheme it
   *  resolved from is "genuinely configured as free-form" vs "nothing was
   *  ever set up" — see lib/actions/answer-key.ts. */
  hasMarkingScheme: boolean;
  /** Human-readable answer/option text per question id, for building
   *  question-wise results without a second DB round trip. */
  candidateAnswerLabels: Map<string, string | null>;
  officialAnswerLabels: Map<string, string | null>;
}

/**
 * The single calculation path for "how many marks did this set of
 * candidate answers earn against this paper's current official answer
 * key" — used identically whether the candidate answers came from a
 * GovAssist mock attempt, manual entry, or (once a real parser exists) an
 * imported response sheet. Deterministic: the same inputs always produce
 * the same output, with no randomness, no AI judgment call, and no
 * network access.
 */
export function calculateFromAnswerKey(input: CalculateFromAnswerKeyInput): AnswerKeyCalculationResult {
  if (!input.hasMarkingScheme) {
    return needsReview("Marking scheme needs verification — this paper has no stored marking scheme, so a score can't be calculated reliably yet.");
  }
  if (input.questions.length === 0) {
    return needsReview("No published questions were found for this paper.");
  }

  const droppedIds = new Set(input.questions.filter((q) => q.statusFlag === "dropped").map((q) => q.id));
  const bonusIds = new Set(input.questions.filter((q) => q.statusFlag === "bonus_awarded").map((q) => q.id));
  const scoredQuestions = input.questions.filter((q) => !droppedIds.has(q.id));

  // Bonus questions score as "correct, full marks" for every candidate —
  // achieved by synthesizing an answer that matches the stored correct
  // answer, rather than special-casing scoreAttempt() itself. The
  // candidate's real (or absent) answer is still shown honestly in
  // questionWiseResults below.
  const effectiveAnswers: ScoringAnswer[] = input.answers.map((a) => {
    if (!bonusIds.has(a.questionId)) return a;
    const q = scoredQuestions.find((sq) => sq.id === a.questionId);
    return q ? { questionId: a.questionId, selectedOptionId: q.correctOptionId, numericAnswer: q.correctNumericValue } : a;
  });
  // A bonus question must award full marks even if the candidate left it
  // fully blank — scoreAttempt() only "attempts" a question that has an
  // answer row, so ensure one exists.
  for (const id of bonusIds) {
    if (droppedIds.has(id)) continue;
    if (!effectiveAnswers.some((a) => a.questionId === id)) {
      const q = scoredQuestions.find((sq) => sq.id === id);
      if (q) effectiveAnswers.push({ questionId: id, selectedOptionId: q.correctOptionId, numericAnswer: q.correctNumericValue });
    }
  }

  const outcome: ScoringOutcome = scoreAttempt(scoredQuestions, effectiveAnswers);

  const sectionAware: SectionAwareQuestion[] = scoredQuestions.map((q) => ({ ...q, sectionId: q.sectionId, sectionName: q.sectionName }));
  const sectionWiseScores = computeSectionBreakdown(sectionAware, outcome).sections;
  const { marksEarned, negativeMarksDeducted } = computeMarksBreakdown(outcome);

  const maximumMarks = Math.round(scoredQuestions.reduce((sum, q) => sum + q.marks, 0) * 100) / 100;
  const finalScore = Math.round((marksEarned - negativeMarksDeducted) * 100) / 100;
  const attemptPercentage = computeAttemptPercentage(finalScore, maximumMarks);

  const questionWiseResults: QuestionWiseResult[] = [...input.questions]
    .sort((a, b) => a.questionNumber - b.questionNumber)
    .map((q) => {
      const candidateAnswer = input.candidateAnswerLabels.get(q.id) ?? null;
      const officialAnswer = droppedIds.has(q.id) ? null : input.officialAnswerLabels.get(q.id) ?? null;

      if (droppedIds.has(q.id)) {
        return {
          questionNumber: q.questionNumber,
          sectionName: q.sectionName,
          candidateAnswer,
          officialAnswer: null,
          outcome: "dropped" as const,
          marksAwarded: 0,
          negativeMarksApplied: 0,
          statusFlag: q.statusFlag,
        };
      }

      const graded = outcome.perQuestion[q.id];
      const isBonus = bonusIds.has(q.id);
      const outcomeLabel: QuestionWiseResult["outcome"] = isBonus
        ? "bonus"
        : !graded || graded.isCorrect === null
          ? "unattempted"
          : graded.isCorrect
            ? "correct"
            : "incorrect";

      return {
        questionNumber: q.questionNumber,
        sectionName: q.sectionName,
        candidateAnswer,
        officialAnswer,
        outcome: outcomeLabel,
        marksAwarded: graded && graded.isCorrect ? graded.marksAwarded : 0,
        negativeMarksApplied: graded && graded.isCorrect === false ? Math.abs(graded.marksAwarded) : 0,
        statusFlag: q.statusFlag,
      };
    });

  return {
    calculationStatus: "calculated",
    reviewMessage: null,
    totalQuestions: scoredQuestions.length,
    attempted: outcome.attemptedCount,
    unattempted: outcome.unattemptedCount,
    correct: outcome.correctCount,
    incorrect: outcome.incorrectCount,
    droppedCount: droppedIds.size,
    bonusCount: bonusIds.size,
    marksFromCorrect: marksEarned,
    negativeMarks: negativeMarksDeducted,
    finalScore,
    maximumMarks,
    accuracy: outcome.accuracy,
    attemptPercentage,
    sectionWiseScores,
    questionWiseResults,
  };
}
