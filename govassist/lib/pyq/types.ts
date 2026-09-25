// ---------------------------------------------------------------------------
// Domain types for the PYQ / mock-test system. Same principle as
// lib/eligibility/types.ts: pages and the scoring engine only ever know
// about these shapes, not raw Supabase Row types — see from-db-row.ts for
// the mapping boundary.
// ---------------------------------------------------------------------------

import { Database } from "@/lib/supabase/database.types";

export type PaperStatus = Database["public"]["Tables"]["papers"]["Row"]["status"];
export type QuestionType = Database["public"]["Tables"]["questions"]["Row"]["question_type"];
export type QuestionStatus = Database["public"]["Tables"]["questions"]["Row"]["status"];

export interface PaperOption {
  id: string;
  label: string;
  text: string;
}

/** A question shape SAFE to send to the client while an attempt is still
 *  in progress — deliberately has no `isCorrect` / correct-answer field.
 *  See PaperQuestionWithAnswer for the post-submission review shape. */
export interface AttemptQuestion {
  id: string;
  sectionId: string | null;
  questionNumber: number;
  questionType: QuestionType;
  prompt: string;
  promptImageUrl: string | null;
  options: PaperOption[];
  marks: number;
  negativeMarks: number;
}

/** Same question, but with the correct answer + explanation revealed —
 *  only ever built server-side for an attempt the user has already
 *  submitted (see lib/actions/pyq.ts). */
export interface ReviewQuestion extends AttemptQuestion {
  correctOptionId: string | null;
  correctNumericValue: string | null;
  explanation: string | null;
  userSelectedOptionId: string | null;
  userNumericAnswer: string | null;
  isMarkedForReview: boolean;
  isCorrect: boolean | null;
  marksAwarded: number | null;
}

export interface PaperSectionSummary {
  id: string;
  name: string;
  orderIndex: number;
  questionCount: number;
  durationMinutes: number | null;
}

export interface PaperMarkingScheme {
  correctMarks: number;
  incorrectMarks: number;
  unattemptedMarks: number;
}

export interface PaperSummary {
  id: string;
  examSlug: string;
  examShortName: string;
  examCategory: string;
  year: number;
  stage: string;
  shift: string | null;
  title: string;
  durationMinutes: number;
  totalMarks: number | null;
  totalQuestions: number;
  officialSourceUrl: string;
  sourceDocumentUrl: string | null;
  status: PaperStatus;
}

export interface PaperDetail extends PaperSummary {
  sections: PaperSectionSummary[];
  defaultMarkingScheme: PaperMarkingScheme;
  sectionMarkingSchemes: Record<string, PaperMarkingScheme>; // sectionId -> override
}

export interface AttemptState {
  attemptId: string;
  paperId: string;
  status: "in_progress" | "submitted" | "abandoned";
  startedAt: string;
  durationSeconds: number;
  questions: AttemptQuestion[];
}

export interface AttemptAnswerInput {
  questionId: string;
  selectedOptionId: string | null;
  numericAnswer: string | null;
  isMarkedForReview: boolean;
}

export interface AttemptResult {
  attemptId: string;
  paperId: string;
  paperTitle: string;
  totalQuestions: number;
  attemptedCount: number;
  markedForReviewCount: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  score: number;
  maxScore: number;
  accuracy: number | null;
  timeTakenSeconds: number;
}
