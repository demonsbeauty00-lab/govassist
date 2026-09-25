import { ParsedQuestion } from "./types";
import { hashQuestionContent } from "./hash";

export interface DedupeResult {
  question: ParsedQuestion;
  contentHash: string;
  isDuplicate: boolean;
  duplicateOfQuestionId: string | null;
}

/**
 * Flags which parsed questions already exist (by normalized content hash)
 * in `existingHashes` — a map of contentHash -> existing question id,
 * scoped by the caller to the same exam (run.ts queries it that way; see
 * that file). Pure and DB-free so it's unit-testable without a live
 * Supabase project — the actual lookup query lives in run.ts.
 */
export function detectDuplicates(
  questions: ParsedQuestion[],
  existingHashes: Map<string, string>
): DedupeResult[] {
  return questions.map((question) => {
    const contentHash = hashQuestionContent(
      question.prompt,
      question.options.map((o) => o.text)
    );
    const duplicateOfQuestionId = existingHashes.get(contentHash) ?? null;
    return { question, contentHash, isDuplicate: duplicateOfQuestionId !== null, duplicateOfQuestionId };
  });
}
