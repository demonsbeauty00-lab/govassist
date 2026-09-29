import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashDocument } from "./hash";

export interface AnswerKeyRevisionEntry {
  questionNumber: number;
  correctOptionLabel?: string; // for mcq_single/mcq_multiple questions
  correctNumericValue?: string; // for numerical questions
  statusFlag?: "normal" | "dropped" | "bonus_awarded" | "disputed";
}

export interface AnswerKeyRevisionInput {
  documentUrl: string;
  status: "provisional" | "revised" | "final";
  publicationDate: string; // ISO date
  rawContent: string; // the admin-pasted JSON, kept verbatim for hashing/audit
  entries: AnswerKeyRevisionEntry[];
}

export interface AnswerKeyRevisionOutcome {
  ok: boolean;
  duplicate: boolean;
  runId: string | null;
  questionsMatched: number;
  questionsUnmatched: number[]; // question numbers from the input that didn't match any real question
  changedCount: number;
  newVersion: number | null;
  staleAttemptCount: number; // submitted attempts now behind the new version — see result page for the user-facing side of this
  error: string | null;
}

/**
 * Applies a revised/provisional/final answer key to a paper. Matching is
 * strictly by question_number (the brief's priority-1 identifier) — an
 * entry whose questionNumber doesn't exist on this paper is recorded as
 * unmatched and skipped, never guessed at via text similarity. Every
 * actual change (which option flips to/from correct, a status flag
 * change) is logged to paper_ingestion_audit_log with the previous and
 * new value, so a revision is always auditable and never silently
 * overwrites history.
 *
 * Deliberately does NOT recalculate existing paper_attempts rows —
 * see submitAttemptAction's answer_key_version_at_submission snapshot and
 * recalculateAttemptAction (lib/actions/answer-key-admin.ts) for the
 * explicit, user/admin-triggered recalculation step. Silently
 * mass-rewriting historical scores the moment an admin pastes a
 * correction is a bigger, riskier action than this function should take
 * on its own.
 */
