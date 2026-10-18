import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOptionsForQuestions, QuestionOptionRow } from "./load-options";

/** Service-role wrapper around loadOptionsForQuestions (option rows have no user-facing RLS). */
export async function loadOptionsAdmin(client: ReturnType<typeof createAdminClient>, questionIds: string[]): Promise<QuestionOptionRow[]> {
  return loadOptionsForQuestions(
    {
      fetchBatch: async (ids) => {
        const { data, error } = await client.from("question_options").select("*").in("question_id", ids);
        return { data: (data ?? null) as QuestionOptionRow[] | null, error };
      },
    },
    questionIds
  );
}
