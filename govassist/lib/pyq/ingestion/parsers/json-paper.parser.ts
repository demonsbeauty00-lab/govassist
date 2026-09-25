// ---------------------------------------------------------------------------
// json-paper.parser.ts — the bundled parser, version "json-v1".
//
// Honesty note, same spirit as this project's OCR/source-monitoring
// parsers: this is NOT a live PDF/OCR scraper for an arbitrary government
// notice PDF. Building a real one (layout-aware PDF text extraction,
// OCR for scanned/image-based papers, per-organization format handling)
// is a much larger undertaking than this environment can verify without
// network access or a document-processing provider wired in — see
// README's "Simulated, not silently pretended" section for the same
// honesty standard applied to lib/ocr/extract.ts.
//
// What this parser actually does: validates and maps a STRUCTURED JSON
// transcript of a paper into the pipeline's ParsedPaper shape. The
// realistic path to real, verified PYQ content today is a person (or a
// separately-run, human-supervised OCR/LLM extraction step outside this
// app) transcribing an official PDF into this JSON shape — at which point
// this parser, the duplicate-detection step, and the confidence-based
// classification all apply to it exactly the same way they would to
// output from a fully automated scraper later. Swapping in a real
// PDF/OCR-backed parser later only means registering a new entry in
// registry.ts — nothing else in the pipeline changes.
//
// Expected JSON shape (see lib/pyq/ingestion/__tests__ for a worked
// example):
// {
//   "examSlug": "ssc-cgl-2026", "examShortName": "SSC CGL 2026",
//   "examCategory": "SSC", "year": 2023, "stage": "Tier I", "shift": "Shift 1",
//   "title": "SSC CGL 2023 Tier I — 14 Jul 2023, Shift 1",
//   "durationMinutes": 60, "totalMarks": 200,
//   "sections": [{ "name": "Quantitative Aptitude", "orderIndex": 0 }],
//   "markingSchemes": [{ "sectionName": null, "correctMarks": 2, "incorrectMarks": 0.5, "unattemptedMarks": 0 }],
//   "questions": [{
//     "questionNumber": 1, "questionType": "mcq_single", "sectionName": "Quantitative Aptitude",
//     "prompt": "...", "options": [{ "label": "A", "text": "...", "isCorrect": false }, ...],
//     "confidence": 0.95
//   }]
// }
// ---------------------------------------------------------------------------

import { PaperParser, ParsedPaper, ParsedQuestion, ParsedOption } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseOption(raw: unknown): ParsedOption | null {
  if (!isRecord(raw)) return null;
  const label = typeof raw.label === "string" ? raw.label : null;
  const text = typeof raw.text === "string" ? raw.text : null;
  if (!label || !text) return null;
  return { label, text, isCorrect: raw.isCorrect === true };
}

function parseQuestion(raw: unknown): ParsedQuestion | null {
  if (!isRecord(raw)) return null;
  const questionNumber = typeof raw.questionNumber === "number" ? raw.questionNumber : null;
  const prompt = typeof raw.prompt === "string" ? raw.prompt : null;
  if (questionNumber === null || !prompt) return null;

  const questionType =
    raw.questionType === "mcq_multiple" || raw.questionType === "numerical" ? raw.questionType : "mcq_single";

  const options = Array.isArray(raw.options) ? raw.options.map(parseOption).filter((o): o is ParsedOption => o !== null) : [];

  // Never invent a confidence the source JSON didn't provide — a missing
  // field is treated as "unassessed", which classify.ts's REJECT_BELOW /
  // HIGH_CONFIDENCE_THRESHOLD bar then routes to needs_review, not
  // auto_publish, precisely because nothing actually vouched for it.
  const confidence = typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;

  return {
    questionNumber,
    questionType,
    prompt,
    promptImageUrl: typeof raw.promptImageUrl === "string" ? raw.promptImageUrl : null,
    options,
    correctNumericValue: typeof raw.correctNumericValue === "string" ? raw.correctNumericValue : null,
    explanation: typeof raw.explanation === "string" ? raw.explanation : null,
    topic: typeof raw.topic === "string" ? raw.topic : null,
    sectionName: typeof raw.sectionName === "string" ? raw.sectionName : null,
    marks: typeof raw.marks === "number" ? raw.marks : null,
    negativeMarks: typeof raw.negativeMarks === "number" ? raw.negativeMarks : null,
    sourceReference: typeof raw.sourceReference === "string" ? raw.sourceReference : `Q${questionNumber}`,
    confidence,
  };
}

export const jsonPaperParser: PaperParser = {
  version: "json-v1",
  parse(rawContent) {
    let data: unknown;
    try {
      data = JSON.parse(rawContent);
    } catch {
      return null; // Not valid JSON — the orchestrator treats a null return as "nothing usable extracted".
    }
    if (!isRecord(data)) return null;

    const examSlug = typeof data.examSlug === "string" ? data.examSlug : null;
    const examShortName = typeof data.examShortName === "string" ? data.examShortName : null;
    const examCategory = typeof data.examCategory === "string" ? data.examCategory : null;
    const year = typeof data.year === "number" ? data.year : null;
    const stage = typeof data.stage === "string" ? data.stage : null;
    const title = typeof data.title === "string" ? data.title : null;
    const durationMinutes = typeof data.durationMinutes === "number" ? data.durationMinutes : null;

    if (!examSlug || !examShortName || !examCategory || !year || !stage || !title || !durationMinutes) {
      return null; // Missing a required field — never guess a paper's identity/duration.
    }

    const questions = Array.isArray(data.questions)
      ? data.questions.map(parseQuestion).filter((q): q is ParsedQuestion => q !== null)
      : [];

    const sections = Array.isArray(data.sections)
      ? data.sections
          .filter(isRecord)
          .map((s, i) => ({
            name: typeof s.name === "string" ? s.name : `Section ${i + 1}`,
            orderIndex: typeof s.orderIndex === "number" ? s.orderIndex : i,
            durationMinutes: typeof s.durationMinutes === "number" ? s.durationMinutes : null,
          }))
      : [];

    const markingSchemes = Array.isArray(data.markingSchemes)
      ? data.markingSchemes.filter(isRecord).map((m) => ({
          sectionName: typeof m.sectionName === "string" ? m.sectionName : null,
          correctMarks: typeof m.correctMarks === "number" ? m.correctMarks : 1,
          incorrectMarks: typeof m.incorrectMarks === "number" ? m.incorrectMarks : 0,
          unattemptedMarks: typeof m.unattemptedMarks === "number" ? m.unattemptedMarks : 0,
        }))
      : [];

    // Overall confidence: the average of every question's own confidence,
    // pulled down by any structurally missing piece (no sections/marking
    // scheme at all is itself a signal this transcript is incomplete).
    // Never a flat constant — a paper with zero questions must never
    // compute a false "1.0".
    const avgQuestionConfidence =
      questions.length > 0 ? questions.reduce((sum, q) => sum + q.confidence, 0) / questions.length : 0;
    const structuralPenalty = (sections.length === 0 ? 0.1 : 0) + (markingSchemes.length === 0 ? 0.1 : 0);
    const confidence = Math.max(0, Math.min(1, avgQuestionConfidence - structuralPenalty));

    const paper: ParsedPaper = {
      examSlug,
      examShortName,
      examCategory,
      year,
      stage,
      shift: typeof data.shift === "string" ? data.shift : null,
      title,
      durationMinutes,
      totalMarks: typeof data.totalMarks === "number" ? data.totalMarks : null,
      sections,
      markingSchemes,
      questions,
      confidence,
    };

    return paper;
  },
};
