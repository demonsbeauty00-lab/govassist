import { describe, it, expect } from "vitest";
import { calculateFromAnswerKey, AnswerKeyQuestion } from "../answer-key-calculator";
import { ScoringAnswer } from "@/lib/pyq/scoring";

function q(overrides: Partial<AnswerKeyQuestion> = {}): AnswerKeyQuestion {
  return {
    id: "q1",
    questionNumber: 1,
    correctOptionId: "opt-b",
    correctNumericValue: null,
    marks: 2,
    negativeMarks: 0.5,
    sectionId: "sec-1",
    sectionName: "Quant",
    statusFlag: "normal",
    ...overrides,
  };
}

function labels(entries: [string, string | null][]): Map<string, string | null> {
  return new Map(entries);
}

describe("calculateFromAnswerKey", () => {
  it("returns needs_review with no numeric score when no marking scheme exists", () => {
    const result = calculateFromAnswerKey({
      questions: [q()],
      answers: [{ questionId: "q1", selectedOptionId: "opt-b", numericAnswer: null }],
      hasMarkingScheme: false,
      candidateAnswerLabels: labels([]),
      officialAnswerLabels: labels([]),
    });
    expect(result.calculationStatus).toBe("needs_review");
    expect(result.finalScore).toBeNull();
    expect(result.reviewMessage).toMatch(/marking scheme/i);
  });

  it("scores all-correct answers with full marks and zero negative marks", () => {
    const questions = [q({ id: "q1" }), q({ id: "q2", correctOptionId: "opt-a" })];
    const answers: ScoringAnswer[] = [
      { questionId: "q1", selectedOptionId: "opt-b", numericAnswer: null },
      { questionId: "q2", selectedOptionId: "opt-a", numericAnswer: null },
    ];
    const result = calculateFromAnswerKey({ questions, answers, hasMarkingScheme: true, candidateAnswerLabels: labels([]), officialAnswerLabels: labels([]) });
    expect(result.correct).toBe(2);
    expect(result.incorrect).toBe(0);
    expect(result.finalScore).toBe(4);
    expect(result.negativeMarks).toBe(0);
  });

  it("scores all-incorrect answers with negative marking applied", () => {
    const questions = [q({ id: "q1" }), q({ id: "q2", correctOptionId: "opt-a" })];
    const answers: ScoringAnswer[] = [
      { questionId: "q1", selectedOptionId: "opt-z", numericAnswer: null },
      { questionId: "q2", selectedOptionId: "opt-z", numericAnswer: null },
    ];
    const result = calculateFromAnswerKey({ questions, answers, hasMarkingScheme: true, candidateAnswerLabels: labels([]), officialAnswerLabels: labels([]) });
    expect(result.incorrect).toBe(2);
    expect(result.negativeMarks).toBe(1); // 2 x 0.5
    expect(result.finalScore).toBe(-1);
  });

  it("handles a mix of correct, incorrect and unanswered questions", () => {
    const questions = [q({ id: "q1" }), q({ id: "q2", correctOptionId: "opt-a" }), q({ id: "q3", correctOptionId: "opt-c" })];
    const answers: ScoringAnswer[] = [
      { questionId: "q1", selectedOptionId: "opt-b", numericAnswer: null }, // correct
      { questionId: "q2", selectedOptionId: "opt-z", numericAnswer: null }, // incorrect
      // q3 left unanswered
    ];
    const result = calculateFromAnswerKey({ questions, answers, hasMarkingScheme: true, candidateAnswerLabels: labels([]), officialAnswerLabels: labels([]) });
    expect(result.correct).toBe(1);
    expect(result.incorrect).toBe(1);
    expect(result.unattempted).toBe(1);
    expect(result.finalScore).toBe(1.5); // +2 - 0.5
  });

  it("produces section-wise scores grouped by each question's section", () => {
    const questions = [
      q({ id: "q1", sectionId: "s1", sectionName: "Quant" }),
      q({ id: "q2", sectionId: "s2", sectionName: "Reasoning", correctOptionId: "opt-a" }),
    ];
    const answers: ScoringAnswer[] = [
      { questionId: "q1", selectedOptionId: "opt-b", numericAnswer: null },
      { questionId: "q2", selectedOptionId: "opt-a", numericAnswer: null },
    ];
    const result = calculateFromAnswerKey({ questions, answers, hasMarkingScheme: true, candidateAnswerLabels: labels([]), officialAnswerLabels: labels([]) });
    expect(result.sectionWiseScores).toHaveLength(2);
    expect(result.sectionWiseScores.map((s) => s.sectionName).sort()).toEqual(["Quant", "Reasoning"]);
  });

  it("excludes a dropped question from totals and maximum marks entirely", () => {
    const questions = [q({ id: "q1" }), q({ id: "q2", statusFlag: "dropped", correctOptionId: "opt-a" })];
    const answers: ScoringAnswer[] = [{ questionId: "q1", selectedOptionId: "opt-b", numericAnswer: null }];
    const result = calculateFromAnswerKey({ questions, answers, hasMarkingScheme: true, candidateAnswerLabels: labels([]), officialAnswerLabels: labels([]) });
    expect(result.totalQuestions).toBe(1); // only q1 counted
    expect(result.droppedCount).toBe(1);
    expect(result.maximumMarks).toBe(2); // q2's 2 marks excluded
    const q2Result = result.questionWiseResults.find((r) => r.questionNumber === 1 && r.statusFlag === "dropped");
    expect(q2Result?.outcome).toBe("dropped");
    expect(q2Result?.marksAwarded).toBe(0);
  });

  it("awards full marks for a bonus question even when the candidate left it unanswered", () => {
    const questions = [q({ id: "q1", statusFlag: "bonus_awarded" }), q({ id: "q2", correctOptionId: "opt-a" })];
    const answers: ScoringAnswer[] = [{ questionId: "q2", selectedOptionId: "opt-a", numericAnswer: null }]; // q1 left blank
    const result = calculateFromAnswerKey({ questions, answers, hasMarkingScheme: true, candidateAnswerLabels: labels([]), officialAnswerLabels: labels([]) });
    expect(result.bonusCount).toBe(1);
    expect(result.finalScore).toBe(4); // both full marks
    const bonusResult = result.questionWiseResults.find((r) => r.statusFlag === "bonus_awarded");
    expect(bonusResult?.outcome).toBe("bonus");
    expect(bonusResult?.marksAwarded).toBe(2);
  });

  it("awards full bonus marks even when the candidate answered incorrectly", () => {
    const questions = [q({ id: "q1", statusFlag: "bonus_awarded" })];
    const answers: ScoringAnswer[] = [{ questionId: "q1", selectedOptionId: "opt-z", numericAnswer: null }];
    const result = calculateFromAnswerKey({ questions, answers, hasMarkingScheme: true, candidateAnswerLabels: labels([]), officialAnswerLabels: labels([]) });
    expect(result.finalScore).toBe(2);
    expect(result.negativeMarks).toBe(0);
  });

  it("scores a numerical question by exact value match", () => {
    const questions = [q({ id: "q1", correctOptionId: null, correctNumericValue: "42", questionNumber: 1 })];
    const answers: ScoringAnswer[] = [{ questionId: "q1", selectedOptionId: null, numericAnswer: "42" }];
    const result = calculateFromAnswerKey({ questions, answers, hasMarkingScheme: true, candidateAnswerLabels: labels([]), officialAnswerLabels: labels([]) });
    expect(result.correct).toBe(1);
    expect(result.finalScore).toBe(2);
  });

  it("marks disputed questions with the flag but still scores them against the current answer", () => {
    const questions = [q({ id: "q1", statusFlag: "disputed" })];
    const answers: ScoringAnswer[] = [{ questionId: "q1", selectedOptionId: "opt-b", numericAnswer: null }];
    const result = calculateFromAnswerKey({ questions, answers, hasMarkingScheme: true, candidateAnswerLabels: labels([]), officialAnswerLabels: labels([]) });
    expect(result.correct).toBe(1);
    const r = result.questionWiseResults.find((x) => x.questionNumber === 1);
    expect(r?.statusFlag).toBe("disputed");
    expect(r?.outcome).toBe("correct");
  });

  it("does not mutate the caller's questions array", () => {
    const questions = [q({ id: "q2", questionNumber: 2 }), q({ id: "q1", questionNumber: 1 })];
    const originalOrder = questions.map((x) => x.id);
    calculateFromAnswerKey({ questions, answers: [], hasMarkingScheme: true, candidateAnswerLabels: labels([]), officialAnswerLabels: labels([]) });
    expect(questions.map((x) => x.id)).toEqual(originalOrder);
  });

  it("reports candidate and official answer labels per question for review", () => {
    const questions = [q({ id: "q1" })];
    const answers: ScoringAnswer[] = [{ questionId: "q1", selectedOptionId: "opt-z", numericAnswer: null }];
    const result = calculateFromAnswerKey({
      questions,
      answers,
      hasMarkingScheme: true,
      candidateAnswerLabels: labels([["q1", "D"]]),
      officialAnswerLabels: labels([["q1", "B"]]),
    });
    expect(result.questionWiseResults[0]?.candidateAnswer).toBe("D");
    expect(result.questionWiseResults[0]?.officialAnswer).toBe("B");
  });
});
