// ---------------------------------------------------------------------------
// Two different failure modes live here, deliberately:
//
// 1. getPublicSupabaseConfig() — used by lib/supabase/client.ts and
//    lib/supabase/server.ts, which run as part of every page render
//    (including Next.js's build-time prerendering pass). This NEVER throws.
//    A build environment (or a fresh clone before .env.local is filled in)
//    legitimately won't have these vars set, and a thrown error here would
//    take down the entire `next build` rather than just the pages that
//    actually need Supabase. Callers get `null` back and are responsible for
//    rendering a clear "not configured" state instead of crashing.
//
// 2. getServiceRoleConfig() — used only by standalone admin/seed scripts
//    (never imported by page/action code that runs during `next build` or a
//    user request). A script SHOULD fail fast and loud if misconfigured, so
//    this one still throws.
// ---------------------------------------------------------------------------

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export const MISSING_SUPABASE_CONFIG_MESSAGE =
  "GovAssist isn't configured yet: NEXT_PUBLIC_SUPABASE_URL and/or " +
  "NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. Copy .env.example to .env.local " +
  "(or set them in your hosting provider's project settings), fill in your " +
  "Supabase project's URL and anon key (Project Settings → API), then redeploy " +
  "or restart the dev server.";

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

/**
 * Public, browser-safe config. Returns null — never throws — so this is safe
 * to call from anywhere in the render path, including during `next build`'s
 * static prerendering pass, without taking down the build.
 */
export function getPublicSupabaseConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseConfig() !== null;
}

/**
 * Server-only config for privileged operations (e.g. an admin script that
 * seeds exam_cycles). NEVER import this from a file that can be bundled into
 * client JavaScript — there is no build-time guard for that, so treat
 * "only import from standalone scripts" as a hard rule. This intentionally
 * still throws: a script is not part of the Next.js build/render path, so a
 * loud, immediate failure is the right behavior here, unlike the public
 * config above.
 */
export function getServiceRoleConfig(): { url: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new ConfigError(
      "Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL). This key is " +
        "required for privileged server-side operations and must never be prefixed " +
        "with NEXT_PUBLIC_ or referenced from client components."
    );
  }

  return { url, serviceRoleKey };
}
