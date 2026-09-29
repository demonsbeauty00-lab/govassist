"use server";

import { requireUser } from "./session";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { startAttemptAction, submitAttemptAction } from "./pyq";
import { Database } from "@/lib/supabase/database.types";

const BUCKET = "documents"; // reused — see 0012's file header for why
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

export interface AnswerKeyInfo {
  status: "provisional" | "revised" | "final" | null;
  version: number;
  publishedAt: string | null;
  sourceUrl: string | null;
}

/** Public-read — same "published only" boundary as the paper itself
 *  (papers RLS), since this is just paper metadata. */
export async function getAnswerKeyInfoAction(paperId: string): Promise<{ error?: string; info?: AnswerKeyInfo }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };

  const { data, error } = await result.supabase
    .from("papers")
    .select("answer_key_status, answer_key_version, answer_key_published_at, answer_key_source_url")
    .eq("id", paperId)
    .eq("status", "published")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Paper not found." };

  return {
    info: {
      status: data.answer_key_status,
      version: data.answer_key_version,
      publishedAt: data.answer_key_published_at,
      sourceUrl: data.answer_key_source_url,
    },
  };
}

/**
 * Starts (or resumes) a manual answer-entry session for a paper — the
 * "user manually enters/selects their answers" fallback from the brief's
 * section 2C. This is a thin wrapper: it reuses startAttemptAction (and,
 * from the caller's side, saveAttemptAnswerAction / submitAttemptAction /
 * getAttemptResultAction / getAttemptReviewAction from lib/actions/pyq.ts
 * completely unchanged) — a manual entry differs from a mock attempt only
 * in its stored attempt_source, which the result page reads to show
 * "Calculated from official answer key" instead of a mock-test label. See
 * lib/actions/pyq.ts's submitAttemptAction for the shared calculation
 * path both go through.
 */
export async function startManualAnswerKeyEntryAction(paperId: string) {
  return startAttemptAction(paperId, "manual_entry");
}

// ---------------------------------------------------------------------------
// Response sheet upload — brief section 2B. Honesty note: there is no OCR
// or document-parsing provider wired into this environment (same as
// lib/ocr/extract.ts's existing "simulated" extraction for profile
// documents). This action validates and stores the file safely, RLS-
// protected, and creates a `response_sheet_uploads` row — but it does NOT
// pretend to extract answers from it. The row is created with
// status: 'needs_review' and an explicit message directing the person to
// the manual-entry fallback, exactly per the brief's own instruction that
// manual input "should remain a fallback" and that a parser that can't
// reliably extract should "fail safely and mark NEEDS_REVIEW rather than
// producing unreliable marks." Wiring a real parser later only means
// updating the "processing" step below — the storage, RLS, and status
// lifecycle already support it.
// ---------------------------------------------------------------------------

export async function uploadResponseSheetAction(paperId: string, formData: FormData): Promise<{ error?: string; success?: boolean; uploadId?: string }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX_FILE_BYTES) return { error: "That file is too large — the limit is 10MB." };
  if (!ALLOWED_MIME_TYPES.includes(file.type)) return { error: "Only PDF, JPG, and PNG files are supported." };

  const { data: paper } = await supabase.from("papers").select("id").eq("id", paperId).eq("status", "published").maybeSingle();
  if (!paper) return { error: "Paper not found." };

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const storagePath = `${user.id}/response-sheets/${paperId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { data: row, error: insertError } = await supabase
    .from("response_sheet_uploads")
    .insert({
      user_id: user.id,
      paper_id: paperId,
      storage_path: storagePath,
      file_name: file.name,
      status: "needs_review",
      extracted_answers: [],
      error_message:
        "Automatic answer extraction isn't available yet for uploaded response sheets — an admin will need to review this file, or you can enter your answers manually below in the meantime.",
    })
    .select("id")
    .single();

  if (insertError || !row) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { error: insertError?.message ?? "Couldn't save the upload record." };
  }

  return { success: true, uploadId: row.id };
}

export type ResponseSheetUploadRow = Database["public"]["Tables"]["response_sheet_uploads"]["Row"];

export async function getResponseSheetUploadsAction(paperId: string): Promise<{ error?: string; uploads: ResponseSheetUploadRow[] }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, uploads: [] };

  const { data, error } = await result.supabase
    .from("response_sheet_uploads")
    .select("*")
    .eq("paper_id", paperId)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message, uploads: [] };
  return { uploads: data ?? [] };
}

export async function getSignedResponseSheetUrlAction(uploadId: string): Promise<{ url?: string; error?: string }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: upload } = await supabase.from("response_sheet_uploads").select("storage_path, user_id").eq("id", uploadId).maybeSingle();
  if (!upload || upload.user_id !== user.id) return { error: "Upload not found." };

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(upload.storage_path, 60 * 5);
  if (error || !data) return { error: error?.message ?? "Could not create a signed URL." };
  return { url: data.signedUrl };
}

/**
 * Re-scores ONE existing attempt against the paper's CURRENT answer key —
 * explicit and user/admin-triggered, never automatic. Reuses
 * submitAttemptAction's exact scoring path by putting the attempt back to
 * 'in_progress' first (its saved answers are untouched) and re-submitting
 * it — no separate recalculation logic to keep in sync with the real one.
 */
export async function recalculateAttemptAction(attemptId: string): Promise<{ error?: string; success?: boolean }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: attempt } = await supabase.from("paper_attempts").select("id, user_id, status").eq("id", attemptId).maybeSingle();
  if (!attempt || attempt.user_id !== user.id) return { error: "Attempt not found." };
  if (attempt.status !== "submitted") return { error: "Only a submitted attempt can be recalculated." };

  const { error: revertError } = await supabase.from("paper_attempts").update({ status: "in_progress" }).eq("id", attemptId);
  if (revertError) return { error: revertError.message };

  const submitResult = await submitAttemptAction(attemptId);
  if (submitResult.error) return { error: submitResult.error };
  return { success: true };
}

