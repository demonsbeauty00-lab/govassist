// Channel delivery with tracking + safe retries. Pure orchestration over
// EngineStore / Channel, so it is tested with in-memory fakes.
//
// State machine (never skips a step it cannot prove):
//   pending --send ok-->        sent        (the provider ACCEPTED the message)
//   pending --send error-->     failed      (retried later, or permanently)
//   sent    --provider webhook--> delivered (only a provider confirmation)
// "delivered" is never set because a message was merely queued or accepted.

import type { Channel, DeliveryRecord, EngineStore, OutboundMessage } from "./types";
import type { WebhookOutcome } from "./webhook";

export const MAX_DELIVERY_ATTEMPTS = 5;
const BASE_BACKOFF_MINUTES = 15;
const MAX_BACKOFF_MINUTES = 24 * 60;

/** When to retry after `attempts` failed attempts; null = give up. */
export function nextAttemptAt(attempts: number, now: Date): string | null {
  if (attempts >= MAX_DELIVERY_ATTEMPTS) return null;
  const minutes = Math.min(BASE_BACKOFF_MINUTES * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MINUTES);
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/** Errors are stored and shown to admins: keep them short and free of anything
 *  that looks like a credential or an email address. */
export function sanitizeError(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b(re_|sk_|whsec_|Bearer\s+)[A-Za-z0-9_\-=]{6,}/g, "[redacted]")
    .slice(0, 300);
}

export interface AttemptOutcome { status: "sent" | "failed" | "skipped"; retried: boolean }

/** Sends one delivery. Safe to call concurrently or twice: only the caller
 *  that wins claimDelivery() sends, so a retry can never double-send. */
export async function attemptDelivery(params: {
  store: EngineStore;
  channel: Channel;
  delivery: DeliveryRecord;
  message: OutboundMessage;
  now?: Date;
}): Promise<AttemptOutcome | "not_claimed"> {
  const { store, channel, delivery, message } = params;
  const now = params.now ?? new Date();

  if (!(await store.claimDelivery(delivery.id, delivery.attempts))) return "not_claimed";
  const attempts = delivery.attempts + 1;

  let result;
  try {
    result = await channel.send(message);
  } catch (err) {
    result = { ok: false as const, error: err instanceof Error ? err.message : "send threw", permanent: false };
  }

  if (result.ok) {
    await store.finishDelivery(delivery.id, {
      status: "sent", providerMessageId: result.providerMessageId, sentAt: now.toISOString(), lastError: null, nextAttemptAt: null,
    });
    return { status: "sent", retried: delivery.attempts > 0 };
  }

  await store.finishDelivery(delivery.id, {
    status: "failed",
    lastError: sanitizeError(result.error),
    nextAttemptAt: result.permanent ? null : nextAttemptAt(attempts, now),
  });
  return { status: "failed", retried: delivery.attempts > 0 };
}

export interface RetrySummary { due: number; sent: number; failed: number; skipped: number }

/** Retries failed/pending deliveries whose backoff has elapsed. */
export async function retryDueDeliveries(params: {
  store: EngineStore;
  channels: Channel[];
  now?: Date;
  limit?: number;
}): Promise<RetrySummary> {
  const now = params.now ?? new Date();
  const due = await params.store.listDueDeliveries(now.toISOString(), params.limit ?? 50);
  const summary: RetrySummary = { due: due.length, sent: 0, failed: 0, skipped: 0 };

  for (const { delivery, message } of due) {
    const channel = params.channels.find((c) => c.name === delivery.channel && c.isConfigured());
    if (!channel) { summary.skipped += 1; continue; } // provider not configured right now: leave it for later
    const outcome = await attemptDelivery({ store: params.store, channel, delivery, message, now });
    if (outcome === "not_claimed") { summary.skipped += 1; continue; }
    if (outcome.status === "sent") summary.sent += 1;
    else summary.failed += 1;
  }
  return summary;
}

/** Applies a VERIFIED provider event. The only code path that sets "delivered".
 *  Returns false when the event does not belong to any delivery we recorded. */
export async function applyProviderEvent(store: EngineStore, outcome: WebhookOutcome, now: Date = new Date()): Promise<boolean> {
  if (outcome.kind === "ignore") return false;
  const delivery = await store.findDeliveryByProviderId(outcome.providerMessageId);
  if (!delivery) return false;
  if (outcome.kind === "delivered") {
    await store.finishDelivery(delivery.id, { status: "delivered", providerMessageId: outcome.providerMessageId, deliveredAt: now.toISOString(), nextAttemptAt: null });
  } else {
    await store.finishDelivery(delivery.id, { status: "failed", providerMessageId: outcome.providerMessageId, lastError: sanitizeError(outcome.reason), nextAttemptAt: null });
  }
  return true;
}
