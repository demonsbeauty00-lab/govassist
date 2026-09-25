import { describe, it, expect } from "vitest";
import { classifyPaper, classifyQuestion } from "../classify";
import { ParsedPaper, ParsedQuestion } from "../types";

function makeQuestion(overrides: Partial<ParsedQuestion> = {}): ParsedQuestion {
  return {
    questionNumber: 1,
    questionType: "mcq_single",
    prompt: "A train covers 180 km in 3 hours. What is its average speed?",
    promptImageUrl: null,
    options: [
      { label: "A", text: "45 km/h", isCorrect: false },
      { label: "B", text: "60 km/h", isCorrect: true },
      { label: "C", text: "50 km/h", isCorrect: false },
      { label: "D", text: "55 km/h", isCorrect: false },
    ],
    correctNumericValue: null,
    explanation: null,
    topic: null,
    sectionName: "Quantitative Aptitude",
    marks: 2,
    negativeMarks: 0.5,
    sourceReference: "Q1",
    confidence: 0.95,
    ...overrides,
  };
}

function makePaper(overrides: Partial<ParsedPaper> = {}): ParsedPaper {
  return {
    examSlug: "ssc-cgl-2026",
    examShortName: "SSC CGL 2026",
    examCategory: "SSC",
    year: 2023,
    stage: "Tier I",
    shift: "Shift 1",
    title: "SSC CGL 2023 Tier I — Shift 1",
    durationMinutes: 60,
    totalMarks: 200,
    sections: [{ name: "Quantitative Aptitude", orderIndex: 0, durationMinutes: null }],
    markingSchemes: [{ sectionName: null, correctMarks: 2, incorrectMarks: 0.5, unattemptedMarks: 0 }],
    questions: [makeQuestion()],
    confidence: 0.95,
    ...overrides,
  };
}

describe("classifyQuestion", () => {
  it("auto-publishes a high-confidence mcq_single with exactly one correct option", () => {
    expect(classifyQuestion(makeQuestion())).toBe("auto_publish");
  });

  it("sends a low-confidence question to needs_review, not reject, when it otherwise parsed fine", () => {
    expect(classifyQuestion(makeQuestion({ confidence: 0.5 }))).toBe("needs_review");
  });

  it("rejects a question with an unusably short prompt", () => {
    expect(classifyQuestion(makeQuestion({ prompt: "?" }))).toBe("reject");
  });

  it("rejects a question whose confidence is far too low to trust at all", () => {
    expect(classifyQuestion(makeQuestion({ confidence: 0.05 }))).toBe("reject");
  });

  it("sends an mcq_single with two marked-correct options to needs_review, never auto_publish", () => {
    const q = makeQuestion({
      options: [
        { label: "A", text: "45 km/h", isCorrect: true },
        { label: "B", text: "60 km/h", isCorrect: true },
      ],
    });
    expect(classifyQuestion(q)).toBe("needs_review");
  });

  it("sends an mcq_single with no correct option marked to needs_review", () => {
    const q = makeQuestion({ options: makeQuestion().options.map((o) => ({ ...o, isCorrect: false })) });
    expect(classifyQuestion(q)).toBe("needs_review");
  });

  it("sends a numerical question with no extracted answer to needs_review — never invents one", () => {
    const q = makeQuestion({ questionType: "numerical", options: [], correctNumericValue: null });
    expect(classifyQuestion(q)).toBe("needs_review");
  });

  it("auto-publishes a high-confidence numerical question with a real answer", () => {
    const q = makeQuestion({ questionType: "numerical", options: [], correctNumericValue: "42" });
    expect(classifyQuestion(q)).toBe("auto_publish");
  });
});

describe("classifyPaper", () => {
  it("auto-publishes a paper whose every question is independently auto_publish", () => {
    expect(classifyPaper(makePaper())).toBe("auto_publish");
  });

  it("rejects a paper with zero questions", () => {
    expect(classifyPaper(makePaper({ questions: [] }))).toBe("reject");
  });

  it("rejects a paper whose overall confidence is far too low", () => {
    expect(classifyPaper(makePaper({ confidence: 0.05 }))).toBe("reject");
  });

  it("sends a paper to needs_review when duration wasn't determined, even if every question is otherwise clean", () => {
    expect(classifyPaper(makePaper({ durationMinutes: 0 }))).toBe("needs_review");
  });

  it("sends a mixed-confidence paper to needs_review rather than dropping it", () => {
    const paper = makePaper({ questions: [makeQuestion({ questionNumber: 1, confidence: 0.95 }), makeQuestion({ questionNumber: 2, confidence: 0.5 })] });
    expect(classifyPaper(paper)).toBe("needs_review");
  });

  it("never rejects the whole paper just because one question is unusable — falls back to needs_review", () => {
    const paper = makePaper({
      questions: [makeQuestion({ questionNumber: 1 }), makeQuestion({ questionNumber: 2, prompt: "?", confidence: 0.05 })],
    });
    expect(classifyPaper(paper)).toBe("needs_review");
  });
});
