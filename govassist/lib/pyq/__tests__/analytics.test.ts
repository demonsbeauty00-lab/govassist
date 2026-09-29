import { describe, it, expect } from "vitest";
import {
  computeAttemptPercentage,
  computeAverageTimePerQuestionSeconds,
  computeMarksBreakdown,
  computePaperPerformanceHistory,
  computeSectionBreakdown,
  AttemptHistoryPoint,
  SectionAwareQuestion,
} from "../analytics";
import { scoreAttempt } from "../scoring";

const QUESTIONS: SectionAwareQuestion[] = [
  { id: "q1", correctOptionId: "q1-b", correctNumericValue: null, marks: 2, negativeMarks: 0.5, sectionId: "sec-1", sectionName: "Quant" },
  { id: "q2", correctOptionId: "q2-a", correctNumericValue: null, marks: 2, negativeMarks: 0.5, sectionId: "sec-1", sectionName: "Quant" },
  { id: "q3", correctOptionId: "q3-c", correctNumericValue: null, marks: 2, negativeMarks: 0.5, sectionId: "sec-2", sectionName: "Reasoning" },
  { id: "q4", correctOptionId: "q4-d", correctNumericValue: null, marks: 2, negativeMarks: 0.5, sectionId: "sec-2", sectionName: "Reasoning" },
];

describe("computeSectionBreakdown", () => {
  it("groups per-question results by section", () => {
    const outcome = scoreAttempt(QUESTIONS, [
      { questionId: "q1", selectedOptionId: "q1-b", numericAnswer: null }, // correct, Quant
      { questionId: "q2", selectedOptionId: "q2-z", numericAnswer: null }, // incorrect, Quant
      { questionId: "q3", selectedOptionId: "q3-c", numericAnswer: null }, // correct, Reasoning
      // q4 unattempted, Reasoning
    ]);
    const breakdown = computeSectionBreakdown(QUESTIONS, outcome);
    expect(breakdown.sections).toHaveLength(2);

    const quant = breakdown.sections.find((s) => s.sectionName === "Quant")!;
    expect(quant.correct).toBe(1);
    expect(quant.incorrect).toBe(1);
    expect(quant.accuracy).toBe(50);

    const reasoning = breakdown.sections.find((s) => s.sectionName === "Reasoning")!;
    expect(reasoning.correct).toBe(1);
    expect(reasoning.unattempted).toBe(1);
    expect(reasoning.accuracy).toBe(100); // 1 correct / 1 attempted
  });

  it("groups sectionless questions under a single General bucket rather than dropping them", () => {
    const generalQuestions: SectionAwareQuestion[] = [
      { id: "q1", correctOptionId: "a", correctNumericValue: null, marks: 1, negativeMarks: 0, sectionId: null, sectionName: "General" },
      { id: "q2", correctOptionId: "b", correctNumericValue: null, marks: 1, negativeMarks: 0, sectionId: null, sectionName: "General" },
    ];
    const outcome = scoreAttempt(generalQuestions, [{ questionId: "q1", selectedOptionId: "a", numericAnswer: null }]);
    const breakdown = computeSectionBreakdown(generalQuestions, outcome);
    expect(breakdown.sections).toHaveLength(1);
    expect(breakdown.sections[0]?.sectionName).toBe("General");
    expect(breakdown.sections[0]?.totalQuestions).toBe(2);
  });
});

describe("computeMarksBreakdown", () => {
  it("separates marks earned from marks lost to negative marking", () => {
    const outcome = scoreAttempt(QUESTIONS, [
      { questionId: "q1", selectedOptionId: "q1-b", numericAnswer: null }, // correct: +2
      { questionId: "q2", selectedOptionId: "q2-z", numericAnswer: null }, // incorrect: -0.5
    ]);
    const { marksEarned, negativeMarksDeducted } = computeMarksBreakdown(outcome);
    expect(marksEarned).toBe(2);
    expect(negativeMarksDeducted).toBe(0.5);
  });
});

describe("computeAttemptPercentage / computeAverageTimePerQuestionSeconds", () => {
  it("computes a percentage of max score", () => {
    expect(computeAttemptPercentage(45, 90)).toBe(50);
  });

  it("never divides by a zero max score", () => {
    expect(computeAttemptPercentage(0, 0)).toBeNull();
  });

  it("computes average seconds per question", () => {
    expect(computeAverageTimePerQuestionSeconds(120, 4)).toBe(30);
  });

  it("never divides by zero questions", () => {
    expect(computeAverageTimePerQuestionSeconds(120, 0)).toBeNull();
  });
});

describe("computePaperPerformanceHistory", () => {
  function point(overrides: Partial<AttemptHistoryPoint>): AttemptHistoryPoint {
    return { attemptId: "a", submittedAt: "2026-01-01T00:00:00Z", score: 10, maxScore: 20, attemptPercentage: 50, accuracy: 60, ...overrides };
  }

  it("never fabricates a trend from a single attempt", () => {
    const history = computePaperPerformanceHistory([point({ attemptId: "a1" })], null);
    expect(history.hasTrend).toBe(false);
    expect(history.previous).toBeNull();
    expect(history.improvementPercentagePoints).toBeNull();
  });

  it("computes improvement between the two most recent attempts", () => {
    const history = computePaperPerformanceHistory(
      [
        point({ attemptId: "a1", submittedAt: "2026-01-01T00:00:00Z", attemptPercentage: 40 }),
        point({ attemptId: "a2", submittedAt: "2026-01-02T00:00:00Z", attemptPercentage: 55 }),
      ],
      null
    );
    expect(history.hasTrend).toBe(true);
    expect(history.latest?.attemptId).toBe("a2");
    expect(history.previous?.attemptId).toBe("a1");
    expect(history.improvementPercentagePoints).toBe(15);
  });

  it("sorts out-of-order input by submission time before comparing", () => {
    const history = computePaperPerformanceHistory(
      [
        point({ attemptId: "a2", submittedAt: "2026-01-02T00:00:00Z", attemptPercentage: 55 }),
        point({ attemptId: "a1", submittedAt: "2026-01-01T00:00:00Z", attemptPercentage: 40 }),
      ],
      null
    );
    expect(history.latest?.attemptId).toBe("a2");
    expect(history.improvementPercentagePoints).toBe(15);
  });

  it("never labels a section weak/strong when fewer than two sections have real accuracy", () => {
    const history = computePaperPerformanceHistory([point({})], { sections: [{ sectionId: "s1", sectionName: "Only Section", totalQuestions: 2, attempted: 1, correct: 1, incorrect: 0, unattempted: 1, marksEarned: 2, negativeMarks: 0, score: 2, maxScore: 4, accuracy: 100 }] });
    expect(history.weakSections).toHaveLength(0);
    expect(history.strongSections).toHaveLength(0);
  });

  it("picks weakest and strongest sections from the latest attempt's breakdown", () => {
    const history = computePaperPerformanceHistory([point({})], {
      sections: [
        { sectionId: "s1", sectionName: "Quant", totalQuestions: 2, attempted: 2, correct: 1, incorrect: 1, unattempted: 0, marksEarned: 2, negativeMarks: 0.5, score: 1.5, maxScore: 4, accuracy: 50 },
        { sectionId: "s2", sectionName: "Reasoning", totalQuestions: 2, attempted: 2, correct: 2, incorrect: 0, unattempted: 0, marksEarned: 4, negativeMarks: 0, score: 4, maxScore: 4, accuracy: 100 },
      ],
    });
    expect(history.weakSections[0]?.sectionName).toBe("Quant");
    expect(history.strongSections[0]?.sectionName).toBe("Reasoning");
  });
});
