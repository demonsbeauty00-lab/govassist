import { describe, it, expect } from "vitest";
import { resolveMarks, scoreAttempt, ScoringQuestion } from "../scoring";

const QUESTIONS: ScoringQuestion[] = [
  { id: "q1", correctOptionId: "q1-b", correctNumericValue: null, marks: 2, negativeMarks: 0.5 },
  { id: "q2", correctOptionId: "q2-a", correctNumericValue: null, marks: 2, negativeMarks: 0.5 },
  { id: "q3", correctOptionId: null, correctNumericValue: "42", marks: 2, negativeMarks: 0.5 },
];

describe("scoreAttempt", () => {
  it("scores correct, incorrect, and unattempted questions correctly", () => {
    const outcome = scoreAttempt(QUESTIONS, [
      { questionId: "q1", selectedOptionId: "q1-b", numericAnswer: null }, // correct
      { questionId: "q2", selectedOptionId: "q2-c", numericAnswer: null }, // incorrect
      // q3 left unattempted
    ]);
    expect(outcome.correctCount).toBe(1);
    expect(outcome.incorrectCount).toBe(1);
    expect(outcome.unattemptedCount).toBe(1);
    expect(outcome.score).toBe(2 - 0.5); // +2 for q1, -0.5 for q2
    expect(outcome.maxScore).toBe(6);
  });

  it("scores a numerical answer by exact normalized match", () => {
    const outcome = scoreAttempt(QUESTIONS, [{ questionId: "q3", selectedOptionId: null, numericAnswer: " 42 " }]);
    expect(outcome.correctCount).toBe(1);
    expect(outcome.perQuestion.q3.isCorrect).toBe(true);
  });

  it("never awards marks for an empty-string numeric answer — treats it as unattempted", () => {
    const outcome = scoreAttempt(QUESTIONS, [{ questionId: "q3", selectedOptionId: null, numericAnswer: "   " }]);
    expect(outcome.unattemptedCount).toBe(3);
  });

  it("computes accuracy only from attempted questions", () => {
    const outcome = scoreAttempt(QUESTIONS, [
      { questionId: "q1", selectedOptionId: "q1-b", numericAnswer: null },
      { questionId: "q2", selectedOptionId: "q2-a", numericAnswer: null },
    ]);
    expect(outcome.accuracy).toBe(100);
  });

  it("returns null accuracy when nothing was attempted", () => {
    const outcome = scoreAttempt(QUESTIONS, []);
    expect(outcome.accuracy).toBeNull();
  });
});

describe("resolveMarks", () => {
  it("prefers a question-level override over any scheme", () => {
    const result = resolveMarks({
      questionMarks: 5,
      questionNegativeMarks: 1,
      sectionScheme: { correctMarks: 2, incorrectMarks: 0.5 },
      defaultScheme: { correctMarks: 1, incorrectMarks: 0 },
    });
    expect(result).toEqual({ marks: 5, negativeMarks: 1 });
  });

  it("falls back to the section scheme when the question has no override", () => {
    const result = resolveMarks({
      questionMarks: null,
      questionNegativeMarks: null,
      sectionScheme: { correctMarks: 2, incorrectMarks: 0.5 },
      defaultScheme: { correctMarks: 1, incorrectMarks: 0 },
    });
    expect(result).toEqual({ marks: 2, negativeMarks: 0.5 });
  });

  it("falls back to the paper default when neither the question nor a section scheme exists", () => {
    const result = resolveMarks({
      questionMarks: null,
      questionNegativeMarks: null,
      sectionScheme: undefined,
      defaultScheme: { correctMarks: 1, incorrectMarks: 0 },
    });
    expect(result).toEqual({ marks: 1, negativeMarks: 0 });
  });
});
