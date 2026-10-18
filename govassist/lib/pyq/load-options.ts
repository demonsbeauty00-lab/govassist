// Loads the answer options for a specific set of questions.
//
// Phase 16: callers used to read the WHOLE question_options table and filter in
// memory. Besides being wasteful, PostgREST returns at most 1000 rows per request
// by default, so once several papers existed a paper's options could be silently
// cut off — and a missing correct option means wrong scoring. Asking only for the
// needed questions, in small batches, keeps every request small and complete.

import type { Database } from "@/lib/supabase/database.types";

export type QuestionOptionRow = Database["public"]["Tables"]["question_options"]["Row"];

const BATCH = 100;

/** Minimal shape of the Supabase client we need — keeps this testable without a database. */
export interface OptionsReader {
  fetchBatch(questionIds: string[]): Promise<{ data: QuestionOptionRow[] | null; error: { message: string } | null }>;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Throws on a failed batch: a partial option list must never be scored as if it were complete. */
export async function loadOptionsForQuestions(reader: OptionsReader, questionIds: string[]): Promise<QuestionOptionRow[]> {
  const unique = Array.from(new Set(questionIds));
  const rows: QuestionOptionRow[] = [];
  for (const ids of chunk(unique, BATCH)) {
    const { data, error } = await reader.fetchBatch(ids);
    if (error) throw new Error(`Could not load answer options: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}
