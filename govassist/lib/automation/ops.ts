// The admin ACTIONS of the control center, as plain functions over injected
// dependencies (no Next.js, no Supabase here), so the rules - what may be
// retried, what is refused, what gets audited - are unit tested.
//
// Authorization is NOT decided here: the server actions in
// lib/actions/automation-admin.ts verify the caller is an admin first and
// pass their verified id in. These functions assume an authorized caller but
// still refuse unsafe operations and audit EVERY attempt (success, failure
// and refusal alike).

import { canRecheckSource, canRetryPublish, type Decision } from "./retry-rules";
import { shortError } from "./sources";

export type AuditAction =
  | "source_recheck" | "source_enabled" | "source_disabled" | "source_maintenance_cleared"
  | "update_publish_retried" | "deliveries_requeued";
export type AuditTarget = "notification_source" | "detected_update" | "notification_delivery";
export type AuditOutcome = "success" | "failed" | "refused";

export interface AuditEntry {
  adminId: string;
  action: AuditAction;
  targetType: AuditTarget;
  targetId: string | null;
  outcome: AuditOutcome;
  details: Record<string, unknown>;
}

export interface SourceSnapshot {
  id: string;
  enabled: boolean;
  needs_parser_maintenance: boolean;
  last_checked_at: string | null;
}

export interface OpsDeps {
  getSource(id: string): Promise<SourceSnapshot | null>;
  updateSource(id: string, patch: { enabled?: boolean; needs_parser_maintenance?: boolean; last_content_hash?: null; consecutive_failures?: number }): Promise<boolean>;
  /** Runs the REAL source check (fetch, parse, classify, stage). Never throws. */
  checkSource(id: string): Promise<{ ok: boolean; changed: boolean; updatesDetected: number; duplicatesSkipped: number; error: string | null }>;
  getUpdate(id: string): Promise<{ status: string; classification: string; detected_at: string } | null>;
  /** The same publish function auto-publish and admin approval use. */
  applyUpdate(id: string): Promise<{ error?: string }>;
  requeueFailedDeliveries(): Promise<number>;
  runDeliveryRetry(): Promise<{ due: number; sent: number; failed: number; skipped: number }>;
  audit(entry: AuditEntry): Promise<void>;
  now(): Date;
}

