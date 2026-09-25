import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { Database } from "@/lib/supabase/database.types";
import { notifySavedUsers } from "./notify";

type DetectedUpdateRow = Database["public"]["Tables"]["detected_updates"]["Row"];
type ExamCyclesUpdate = Database["public"]["Tables"]["exam_cycles"]["Update"];

const NOTIFICATION_TITLES: Record<DetectedUpdateRow["update_type"], (examName: string) => string> = {
  new_notification: (n) => `${n} — new notification released`,
  corrigendum: (n) => `${n} — corrigendum released`,
  application_start_date: (n) => `${n} — applications are now open`,
  application_end_date_change: (n) => `${n} — application deadline changed`,
  exam_date: (n) => `${n} — exam date announced`,
  admit_card: (n) => `${n} admit card is now available`,
  answer_key: (n) => `${n} answer key has been released`,
  response_sheet: (n) => `${n} — response sheet available`,
  objection_window: (n) => `${n} — objection window is open`,
  result: (n) => `${n} result has been declared`,
  cutoff: (n) => `${n} — official cutoffs published`,
  other: (n) => `${n} — official update`,
};

/** Maps a detected update's type + extracted fields onto the specific
 *  exam_cycles columns it should change. Only touches what that update
 *  type genuinely represents — a corrigendum notification never silently
 *  changes an age limit, for instance. */
function buildExamCycleUpdate(update: DetectedUpdateRow): ExamCyclesUpdate {
  const fields = new Map(update.extracted_fields.map((f) => [f.label, f.value]));

  switch (update.update_type) {
    case "application_start_date":
      return update.publication_date ? { application_start_date: update.publication_date } : {};
    case "application_end_date_change":
      return update.publication_date ? { application_end_date: update.publication_date } : {};
    case "admit_card":
      return {
        admit_card_date: update.publication_date,
        admit_card_url: update.document_url,
        current_status: "admit_card_available",
      };
    case "answer_key":
      return {
        answer_key_date: update.publication_date,
        answer_key_url: update.document_url,
        current_status: "answer_key_available",
      };
    case "result":
      return {
        result_date: update.publication_date,
        result_url: update.document_url,
        current_status: "result_declared",
      };
    case "objection_window":
      return { current_status: "objection_window_open" };
    case "cutoff":
      return { cutoff_summary: fields.get("Cutoff") ?? update.title };
    default:
      // corrigendum / exam_date / response_sheet / other / new_notification:
      // informational — the notification itself is the value; no single
      // column captures "a corrigendum was issued" without risking
      // overwriting something more specific than the notice actually said.
      return {};
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

  if (update.exam_cycle_id) {
    const cyclePatch = buildExamCycleUpdate(update);
    if (Object.keys(cyclePatch).length > 0) {
      const { error: patchError } = await supabase
        .from("exam_cycles")
        .update({ ...cyclePatch, updated_at: now })
        .eq("id", update.exam_cycle_id);
      if (patchError) return { error: patchError.message };
    }

    const { data: cycle } = await supabase
      .from("exam_cycles")
      .select("exam_id")
      .eq("id", update.exam_cycle_id)
      .maybeSingle();
    if (cycle) {
      const { data: exam } = await supabase.from("exams").select("slug, short_name").eq("id", cycle.exam_id).maybeSingle();
      if (exam) {
        examSlug = exam.slug;
        examName = exam.short_name;
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

  if (examSlug) {
    await notifySavedUsers({
      examSlug,
      title: NOTIFICATION_TITLES[update.update_type as keyof typeof NOTIFICATION_TITLES](examName),
      body: `Source: Official ${update.official_url.includes("http") ? new URL(update.official_url).hostname : update.official_url}. ${update.title}`,
      type: update.update_type === "admit_card" ? "admit_card" : update.update_type === "result" ? "result" : "system",
    });
  }

  return {};
}
