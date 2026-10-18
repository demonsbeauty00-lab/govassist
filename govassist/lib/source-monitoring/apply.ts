import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { Database } from "@/lib/supabase/database.types";
import { notifyRelevantUsers } from "./notify-relevant";
import { cancelObsoleteDeadlineReminders } from "./deadline-reminders";
import { refreshCycleEligibility } from "@/lib/eligibility/reevaluate";
import { syncRequestsForOfficialUpdate } from "@/lib/application-requests/official-sync";
import { buildExamCycleUpdate } from "./stage/cycle-patch";
import { buildNotificationBody, noticeTitle } from "./stage/labels";
import { publishStageUpdate, supabaseStageStore, type PublishResult } from "./stage/publish";

type DetectedUpdateRow = Database["public"]["Tables"]["detected_updates"]["Row"];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Applies one detected_update: patches the linked exam_cycle (if any and
 * if this update type maps to real column changes), marks the update
 * "published", logs it, and notifies users who saved that exam. Used by
 * both the auto-publish path (checker.ts, for classification ===
 * "auto_publish") and admin approval (lib/actions/admin-review.ts) — same
 * function either way, so an auto-published update and a human-approved
 * one go through identical, auditable logic.
 */
export async function applyDetectedUpdate(updateId: string, reviewedBy: string | null): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: update } = await supabase.from("detected_updates").select("*").eq("id", updateId).maybeSingle();
  if (!update) return { error: "Update not found." };
  if (update.status === "published") return {}; // idempotent — already applied

  let examName = update.title;
  let examSlug: string | null = null;
  let examCategory: string | null = null;
  let examState: string | null = null;
  let organization = hostOf(update.official_url);

  let stage: PublishResult | null = null;

  if (update.exam_cycle_id) {
    const { data: cycle } = await supabase
      .from("exam_cycles")
      .select("exam_id, current_status")
      .eq("id", update.exam_cycle_id)
      .maybeSingle();

    let recruitingBody: string | null = null;
    if (cycle) {
      const { data: exam } = await supabase
        .from("exams")
        .select("slug, short_name, category, state, recruiting_body")
        .eq("id", cycle.exam_id)
        .maybeSingle();
      if (exam) {
        examSlug = exam.slug;
        examName = exam.short_name;
        examCategory = exam.category;
        examState = exam.state;
        recruitingBody = exam.recruiting_body;
      }
    }

    // Phase 13: record the verified document in the user-facing history table
    // first. A duplicate or a late-arriving OLDER document must never overwrite
    // the cycle's current data, so the cycle patch below depends on this result.
    const { data: source } = await supabase.from("notification_sources").select("organization").eq("id", update.source_id).maybeSingle();
    organization = source?.organization || recruitingBody || hostOf(update.official_url);

    stage = await publishStageUpdate({
      store: supabaseStageStore(supabase),
      update,
      organization,
      verification: reviewedBy ? "admin_verified" : "auto_verified",
    });
    if (!stage.ok) return { error: stage.error ?? "Could not record the official update." };

    if (stage.supersededIds.length > 0) {
      await supabase.from("source_audit_log").insert({
        source_id: update.source_id,
        detected_update_id: update.id,
        event_type: "superseded",
        new_value: { superseded_stage_update_ids: stage.supersededIds, version: stage.version },
        detected_at: now,
      });
    }

    const patchApplies = stage.isLatest && (stage.action === "new" || stage.action === "supersede" || stage.action === "already");
    if (patchApplies) {
      const cyclePatch = buildExamCycleUpdate(update, cycle?.current_status ?? null);
      if (Object.keys(cyclePatch).length > 0) {
        const { error: patchError } = await supabase
          .from("exam_cycles")
          .update({ ...cyclePatch, updated_at: now })
          .eq("id", update.exam_cycle_id);
        if (patchError) return { error: patchError.message };
        // Phase 14: a changed deadline makes older reminders obsolete. Failure is
        // non-fatal (new-date reminders use new dedupe keys anyway).
        if ("application_end_date" in cyclePatch) {
          try {
            await cancelObsoleteDeadlineReminders(supabase, update.exam_cycle_id, cyclePatch.application_end_date ?? null);
          } catch {
            console.error("apply: could not cancel obsolete reminders");
          }
        }
      }
    }
  }
  // If exam_cycle_id is null (a genuinely new notification with nothing to
  // link to yet), this function still records and notifies about the
  // detection itself — creating the actual new exam_cycles row is a
  // separate, deliberate editorial action (see scripts/seed-exams.example.ts),
  // not something this function does implicitly.

  const { error: statusError } = await supabase
    .from("detected_updates")
    .update({ status: "published", processed_at: now, reviewed_by: reviewedBy, reviewed_at: reviewedBy ? now : null })
    .eq("id", updateId);
  if (statusError) return { error: statusError.message };

  await supabase.from("source_audit_log").insert({
    source_id: update.source_id,
    detected_update_id: update.id,
    event_type: "published",
    reviewer: reviewedBy,
    processing_status: "published",
    detected_at: now,
    processed_at: now,
  });

  // Phase 8: targeted fan-out (applied → saved → opted-in eligible) instead
  // of saved-only. Runs when there's anything to target by — an exam slug
  // (saved users) and/or a linked cycle (applied / eligible users).
  // A duplicate document, or an older one that arrived late, carries no new
  // information for anyone - recorded above, but nobody is alerted again.
  const quiet = stage?.action === "duplicate" || stage?.action === "historical";
  if (!quiet && (examSlug || update.exam_cycle_id)) {
    await notifyRelevantUsers({
      updateId: update.id,
      updateType: update.update_type,
      examCycleId: update.exam_cycle_id,
      examSlug,
      examCategory,
      examState,
      title: noticeTitle(update.update_type, examName, stage?.action === "supersede"),
      body: buildNotificationBody({
        organization,
        publicationDate: update.publication_date,
        sourceUrl: update.document_url ?? update.official_url,
        title: update.title,
      }),
      organization,
      sourceUrl: update.document_url ?? update.official_url,
      publishedOn: update.publication_date,
      stageUpdateId: stage?.stageUpdateId ?? null,
    });
  }

  // Phase 11: tell users who asked for application assistance on THIS cycle.
  // Never allowed to undo or fail the already-published official update.
  if (update.exam_cycle_id) {
    try {
      await syncRequestsForOfficialUpdate({
        updateId: update.id,
        updateType: update.update_type,
        examCycleId: update.exam_cycle_id,
        examName,
        publicationDate: update.publication_date,
      });
    } catch (e) {
      console.error("apply: application-request sync failed", e instanceof Error ? e.message : "unknown");
    }
  }

  // Phase 12: re-run the existing eligibility engine for this cycle. A cycle
  // whose rules/corrigendum state didn't change is skipped (fingerprint), so
  // this is cheap for admit-card/result updates. Never fails the update.
  if (update.exam_cycle_id) await refreshCycleEligibility(update.exam_cycle_id);

  return {};
}
