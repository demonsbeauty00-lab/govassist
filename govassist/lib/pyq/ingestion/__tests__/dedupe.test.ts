import { describe, it, expect } from "vitest";
import { detectDuplicates } from "../dedupe";
import { hashQuestionContent } from "../hash";
import { ParsedQuestion } from "../types";

function makeQuestion(overrides: Partial<ParsedQuestion> = {}): ParsedQuestion {
  return {
    questionNumber: 1,
    questionType: "mcq_single",
    prompt: "What is the capital of India?",
    promptImageUrl: null,
    options: [
      { label: "A", text: "Mumbai", isCorrect: false },
      { label: "B", text: "New Delhi", isCorrect: true },
    ],
    correctNumericValue: null,
    explanation: null,
    topic: null,
    sectionName: null,
    marks: 1,
    negativeMarks: 0,
    sourceReference: "Q1",
    confidence: 0.9,
    ...overrides,
  };
}

describe("detectDuplicates", () => {
  it("flags a question whose content hash already exists", () => {
    const q = makeQuestion();
    const hash = hashQuestionContent(q.prompt, q.options.map((o) => o.text));
    const existing = new Map([[hash, "existing-question-id"]]);
    const [result] = detectDuplicates([q], existing);
    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateOfQuestionId).toBe("existing-question-id");
  });

  it("does not flag a genuinely new question", () => {
    const q = makeQuestion();
    const [result] = detectDuplicates([q], new Map());
    expect(result.isDuplicate).toBe(false);
    expect(result.duplicateOfQuestionId).toBeNull();
  });
});
