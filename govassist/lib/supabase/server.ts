import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Database } from "./database.types";
import { getPublicSupabaseConfig } from "@/lib/env";

/**
 * Server-side Supabase client backed by the request's cookies, so a Server
 * Component/Action sees the same session as the browser. Still uses only the
 * anon key — every query is still subject to RLS. Use lib/supabase/admin.ts
 * (service role) only for privileged, user-independent operations.
 *
 * Returns null (never throws) if NEXT_PUBLIC_SUPABASE_URL/ANON_KEY aren't
 * set. This runs as part of every page render, including Next.js's
 * build-time static prerendering pass — throwing here would take down the
 * entire `next build`, not just the pages that need Supabase. Every caller
 * (Server Components, Server Actions, Route Handlers) must check for null
 * and render/return a clear "not configured" state instead.
 */
export async function createClient() {
  const config = getPublicSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component that can't set cookies — safe to
          // ignore because the middleware refreshes the session on every
          // request anyway (see middleware.ts).
        }
      },
    },
  });
}
