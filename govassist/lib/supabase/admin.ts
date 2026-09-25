import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types";
import { getServiceRoleConfig } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS entirely — use ONLY for privileged,
 * user-independent server operations (e.g. an admin script seeding
 * exam_cycles, or a webhook processing a DigiLocker callback). The
 * `server-only` import above makes it a build error to ever import this
 * file from a Client Component, so the service key can never end up in
 * browser JavaScript.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = getServiceRoleConfig();
  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
