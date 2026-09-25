"use server";

import { requireUser } from "./session";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

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
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
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
