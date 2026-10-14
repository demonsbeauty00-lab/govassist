import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTypeEnabled } from "@/lib/notifications/preferences";
import { notificationTypeForUpdate } from "@/lib/notifications/relevance";
import type { RequestStatus } from "./constants";
import { planOfficialUpdate, type OfficialUpdateType } from "./official-stage";

export interface OfficialSyncParams {
  updateId: string;
  updateType: OfficialUpdateType;
  /** exam_cycles.id the verified update belongs to. Requests are matched on
   *  THIS ONLY — never by exam name — so an update for one cycle can't leak
   *  into a request about another cycle of the same exam. */
  examCycleId: string | null;
  examName: string;
  publicationDate: string | null;
}

export interface OfficialSyncResult {
  matched: number;
  recorded: number;
  notified: number;
  failed: number;
}

/**
 * Called by applyDetectedUpdate AFTER the exam cycle was patched and the
 * update marked published — i.e. only for verified information. For each
 * open request linked to that exact cycle it:
 *   1. adds a user-visible "official_update" timeline event (idempotent per
 *      request + update through events.dedupe_key),
 *   2. moves the OFFICIAL stage forward / corrects the deadline only where
 *      planOfficialUpdate allows it (never claims an individual portal check),
 *   3. creates one deduplicated in-app notification (same dedupe key as
 *      notifyRelevantUsers, so a user who also saved the exam gets one).
 * Failures are counted and logged, never thrown: the already-published
 * official data must stay as it is.
 */
export async function syncRequestsForOfficialUpdate(
  params: OfficialSyncParams,
  client?: ReturnType<typeof createAdminClient>,
): Promise<OfficialSyncResult> {
  const result: OfficialSyncResult = { matched: 0, recorded: 0, notified: 0, failed: 0 };
  if (!params.examCycleId) return result;
  const admin = client ?? createAdminClient();

  const { data: requests, error } = await admin
    .from("application_requests")
    .select("id, user_id, status, official_stage, application_deadline")
    .eq("exam_cycle_id", params.examCycleId)
    .not("status", "in", "(rejected,cancelled)");
  if (error) {
    console.error("official-sync: couldn't load linked requests", error.code);
    result.failed += 1;
    return result;
  }

  const rows = requests ?? [];
  result.matched = rows.length;
  if (rows.length === 0) return result;

  const { data: profiles } = await admin
    .from("profiles").select("user_id, notification_preferences").in("user_id", rows.map((r) => r.user_id));
  const prefsByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.notification_preferences]));
  const notificationType = notificationTypeForUpdate(params.updateType);

  for (const r of rows) {
    const plan = planOfficialUpdate({
      updateId: params.updateId,
      updateType: params.updateType,
      examName: params.examName,
      publicationDate: params.publicationDate,
      requestId: r.id,
      requestStatus: r.status as RequestStatus,
      requestStage: r.official_stage,
      requestDeadline: r.application_deadline,
    });
    if (!plan) continue;

    // Event first: its unique (request_id, dedupe_key) makes a repeat run a no-op.
    const { error: evErr } = await admin.from("application_request_events").insert({
      request_id: r.id, actor_id: null, actor_role: "system", event_type: "official_update",
      official_stage: plan.eventStage, message: plan.eventMessage, dedupe_key: plan.eventDedupeKey,
    });
    if (evErr) {
      if (evErr.code === "23505") continue; // already recorded for this update
      console.error("official-sync: event insert failed", evErr.code);
      result.failed += 1;
      continue;
    }

    if (plan.newStage || plan.newDeadline) {
      const patch: { official_stage?: typeof r.official_stage; application_deadline?: string; updated_at: string } = {
        updated_at: new Date().toISOString(),
      };
      if (plan.newStage) patch.official_stage = plan.newStage;
      if (plan.newDeadline) patch.application_deadline = plan.newDeadline;
      const { error: updErr } = await admin.from("application_requests").update(patch).eq("id", r.id);
      if (updErr) {
        // The timeline must not claim a change that wasn't stored.
        await admin.from("application_request_events").delete().eq("request_id", r.id).eq("dedupe_key", plan.eventDedupeKey);
        console.error("official-sync: request update failed", updErr.code);
        result.failed += 1;
        continue;
      }
    }
    result.recorded += 1;

    if (!isTypeEnabled(prefsByUser.get(r.user_id) ?? null, notificationType)) continue;
    const { data: inserted, error: nErr } = await admin.from("notifications").upsert(
      {
        user_id: r.user_id,
        title: plan.notificationTitle,
        body: plan.notificationBody,
        type: notificationType,
        dedupe_key: plan.notificationDedupeKey,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    ).select("user_id");
    if (nErr) {
      console.error("official-sync: notification failed", nErr.code);
      result.failed += 1;
    } else {
      result.notified += (inserted ?? []).length;
    }
  }
  return result;
}
