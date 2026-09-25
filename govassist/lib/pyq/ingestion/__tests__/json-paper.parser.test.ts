import { describe, it, expect } from "vitest";
import { jsonPaperParser } from "../json-paper.parser";

const VALID_PAPER = {
  examSlug: "ssc-cgl-2026",
  examShortName: "SSC CGL 2026",
  examCategory: "SSC",
  year: 2023,
  stage: "Tier I",
  shift: "Shift 1",
  title: "SSC CGL 2023 Tier I — Shift 1",
  durationMinutes: 60,
  totalMarks: 200,
  sections: [{ name: "Quantitative Aptitude", orderIndex: 0 }],
  markingSchemes: [{ sectionName: null, correctMarks: 2, incorrectMarks: 0.5, unattemptedMarks: 0 }],
  questions: [
    {
      questionNumber: 1,
      questionType: "mcq_single",
      sectionName: "Quantitative Aptitude",
      prompt: "A train covers 180 km in 3 hours. What is its average speed?",
      options: [
        { label: "A", text: "45 km/h", isCorrect: false },
        { label: "B", text: "60 km/h", isCorrect: true },
      ],
      confidence: 0.95,
    },
  ],
};

describe("jsonPaperParser", () => {
  it("parses a well-formed transcript", () => {
    const result = jsonPaperParser.parse(JSON.stringify(VALID_PAPER), { documentUrl: "https://example.com/paper.pdf", organization: "SSC" });
    expect(result).not.toBeNull();
    expect(result?.questions).toHaveLength(1);
    expect(result?.examSlug).toBe("ssc-cgl-2026");
  });

  it("returns null for invalid JSON", () => {
    expect(jsonPaperParser.parse("not json", { documentUrl: "x", organization: "x" })).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    const { durationMinutes: _durationMinutes, ...withoutDuration } = VALID_PAPER;
    expect(jsonPaperParser.parse(JSON.stringify(withoutDuration), { documentUrl: "x", organization: "x" })).toBeNull();
  });

  it("never fabricates confidence for a question that didn't report one", () => {
    const paper = { ...VALID_PAPER, questions: [{ ...VALID_PAPER.questions[0], confidence: undefined }] };
    const result = jsonPaperParser.parse(JSON.stringify(paper), { documentUrl: "x", organization: "x" });
    // Missing confidence falls back to a conservative 0.5, never 1.0.
    expect(result?.questions[0].confidence).toBe(0.5);
  });

  it("computes a lower paper confidence when structural pieces (sections/marking schemes) are missing", () => {
    const withStructure = jsonPaperParser.parse(JSON.stringify(VALID_PAPER), { documentUrl: "x", organization: "x" });
    const withoutStructure = jsonPaperParser.parse(JSON.stringify({ ...VALID_PAPER, sections: [], markingSchemes: [] }), { documentUrl: "x", organization: "x" });
    expect(withoutStructure!.confidence).toBeLessThan(withStructure!.confidence);
  });
});
