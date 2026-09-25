"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyDetectedUpdate } from "@/lib/source-monitoring/apply";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

/**
 * Verifies the signed-in user is a real admin (checked via their own
 * session client against the `admins` table's read-own-row RLS policy —
 * see 0009_admin_roles.sql). This is the actual authorization boundary:
 * every function below re-checks it independently rather than trusting a
 * caller to have checked first, since these actions use the admin client
 * afterward, which bypasses RLS entirely.
 */
async function requireAdmin() {
  const result = await requireUser();
  if (!result.ok) return { ok: false as const, error: MISSING_SUPABASE_CONFIG_MESSAGE };

  const { data } = await result.supabase.from("admins").select("user_id").eq("user_id", result.user.id).maybeSingle();
  if (!data) return { ok: false as const, error: "You don't have access to this." };

  return { ok: true as const, userId: result.user.id };
}

export async function listPendingReviewsAction() {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error, updates: [] };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("detected_updates")
    .select("*")
    .eq("status", "pending")
    .neq("classification", "reject")
    .order("detected_at", { ascending: false });

  if (error) return { error: error.message, updates: [] };
  return { error: null, updates: data ?? [] };
}

export async function approveDetectedUpdateAction(updateId: string): Promise<{ error?: string; success?: boolean }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const result = await applyDetectedUpdate(updateId, admin.userId);
  if (result.error) return { error: result.error };

  revalidatePath("/admin/reviews");
  return { success: true };
}

export async function rejectDetectedUpdateAction(updateId: string, notes?: string): Promise<{ error?: string; success?: boolean }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("detected_updates")
    .update({ status: "rejected", processed_at: now, reviewed_by: admin.userId, reviewed_at: now, review_notes: notes ?? null })
    .eq("id", updateId);
  if (error) return { error: error.message };

  await supabase.from("source_audit_log").insert({
    detected_update_id: updateId,
    event_type: "reviewed",
    reviewer: admin.userId,
    processing_status: "rejected",
    notes: notes ?? null,
    detected_at: now,
    processed_at: now,
  });

  revalidatePath("/admin/reviews");
  return { success: true };
}
