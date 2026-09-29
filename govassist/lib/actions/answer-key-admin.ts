"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { applyAnswerKeyRevision, AnswerKeyRevisionEntry } from "@/lib/pyq/ingestion/answer-key-revision";
import { isTypeEnabled } from "@/lib/notifications/preferences";

/** Same authorization boundary as lib/actions/pyq-admin.ts's
 *  requireAdmin() — re-checked independently rather than trusted, since
 *  every function below uses the admin client afterward. */
async function requireAdmin() {
  const result = await requireUser();
  if (!result.ok) return { ok: false as const, error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { data } = await result.supabase.from("admins").select("user_id").eq("user_id", result.user.id).maybeSingle();
  if (!data) return { ok: false as const, error: "You don't have access to this." };
  return { ok: true as const, userId: result.user.id };
}

export interface SubmitAnswerKeyRevisionInput {
  paperId: string;
  documentUrl: string;
  status: "provisional" | "revised" | "final";
  publicationDate: string;
  rawEntriesJson: string; // admin-pasted JSON array of AnswerKeyRevisionEntry
}

function parseEntries(raw: string): AnswerKeyRevisionEntry[] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;

  const entries: AnswerKeyRevisionEntry[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.questionNumber !== "number") continue;
    entries.push({
      questionNumber: record.questionNumber,
      correctOptionLabel: typeof record.correctOptionLabel === "string" ? record.correctOptionLabel : undefined,
      correctNumericValue: typeof record.correctNumericValue === "string" ? record.correctNumericValue : undefined,
      statusFlag:
        record.statusFlag === "dropped" || record.statusFlag === "bonus_awarded" || record.statusFlag === "disputed" || record.statusFlag === "normal"
          ? record.statusFlag
          : undefined,
    });
  }
  return entries;
}

export async function getPaperResponseSheetUploadsForAdminAction(paperId: string) {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error, uploads: [] };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("response_sheet_uploads")
    .select("*")
    .eq("paper_id", paperId)
    .in("status", ["pending", "processing", "needs_review"])
    .order("created_at", { ascending: false });

  if (error) return { error: error.message, uploads: [] };
  return { error: null, uploads: data ?? [] };
}

export async function submitAnswerKeyRevisionAction(input: SubmitAnswerKeyRevisionInput) {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const entries = parseEntries(input.rawEntriesJson);
  if (!entries || entries.length === 0) {
    return { error: "Couldn't parse any valid entries — expected a JSON array of { questionNumber, correctOptionLabel | correctNumericValue, statusFlag? }." };
  }

  const outcome = await applyAnswerKeyRevision(input.paperId, {
    documentUrl: input.documentUrl,
    status: input.status,
    publicationDate: input.publicationDate,
    rawContent: input.rawEntriesJson,
    entries,
  });

  if (!outcome.ok) return { error: outcome.error ?? "Revision failed." };

  revalidatePath(`/preparation/pyq/${input.paperId}`);
  return {
    success: true,
    duplicate: outcome.duplicate,
    questionsMatched: outcome.questionsMatched,
    questionsUnmatched: outcome.questionsUnmatched,
    changedCount: outcome.changedCount,
    newVersion: outcome.newVersion,
    staleAttemptCount: outcome.staleAttemptCount,
  };
}

export interface StaleAttemptSummary {
  attemptId: string;
  userId: string;
  score: number;
  submittedAt: string | null;
}

/** Lists a paper's submitted attempts whose stored score was calculated
 *  against an older answer-key version than the paper's current one —
 *  purely informational for the admin (and, on the user's own result
 *  page, for that one user) — never auto-recalculated from here. */
export async function listStaleAttemptsForPaperAction(paperId: string): Promise<{ error?: string; attempts: StaleAttemptSummary[] }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error, attempts: [] };

  const supabase = createAdminClient();
  const { data: paper } = await supabase.from("papers").select("answer_key_version").eq("id", paperId).maybeSingle();
  if (!paper) return { error: "Paper not found.", attempts: [] };

  const { data, error } = await supabase
    .from("paper_attempts")
    .select("id, user_id, score, submitted_at")
    .eq("paper_id", paperId)
    .eq("status", "submitted")
    .lt("answer_key_version_at_submission", paper.answer_key_version);

  if (error) return { error: error.message, attempts: [] };
  return { attempts: (data ?? []).map((a) => ({ attemptId: a.id, userId: a.user_id, score: a.score, submittedAt: a.submitted_at })) };
}

/**
 * Notifies users who have this paper's exam saved or have attempted this
 * specific paper — reuses the real `notifications` table (same one the
 * dashboard bell reads). Honors each recipient's notification preferences
 * (answer keys ride with the 'result' preference) and is idempotent per
 * answer-key VERSION via the (user_id, dedupe_key) unique index from
 * 0013: re-running it for the same version notifies nobody twice, while a
 * newly revised version (version + 1) legitimately notifies again.
 */
export async function notifyUsersOfAnswerKeyAction(paperId: string): Promise<{ error?: string; notified?: number }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const supabase = createAdminClient();
  const { data: paper } = await supabase
    .from("papers")
    .select("title, exam_slug, answer_key_status, answer_key_version")
    .eq("id", paperId)
    .maybeSingle();
  if (!paper) return { error: "Paper not found." };
  if (!paper.answer_key_status || paper.answer_key_version === 0) return { error: "This paper has no answer key recorded yet." };

  const title =
    paper.answer_key_status === "revised" ? `${paper.title} — revised answer key is available` : `${paper.title} answer key is available`;
  const body = "Calculate your expected score from your response sheet or by re-entering your answers.";

  const { data: attemptUserRows } = await supabase.from("paper_attempts").select("user_id").eq("paper_id", paperId);
  const userIds = new Set((attemptUserRows ?? []).map((r) => r.user_id));

  const { data: profilesWithSaved } = await supabase.from("profiles").select("user_id").contains("saved_exam_slugs", [paper.exam_slug]);
  for (const p of profilesWithSaved ?? []) userIds.add(p.user_id);
  if (userIds.size === 0) return { notified: 0 };

  const { data: prefRows } = await supabase.from("profiles").select("user_id, notification_preferences").in("user_id", Array.from(userIds));
  const prefsByUser = new Map((prefRows ?? []).map((r) => [r.user_id, r.notification_preferences]));

  const rows = Array.from(userIds)
    .filter((userId) => isTypeEnabled(prefsByUser.get(userId), "result")) // no profile row -> default (enabled)
    .map((userId) => ({
      user_id: userId,
      title,
      body,
      type: "result" as const,
      dedupe_key: `answerkey:${paperId}:v${paper.answer_key_version}`,
    }));
  if (rows.length === 0) return { notified: 0 };

  const { data: inserted, error } = await supabase
    .from("notifications")
    .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("user_id");
  if (error) return { error: error.message };
  return { notified: inserted?.length ?? 0 };
}
