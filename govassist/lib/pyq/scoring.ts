// ---------------------------------------------------------------------------
// Attempt scoring. Deliberately a pure function, same principle as
// lib/eligibility/engine.ts: given the paper's questions (with their real
// correct answers) and the user's submitted answers, it returns one
// deterministic result. No network calls, no AI guess of "close enough" —
// an answer either matches the official correct option/value or it
// doesn't. This is always run server-side (lib/actions/pyq.ts), against
// data fetched with the service-role client — a client-submitted score is
// never trusted.
// ---------------------------------------------------------------------------

export interface ScoringQuestion {
  id: string;
  correctOptionId: string | null; // mcq_single/mcq_multiple
  correctNumericValue: string | null; // numerical
  marks: number;
  negativeMarks: number;
}

export interface ScoringAnswer {
  questionId: string;
  selectedOptionId: string | null;
  numericAnswer: string | null;
}

export interface ScoringOutcome {
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  attemptedCount: number;
  score: number;
  maxScore: number;
  accuracy: number | null;
  perQuestion: Record<string, { isCorrect: boolean | null; marksAwarded: number }>;
}

function normalize(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.toLowerCase();
}

export function scoreAttempt(questions: ScoringQuestion[], answers: ScoringAnswer[]): ScoringOutcome {
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;
  let score = 0;
  let maxScore = 0;
  const perQuestion: ScoringOutcome["perQuestion"] = {};

  for (const q of questions) {
    maxScore += q.marks;
    const answer = answerByQuestion.get(q.id);

    const hasNumericAnswer = q.correctNumericValue !== null && answer?.numericAnswer != null && normalize(answer.numericAnswer) !== null;
    const hasOptionAnswer = q.correctOptionId !== null && answer?.selectedOptionId != null;
    const attempted = hasNumericAnswer || hasOptionAnswer;

    if (!attempted) {
      unattemptedCount++;
      perQuestion[q.id] = { isCorrect: null, marksAwarded: 0 };
      continue;
    }

    let isCorrect: boolean;
    if (q.correctNumericValue !== null) {
      isCorrect = normalize(answer!.numericAnswer) === normalize(q.correctNumericValue);
    } else {
      isCorrect = answer!.selectedOptionId === q.correctOptionId;
    }

    if (isCorrect) {
      correctCount++;
      score += q.marks;
      perQuestion[q.id] = { isCorrect: true, marksAwarded: q.marks };
    } else {
      incorrectCount++;
      score -= q.negativeMarks;
      perQuestion[q.id] = { isCorrect: false, marksAwarded: -q.negativeMarks };
    }
  }

  const attemptedCount = correctCount + incorrectCount;
  const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 1000) / 10 : null;

  return {
    correctCount,
    incorrectCount,
    unattemptedCount,
    attemptedCount,
    score: Math.round(score * 100) / 100,
    maxScore: Math.round(maxScore * 100) / 100,
    accuracy,
    perQuestion,
  };
}

/** Resolves the effective marks/negative-marks for one question, applying
 *  the question-level override first, then the section marking scheme,
 *  then the paper-wide default, then a safe last-resort fallback (1 / 0) —
 *  never silently invents an exam-specific value beyond that generic
 *  fallback, and only ever for practice-attempt arithmetic, never for
 *  presenting something as an official marking scheme. */
export function resolveMarks(input: {
  questionMarks: number | null;
  questionNegativeMarks: number | null;
  sectionScheme: { correctMarks: number; incorrectMarks: number } | undefined;
  defaultScheme: { correctMarks: number; incorrectMarks: number };
}): { marks: number; negativeMarks: number } {
  const marks = input.questionMarks ?? input.sectionScheme?.correctMarks ?? input.defaultScheme.correctMarks ?? 1;
  const negativeMarks =
    input.questionNegativeMarks ?? input.sectionScheme?.incorrectMarks ?? input.defaultScheme.incorrectMarks ?? 0;
  return { marks, negativeMarks };
}
