// ---------------------------------------------------------------------------
// Types shared across the PYQ ingestion pipeline. Same principle as
// lib/source-monitoring/types.ts: the orchestrator (run.ts) and the
// classifier only ever know about these shapes, so a specific parser or
// storage detail can change without rippling through the whole pipeline.
// ---------------------------------------------------------------------------

export interface ParsedOption {
  label: string; // "A" | "B" | "C" | "D" ...
  text: string;
  isCorrect: boolean;
}

export interface ParsedQuestion {
  questionNumber: number;
  questionType: "mcq_single" | "mcq_multiple" | "numerical";
  prompt: string;
  promptImageUrl: string | null;
  options: ParsedOption[]; // empty for question_type = 'numerical'
  correctNumericValue: string | null; // only for question_type = 'numerical'
  explanation: string | null;
  topic: string | null;
  sectionName: string | null;
  marks: number | null;
  negativeMarks: number | null;
  sourceReference: string | null;
  /** 0–1. How confident the extraction is that this question's prompt,
   *  options and correct answer were all read correctly. Never fabricated
   *  as 1.0 by default — a parser that can't assess its own confidence
   *  should report something conservative (see classify.ts). */
  confidence: number;
}

export interface ParsedSection {
  name: string;
  orderIndex: number;
  durationMinutes: number | null;
}

export interface ParsedMarkingScheme {
  sectionName: string | null; // null = paper-wide default
  correctMarks: number;
  incorrectMarks: number;
  unattemptedMarks: number;
}

export interface ParsedPaper {
  examSlug: string;
  examShortName: string;
  examCategory: string;
  year: number;
  stage: string;
  shift: string | null;
  title: string;
  durationMinutes: number;
  totalMarks: number | null;
  sections: ParsedSection[];
  markingSchemes: ParsedMarkingScheme[];
  questions: ParsedQuestion[];
  /** Overall confidence for the paper as a whole — independent of any one
   *  question's confidence, e.g. "were duration/marks/sections reliably
   *  identified at all". */
  confidence: number;
}

/**
 * The contract every paper parser implements. Deliberately narrow and free
 * of I/O — a parser never fetches anything itself (the orchestrator owns
 * that) and never writes to the database (also the orchestrator's job).
 * That split is what makes a parser unit-testable with a fixture instead
 * of a live network call or a live Supabase project.
 */
export interface PaperParser {
  /** Matches paper_ingestion_sources.parser_version. */
  version: string;
  parse(rawContent: string, context: { documentUrl: string; organization: string }): ParsedPaper | null;
}

export type PaperClassification = "auto_publish" | "needs_review" | "reject";

export interface IngestionOutcome {
  ok: boolean;
  duplicate: boolean;
  paperId: string | null;
  classification: PaperClassification | null;
  questionsInserted: number;
  questionsSkippedAsDuplicate: number;
  error: string | null;
}
