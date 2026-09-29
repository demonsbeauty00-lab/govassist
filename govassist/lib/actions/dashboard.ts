"use server";

import { requireUser } from "./session";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { computeAttemptPercentage } from "@/lib/pyq/analytics";
import { AnswerKeyPaperInput, RecentAttemptInput } from "@/lib/dashboard/personalized";

export interface DashboardSummary {
  unreadNotificationCount: number;
  documentsUploadedCount: number;
  recentDocumentTypes: string[]; // up to 3, most recently uploaded first
  mockTests: {
    completedCount: number;
    averageScorePercent: number | null; // null when nothing submitted yet — never a fabricated 0%
  };
  publishedPaperCount: number;
}

const EMPTY_SUMMARY: DashboardSummary = {
  unreadNotificationCount: 0,
  documentsUploadedCount: 0,
  recentDocumentTypes: [],
  mockTests: { completedCount: 0, averageScorePercent: null },
  publishedPaperCount: 0,
};

/** Lightweight — runs on every page (the desktop top bar calls this on
 *  mount from every route), so it deliberately only touches profile name
 *  + unread count rather than the full dashboard aggregation below. */
export async function getTopBarInfoAction(): Promise<{ error?: string; fullName: string | null; email: string | null; unreadNotificationCount: number }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, fullName: null, email: null, unreadNotificationCount: 0 };
  const { supabase, user } = result;

  const [{ data: profile }, { count: unreadCount }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
  ]);

  return { fullName: profile?.full_name ?? null, email: user.email ?? null, unreadNotificationCount: unreadCount ?? 0 };
}

/**
 * One aggregation query per widget rather than a giant join — this only
 * runs once per dashboard load, and each piece already has its own
 * well-understood RLS boundary (notifications/documents/paper_attempts
 * are all user-owned), so keeping them separate is easier to reason about
 * than a single cross-table query.
 */
export async function getDashboardSummaryAction(): Promise<{ error?: string; summary: DashboardSummary }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, summary: EMPTY_SUMMARY };
  const { supabase, user } = result;

  const [{ count: unreadCount }, { data: documents }, { data: attempts }, { count: paperCount }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
    supabase.from("documents").select("document_type, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("paper_attempts").select("score, max_score").eq("user_id", user.id).eq("status", "submitted"),
    supabase.from("papers").select("id", { count: "exact", head: true }).eq("status", "published"),
  ]);

  const submittedAttempts = attempts ?? [];
  const averageScorePercent =
    submittedAttempts.length > 0
      ? Math.round(
          (submittedAttempts.reduce((sum, a) => sum + (a.max_score > 0 ? a.score / a.max_score : 0), 0) / submittedAttempts.length) * 100
        )
      : null;

  return {
    summary: {
      unreadNotificationCount: unreadCount ?? 0,
      documentsUploadedCount: (documents ?? []).length,
      recentDocumentTypes: (documents ?? []).slice(0, 3).map((d) => d.document_type),
      mockTests: { completedCount: submittedAttempts.length, averageScorePercent },
      publishedPaperCount: paperCount ?? 0,
    },
  };
}

/**
 * The REAL-data inputs to the personalized dashboard (everything except the
 * exam catalog, which is still sample data — see app/(app)/home/page.tsx):
 * papers that have an official answer key recorded and are relevant to the
 * user (their saved exams, or a paper they've attempted), and their latest
 * submitted mock attempts. Every read is the signed-in user's own session
 * client, so RLS applies exactly as everywhere else — attempts are only
 * ever the user's own, papers are the published-only public set.
 */
export async function getPersonalizedRealDataAction(): Promise<{
  error?: string;
  answerKeyPapers: AnswerKeyPaperInput[];
  recentAttempts: RecentAttemptInput[];
}> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, answerKeyPapers: [], recentAttempts: [] };
  const { supabase, user } = result;

  const [{ data: profile }, { data: attempts }] = await Promise.all([
    supabase.from("profiles").select("saved_exam_slugs").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("paper_attempts")
      .select("id, paper_id, score, max_score, submitted_at")
      .eq("user_id", user.id)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(20),
  ]);

  const savedSlugs = profile?.saved_exam_slugs ?? [];
  const attemptRows = (attempts ?? []).filter((a) => a.submitted_at !== null);
  const attemptedPaperIds = Array.from(new Set(attemptRows.map((a) => a.paper_id)));

  const [{ data: bySlug }, { data: byAttempt }] = await Promise.all([
    savedSlugs.length > 0
      ? supabase.from("papers").select("id, title, answer_key_status, answer_key_published_at").eq("status", "published").not("answer_key_status", "is", null).in("exam_slug", savedSlugs)
      : Promise.resolve({ data: [] as { id: string; title: string; answer_key_status: "provisional" | "revised" | "final" | null; answer_key_published_at: string | null }[] }),
    attemptedPaperIds.length > 0
      ? supabase.from("papers").select("id, title, answer_key_status, answer_key_published_at").eq("status", "published").in("id", attemptedPaperIds)
      : Promise.resolve({ data: [] as { id: string; title: string; answer_key_status: "provisional" | "revised" | "final" | null; answer_key_published_at: string | null }[] }),
  ]);

  const titleByPaperId = new Map((byAttempt ?? []).map((p) => [p.id, p.title]));

  const answerKeyMap = new Map<string, AnswerKeyPaperInput>();
  for (const p of [...(bySlug ?? []), ...(byAttempt ?? [])]) {
    if (!p.answer_key_status) continue;
    answerKeyMap.set(p.id, { paperId: p.id, title: p.title, status: p.answer_key_status, publishedAt: p.answer_key_published_at });
  }

  const recentAttempts: RecentAttemptInput[] = attemptRows.slice(0, 3).map((a) => ({
    attemptId: a.id,
    paperTitle: titleByPaperId.get(a.paper_id) ?? "Mock test",
    percentage: computeAttemptPercentage(a.score, a.max_score),
    submittedAt: a.submitted_at as string,
  }));

  return { answerKeyPapers: Array.from(answerKeyMap.values()), recentAttempts };
}
