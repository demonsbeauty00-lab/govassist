"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { ingestPaper } from "@/lib/pyq/ingestion/run";

/** Same authorization boundary as lib/actions/admin-review.ts's
 *  requireAdmin() — re-checked independently here rather than trusted,
 *  since every function below uses the admin client afterward, which
 *  bypasses RLS entirely. */
async function requireAdmin() {
  const result = await requireUser();
  if (!result.ok) return { ok: false as const, error: MISSING_SUPABASE_CONFIG_MESSAGE };

  const { data } = await result.supabase.from("admins").select("user_id").eq("user_id", result.user.id).maybeSingle();
  if (!data) return { ok: false as const, error: "You don't have access to this." };

  return { ok: true as const, userId: result.user.id };
}

export async function listPendingPapersAction() {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error, papers: [] };

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("papers").select("*").eq("status", "needs_review").order("created_at", { ascending: false });
  if (error) return { error: error.message, papers: [] };
  return { error: null, papers: data ?? [] };
}

export async function getPendingPaperQuestionsAction(paperId: string) {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error, questions: [] };

  const supabase = createAdminClient();
  const [{ data: questions }, { data: options }] = await Promise.all([
    supabase.from("questions").select("*").eq("paper_id", paperId).order("question_number", { ascending: true }),
    supabase.from("question_options").select("*"),
  ]);
  const optionsByQuestion = new Map<string, typeof options>();
  for (const opt of options ?? []) {
    const list = optionsByQuestion.get(opt.question_id) ?? [];
    list.push(opt);
    optionsByQuestion.set(opt.question_id, list);
  }
  const withOptions = (questions ?? []).map((q) => ({ ...q, options: optionsByQuestion.get(q.id) ?? [] }));
  return { error: null, questions: withOptions };
}

/** Publishes a pending paper — and every question currently attached to
 *  it, since the paper is the reviewable unit (see run.ts's comment on
 *  question.status). Mirrors approveDetectedUpdateAction's shape. */
export async function approvePaperAction(paperId: string): Promise<{ error?: string; success?: boolean }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error: paperError } = await supabase
    .from("papers")
    .update({ status: "published", verified_by: admin.userId, verified_at: now, updated_at: now })
    .eq("id", paperId);
  if (paperError) return { error: paperError.message };

  const { error: questionsError } = await supabase.from("questions").update({ status: "published", updated_at: now }).eq("paper_id", paperId).eq("status", "needs_review");
  if (questionsError) return { error: questionsError.message };

  await supabase.from("paper_ingestion_audit_log").insert({ paper_id: paperId, event_type: "reviewed", reviewer: admin.userId, notes: "Approved and published." });

  revalidatePath("/admin/pyq-reviews");
  revalidatePath("/preparation/pyq");
  return { success: true };
}

export async function rejectPaperAction(paperId: string, notes?: string): Promise<{ error?: string; success?: boolean }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from("papers").update({ status: "rejected", verified_by: admin.userId, verified_at: now, updated_at: now }).eq("id", paperId);
  if (error) return { error: error.message };

  await supabase.from("paper_ingestion_audit_log").insert({ paper_id: paperId, event_type: "reviewed", reviewer: admin.userId, notes: notes ?? "Rejected." });

  revalidatePath("/admin/pyq-reviews");
  return { success: true };
}

export interface ManualIngestionInput {
  documentUrl: string;
  rawContent: string;
  organization: string;
}

/** Admin-triggered manual import — an admin pastes a verified paper's
 *  structured JSON transcript (see lib/pyq/ingestion/parsers/json-paper.parser.ts's
 *  header for what that means and why) plus the official document URL it
 *  came from. Goes through the exact same ingestPaper() pipeline a
 *  scheduled source check would use — same classification, same
 *  duplicate detection, same audit trail. */
export async function runManualIngestionAction(input: ManualIngestionInput): Promise<{ error?: string; success?: boolean; classification?: string | null; paperId?: string | null; duplicate?: boolean }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  if (!input.documentUrl.trim() || !input.rawContent.trim()) {
    return { error: "Both the source document URL and the paper content are required." };
  }

  const outcome = await ingestPaper({
    sourceId: null,
    documentUrl: input.documentUrl.trim(),
    rawContent: input.rawContent,
    organization: input.organization.trim() || "Manual admin import",
    parserVersion: "json-v1",
  });

  if (!outcome.ok) return { error: outcome.error ?? "Ingestion failed." };

  revalidatePath("/admin/pyq-reviews");
  revalidatePath("/preparation/pyq");
  return { success: true, classification: outcome.classification, paperId: outcome.paperId, duplicate: outcome.duplicate };
}
