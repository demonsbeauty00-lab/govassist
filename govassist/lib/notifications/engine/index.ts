import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { retryDueDeliveries, type RetrySummary } from "./delivery";
import { createEmailChannel, readEmailConfig } from "./channels/email";
import { pushChannel } from "./channels/push";
import { sendNotifications, type SendSummary } from "./service";
import { supabaseEngineStore } from "./supabase-store";
import type { Channel, NotificationDraft } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

export function buildChannels(admin: AdminClient): Channel[] {
  return [
    createEmailChannel({
      config: readEmailConfig(),
      resolveEmail: async (userId) => {
        const { data } = await admin.auth.admin.getUserById(userId);
        return data.user?.email ?? null;
      },
    }),
    pushChannel,
  ];
}

/** THE entry point for creating notifications. Everything else calls this. */
export async function notify(drafts: NotificationDraft[], admin: AdminClient = createAdminClient()): Promise<SendSummary> {
  const summary = await sendNotifications({ store: supabaseEngineStore(admin), channels: buildChannels(admin) }, drafts);
  await logBatch(admin, drafts, summary);
  return summary;
}

/** Phase 15: records the outcome of each batch (created / duplicate prevented /
 *  disabled by preference / failed) for the admin control center. Best-effort:
 *  bookkeeping must never make a notification fail. */
async function logBatch(admin: AdminClient, drafts: NotificationDraft[], summary: SendSummary): Promise<void> {
  if (drafts.length === 0) return;
  try {
    const events = new Set(drafts.map((d) => d.event));
    await admin.from("notification_job_log").insert({
      event_type: events.size === 1 ? (drafts[0]?.event ?? null) : "MIXED",
      drafts: drafts.length,
      created: summary.created,
      duplicates: summary.duplicates,
      disabled: summary.disabled,
      failed: summary.failed,
    });
  } catch {
    // ignore
  }
}

/** Daily sweep: retries failed/pending channel deliveries whose backoff elapsed. */
export async function retryFailedDeliveries(admin: AdminClient = createAdminClient()): Promise<RetrySummary> {
  return retryDueDeliveries({ store: supabaseEngineStore(admin), channels: buildChannels(admin) });
}

export type { NotificationDraft, SendSummary };