export async function applyAnswerKeyRevision(paperId: string, input: AnswerKeyRevisionInput): Promise<AnswerKeyRevisionOutcome> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const contentHash = hashDocument(input.rawContent);

  // The DB's (source_id, content_hash) unique index only applies where
  // source_id is not null — every answer-key revision run has source_id
  // null (admin-authored, not tied to a scheduled source), so that
  // constraint can never catch a duplicate here. Check explicitly instead,
  // the same way Phase 6's manual paper-ingestion path does for the same
  // reason (see run.ts's whole-document duplicate check).
  const { data: existingRun } = await supabase
    .from("paper_ingestion_runs")
    .select("id")
    .eq("paper_id", paperId)
    .eq("run_type", "answer_key_update")
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (existingRun) {
    return { ok: true, duplicate: true, runId: existingRun.id, questionsMatched: 0, questionsUnmatched: [], changedCount: 0, newVersion: null, staleAttemptCount: 0, error: null };
  }

  const { data: run, error: runInsertError } = await supabase
    .from("paper_ingestion_runs")
    .insert({
      source_id: null,
      paper_id: paperId,
      run_type: "answer_key_update",
      document_url: input.documentUrl,
      content_hash: contentHash,
      status: "processing",
    })
    .select("id")
    .single();

  if (runInsertError || !run) {
    return { ok: false, duplicate: false, runId: null, questionsMatched: 0, questionsUnmatched: [], changedCount: 0, newVersion: null, staleAttemptCount: 0, error: runInsertError?.message ?? "Could not create ingestion run." };
  }

  const { data: paper } = await supabase.from("papers").select("answer_key_version").eq("id", paperId).maybeSingle();
  if (!paper) {
    await supabase.from("paper_ingestion_runs").update({ status: "failed", error_message: "Paper not found.", completed_at: now }).eq("id", run.id);
    return { ok: false, duplicate: false, runId: run.id, questionsMatched: 0, questionsUnmatched: [], changedCount: 0, newVersion: null, staleAttemptCount: 0, error: "Paper not found." };
  }

  const { data: questions } = await supabase.from("questions").select("*").eq("paper_id", paperId);
  const { data: options } = await supabase.from("question_options").select("*");
  const questionByNumber = new Map((questions ?? []).map((q) => [q.question_number, q]));
  const optionsByQuestion = new Map<string, typeof options>();
  for (const opt of options ?? []) {
    const list = optionsByQuestion.get(opt.question_id) ?? [];
    list.push(opt);
    optionsByQuestion.set(opt.question_id, list);
  }

  let changedCount = 0;
  let questionsMatched = 0;
  const questionsUnmatched: number[] = [];

  for (const entry of input.entries) {
    const question = questionByNumber.get(entry.questionNumber);
    if (!question) {
      questionsUnmatched.push(entry.questionNumber);
      continue;
    }
    questionsMatched++;

    if (entry.correctOptionLabel) {
      const opts = optionsByQuestion.get(question.id) ?? [];
      const newCorrect = opts.find((o) => o.option_label === entry.correctOptionLabel);
      const previousCorrect = opts.find((o) => o.is_correct);
      if (newCorrect && newCorrect.id !== previousCorrect?.id) {
        for (const opt of opts) {
          const shouldBeCorrect = opt.id === newCorrect.id;
          if (opt.is_correct !== shouldBeCorrect) {
            await supabase.from("question_options").update({ is_correct: shouldBeCorrect }).eq("id", opt.id);
          }
        }
        await supabase.from("paper_ingestion_audit_log").insert({
          run_id: run.id,
          paper_id: paperId,
          event_type: "answer_key_revised",
          previous_value: { questionNumber: entry.questionNumber, correctOptionLabel: previousCorrect?.option_label ?? null },
          new_value: { questionNumber: entry.questionNumber, correctOptionLabel: newCorrect.option_label },
        });
        changedCount++;
      }
    }

    if (entry.correctNumericValue !== undefined && entry.correctNumericValue !== question.correct_numeric_value) {
      await supabase.from("questions").update({ correct_numeric_value: entry.correctNumericValue, updated_at: now }).eq("id", question.id);
      await supabase.from("paper_ingestion_audit_log").insert({
        run_id: run.id,
        paper_id: paperId,
        event_type: "answer_key_revised",
        previous_value: { questionNumber: entry.questionNumber, correctNumericValue: question.correct_numeric_value },
        new_value: { questionNumber: entry.questionNumber, correctNumericValue: entry.correctNumericValue },
      });
      changedCount++;
    }

    if (entry.statusFlag && entry.statusFlag !== question.question_status_flag) {
      await supabase.from("questions").update({ question_status_flag: entry.statusFlag, updated_at: now }).eq("id", question.id);
      await supabase.from("paper_ingestion_audit_log").insert({
        run_id: run.id,
        paper_id: paperId,
        event_type: "answer_key_revised",
        previous_value: { questionNumber: entry.questionNumber, statusFlag: question.question_status_flag },
        new_value: { questionNumber: entry.questionNumber, statusFlag: entry.statusFlag },
      });
      changedCount++;
    }
  }

  const newVersion = paper.answer_key_version + 1;
  await supabase
    .from("papers")
    .update({
      answer_key_status: input.status,
      answer_key_version: newVersion,
      answer_key_published_at: input.publicationDate,
      answer_key_source_url: input.documentUrl,
      updated_at: now,
    })
    .eq("id", paperId);

  const { count: staleAttemptCount } = await supabase
    .from("paper_attempts")
    .select("id", { count: "exact", head: true })
    .eq("paper_id", paperId)
    .eq("status", "submitted")
    .lt("answer_key_version_at_submission", newVersion);

  await supabase
    .from("paper_ingestion_runs")
    .update({ status: "auto_published", extracted_question_count: questionsMatched, completed_at: now })
    .eq("id", run.id);

  return {
    ok: true,
    duplicate: false,
    runId: run.id,
    questionsMatched,
    questionsUnmatched,
    changedCount,
    newVersion,
    staleAttemptCount: staleAttemptCount ?? 0,
    error: null,
  };
}
