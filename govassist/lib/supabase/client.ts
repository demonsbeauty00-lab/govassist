"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Database } from "./database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

/**
 * Client-side Supabase client. Uses only the public URL + anon key — safe to
 * bundle into browser JS. All data access still goes through RLS policies,
 * so the anon key alone can never read another user's rows.
 *
 * Returns null (never throws) if the app isn't configured yet — callers must
 * handle that case explicitly rather than assume a client is always
 * available.
 */
export function createClient() {
  const config = getPublicSupabaseConfig();
  if (!config) return null;
  return createBrowserClient<Database>(config.url, config.anonKey);
}
