import { requireUser } from "@/lib/actions/session";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { decideAdminAccess } from "./admin-decision";

/**
 * Server-side admin gate used by every admin action (Phase 16: one shared copy instead of five
 * identical ones, so the rule cannot drift). Admin status comes ONLY from the `admins` table,
 * which no user session can write; nothing the browser sends is trusted.
 */
export async function requireAdmin() {
  const result = await requireUser();
  if (!result.ok) return { ok: false as const, error: MISSING_SUPABASE_CONFIG_MESSAGE };

  const { data, error } = await result.supabase.from("admins").select("user_id").eq("user_id", result.user.id).maybeSingle();
  const decision = decideAdminAccess({ userId: result.user.id, adminRow: data, lookupFailed: !!error });
  if (!decision.ok) return { ok: false as const, error: decision.error };
  return { ok: true as const, userId: decision.userId };
}
