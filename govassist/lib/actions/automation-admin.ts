"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOverview } from "@/lib/automation/overview";
import type { AutomationOverview } from "@/lib/automation/overview-types";
import { clearParserMaintenance, recheckSource, retryFailedDeliveries, retryPublish, setSourceEnabled, type OpResult } from "@/lib/automation/ops";
import { supabaseOpsDeps } from "@/lib/automation/supabase-ops";

// Authorization: every action below verifies the caller is an admin through
// their OWN session (the `admins` table's read-own-row RLS policy, 0009)
// BEFORE the service-role client is created. The UI is never trusted: hiding a
// button is cosmetic, this check is the boundary.

const DENIED = (error: string): OpResult => ({ ok: false, message: error });

export async function getAutomationOverviewAction(): Promise<{ error?: string; overview?: AutomationOverview }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  return { overview: await loadOverview(createAdminClient()) };
}

export async function recheckSourceAction(sourceId: string): Promise<OpResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return DENIED(gate.error);
  return recheckSource(supabaseOpsDeps(createAdminClient()), gate.userId, sourceId);
}

export async function setSourceEnabledAction(sourceId: string, enabled: boolean): Promise<OpResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return DENIED(gate.error);
  if (typeof enabled !== "boolean") return { ok: false, message: "Invalid request." };
  return setSourceEnabled(supabaseOpsDeps(createAdminClient()), gate.userId, sourceId, enabled);
}

export async function clearParserMaintenanceAction(sourceId: string): Promise<OpResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return DENIED(gate.error);
  return clearParserMaintenance(supabaseOpsDeps(createAdminClient()), gate.userId, sourceId);
}

export async function retryPublishAction(updateId: string): Promise<OpResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return DENIED(gate.error);
  return retryPublish(supabaseOpsDeps(createAdminClient()), gate.userId, updateId);
}

export async function retryDeliveriesAction(): Promise<OpResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return DENIED(gate.error);
  return retryFailedDeliveries(supabaseOpsDeps(createAdminClient()), gate.userId);
}
