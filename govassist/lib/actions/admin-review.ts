"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyDetectedUpdate } from "@/lib/source-monitoring/apply";

/**
 * Verifies the signed-in user is a real admin (checked via their own
 * session client against the `admins` table's read-own-row RLS policy —
 * see 0009_admin_roles.sql). This is the actual authorization boundary:
 * every function below re-checks it independently rather than trusting a
 * caller to have checked first, since these actions use the admin client
 * afterward, which bypasses RLS entirely.
 */

export interface CycleOption { id: string; label: string }

export async function listPendingReviewsAction() {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error, updates: [], cycles: [] as CycleOption[] };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("detected_updates")
    .select("*")
    .eq("status", "pending")
    .neq("classification", "reject")
    .order("detected_at", { ascending: false });

  if (error) return { error: error.message, updates: [], cycles: [] as CycleOption[] };

  // Published cycles an unmatched update can be linked to by hand.
  const { data: cycleRows } = await supabase
    .from("exam_cycles")
    .select("id, cycle_label, exams(short_name)")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(500);
  const cycles: CycleOption[] = ((cycleRows ?? []) as unknown as { id: string; cycle_label: string; exams: { short_name: string } | null }[]).map((c) => ({
    id: c.id,
    label: `${c.exams?.short_name ?? "Exam"} — ${c.cycle_label}`,
  }));

  return { error: null, updates: data ?? [], cycles };
}

/** Manually attach a still-pending update to an exam cycle (the pipeline could
 *  not identify one with confidence). The update stays pending: a human then
 *  approves it as usual, which is what publishes and notifies. */
export async function linkDetectedUpdateToCycleAction(updateId: string, cycleId: string): Promise<{ error?: string; success?: boolean }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { error: admin.error };

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(updateId) || !uuid.test(cycleId)) return { error: "Invalid selection." };

  const supabase = createAdminClient();
  const { data: cycle } = await supabase.from("exam_cycles").select("id").eq("id", cycleId).eq("status", "published").maybeSingle();
  if (!cycle) return { error: "That exam cycle was not found or is not published." };

  const { data: linked, error } = await supabase
    .from("detected_updates")
    .update({ exam_cycle_id: cycleId, cycle_match: "manual" })
    .eq("id", updateId)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!linked || linked.length === 0) return { error: "This update is no longer pending." };

  await supabase.from("source_audit_log").insert({
    detected_update_id: updateId,
    event_type: "reviewed",
    reviewer: admin.userId,
    processing_status: "cycle_linked",
    notes: `Linked to cycle ${cycleId}`,
    detected_at: new Date().toISOString(),
  });

  revalidatePath("/admin/reviews");
  return { success: true };
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
