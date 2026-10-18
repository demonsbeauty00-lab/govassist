import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { checkSource } from "@/lib/source-monitoring/checker";
import { applyDetectedUpdate } from "@/lib/source-monitoring/apply";
import { retryFailedDeliveries } from "@/lib/notifications/engine";
import { isRequeueableDelivery, MAX_DELIVERY_ATTEMPTS } from "./retry-rules";
import type { OpsDeps } from "./ops";

type Admin = ReturnType<typeof createAdminClient>;

/** Real dependencies for lib/automation/ops.ts. Service-role client: only
 *  ever built inside server actions AFTER requireAdmin() passed. */
export function supabaseOpsDeps(admin: Admin): OpsDeps {
  return {
    async getSource(id) {
      const { data } = await admin.from("notification_sources").select("id, enabled, needs_parser_maintenance, last_checked_at").eq("id", id).maybeSingle();
      return (data as { id: string; enabled: boolean; needs_parser_maintenance: boolean; last_checked_at: string | null } | null) ?? null;
    },
    async updateSource(id, patch) {
      const { error } = await admin.from("notification_sources").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      return !error;
    },
    async checkSource(id) {
      const { data } = await admin.from("notification_sources").select("*").eq("id", id).maybeSingle();
      if (!data) return { ok: false, changed: false, updatesDetected: 0, duplicatesSkipped: 0, error: "Source not found." };
      const r = await checkSource(data);
      return { ok: r.ok, changed: r.changed, updatesDetected: r.updatesDetected, duplicatesSkipped: r.duplicatesSkipped, error: r.error };
    },
    async getUpdate(id) {
      const { data } = await admin.from("detected_updates").select("status, classification, detected_at").eq("id", id).maybeSingle();
      return (data as { status: string; classification: string; detected_at: string } | null) ?? null;
    },
    // Same function auto-publish and admin approval use: identical, auditable logic.
    applyUpdate: (id) => applyDetectedUpdate(id, null),
    async requeueFailedDeliveries() {
      const { data } = await admin
        .from("notification_deliveries").select("id, status, attempts, last_error")
        .eq("status", "failed").lt("attempts", MAX_DELIVERY_ATTEMPTS).limit(200);
      const ids = ((data ?? []) as unknown as { id: string; status: string; attempts: number; last_error: string | null }[])
        .filter(isRequeueableDelivery).map((d) => d.id);
      if (ids.length === 0) return 0;
      const { error } = await admin.from("notification_deliveries").update({ next_attempt_at: new Date().toISOString() }).in("id", ids);
      return error ? 0 : ids.length;
    },
    runDeliveryRetry: () => retryFailedDeliveries(admin),
    async audit(entry) {
      try {
        await admin.from("admin_audit_log").insert({
          admin_id: entry.adminId, action: entry.action, target_type: entry.targetType, target_id: entry.targetId,
          outcome: entry.outcome, details: entry.details,
        });
      } catch {
        console.error("automation: audit write failed");
      }
    },
    now: () => new Date(),
  };
}