export interface OpResult { ok: boolean; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID: OpResult = { ok: false, message: "Invalid request." };

async function refuse(deps: OpsDeps, adminId: string, action: AuditAction, targetType: AuditTarget, targetId: string | null, d: Extract<Decision, { ok: false }>): Promise<OpResult> {
  await deps.audit({ adminId, action, targetType, targetId, outcome: "refused", details: { reason: d.reason } });
  return { ok: false, message: d.reason };
}

export async function recheckSource(deps: OpsDeps, adminId: string, sourceId: string): Promise<OpResult> {
  if (!UUID.test(sourceId)) return INVALID;
  const source = await deps.getSource(sourceId);
  if (!source) return { ok: false, message: "Source not found." };
  const decision = canRecheckSource(source, deps.now());
  if (!decision.ok) return refuse(deps, adminId, "source_recheck", "notification_source", sourceId, decision);

  const result = await deps.checkSource(sourceId);
  await deps.audit({
    adminId, action: "source_recheck", targetType: "notification_source", targetId: sourceId,
    outcome: result.ok ? "success" : "failed",
    details: { changed: result.changed, updatesDetected: result.updatesDetected, duplicatesSkipped: result.duplicatesSkipped, error: shortError(result.error) },
  });
  if (!result.ok) {
    return { ok: false, message: "The check failed. Existing verified information was kept; the error is shown on the source." };
  }
  return {
    ok: true,
    message: result.changed
      ? `Checked. ${result.updatesDetected} new update(s) found (${result.duplicatesSkipped} already known). Anything uncertain is waiting in the review queue.`
      : "Checked. The page has not changed since the last check.",
  };
}

export async function setSourceEnabled(deps: OpsDeps, adminId: string, sourceId: string, enabled: boolean): Promise<OpResult> {
  if (!UUID.test(sourceId)) return INVALID;
  const source = await deps.getSource(sourceId);
  if (!source) return { ok: false, message: "Source not found." };
  const action: AuditAction = enabled ? "source_enabled" : "source_disabled";
  if (source.enabled === enabled) {
    return refuse(deps, adminId, action, "notification_source", sourceId, { ok: false, reason: enabled ? "This source is already active." : "This source is already inactive." });
  }
  // Turning a source off only stops FUTURE checks: nothing already verified or published is touched.
  const saved = await deps.updateSource(sourceId, { enabled });
  await deps.audit({ adminId, action, targetType: "notification_source", targetId: sourceId, outcome: saved ? "success" : "failed", details: {} });
  return saved
    ? { ok: true, message: enabled ? "Source turned on. It will be checked on the next scheduled run." : "Source turned off. Existing published information is unchanged." }
    : { ok: false, message: "Couldn't save the change." };
}

/**
 * Clears the "parser needs maintenance" flag AFTER a person fixed the parser.
 * It also forgets the stored page hash: the checker saves the hash before it
 * parses, so without this the next check would see "unchanged" and never
 * re-run the fixed parser. Re-detected notices are de-duplicated by their own
 * identity hash, so nothing is published twice.
 */
export async function clearParserMaintenance(deps: OpsDeps, adminId: string, sourceId: string): Promise<OpResult> {
  if (!UUID.test(sourceId)) return INVALID;
  const source = await deps.getSource(sourceId);
  if (!source) return { ok: false, message: "Source not found." };
  if (!source.needs_parser_maintenance) {
    return refuse(deps, adminId, "source_maintenance_cleared", "notification_source", sourceId, { ok: false, reason: "This source is not flagged for maintenance." });
  }
  const saved = await deps.updateSource(sourceId, { needs_parser_maintenance: false, last_content_hash: null, consecutive_failures: 0 });
  await deps.audit({ adminId, action: "source_maintenance_cleared", targetType: "notification_source", targetId: sourceId, outcome: saved ? "success" : "failed", details: {} });
  return saved
    ? { ok: true, message: "Flag cleared. The next check re-reads the page with the current parser." }
    : { ok: false, message: "Couldn't save the change." };
}

export async function retryPublish(deps: OpsDeps, adminId: string, updateId: string): Promise<OpResult> {
  if (!UUID.test(updateId)) return INVALID;
  const update = await deps.getUpdate(updateId);
  if (!update) return { ok: false, message: "Update not found." };
  const decision = canRetryPublish(update);
  if (!decision.ok) return refuse(deps, adminId, "update_publish_retried", "detected_update", updateId, decision);

  const result = await deps.applyUpdate(updateId);
  await deps.audit({
    adminId, action: "update_publish_retried", targetType: "detected_update", targetId: updateId,
    outcome: result.error ? "failed" : "success", details: { error: shortError(result.error) },
  });
  return result.error
    ? { ok: false, message: "Publishing failed again. Nothing was changed. Details are in the audit log." }
    : { ok: true, message: "Published. Users who follow this exam were notified (once)." };
}

export async function retryFailedDeliveries(deps: OpsDeps, adminId: string): Promise<OpResult> {
  const requeued = await deps.requeueFailedDeliveries();
  if (requeued === 0) {
    await deps.audit({ adminId, action: "deliveries_requeued", targetType: "notification_delivery", targetId: null, outcome: "refused", details: { reason: "nothing to retry" } });
    return { ok: false, message: "No failed deliveries can be retried (permanent failures and ones out of attempts are skipped)." };
  }
  const summary = await deps.runDeliveryRetry();
  await deps.audit({ adminId, action: "deliveries_requeued", targetType: "notification_delivery", targetId: null, outcome: "success", details: { requeued, ...summary } });
  return { ok: true, message: `Retried ${summary.due} delivery(ies): ${summary.sent} sent, ${summary.failed} failed again.` };
}
