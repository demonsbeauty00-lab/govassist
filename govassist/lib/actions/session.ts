import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads the current session user. Distinguishes two very different failure
 * modes:
 *  - Supabase isn't configured at all (missing env vars) → returns
 *    `{ ok: false }` so the caller can render/return a clear setup state.
 *    This must NOT redirect or throw, since some callers run during page
 *    render (including Next.js's build-time prerendering pass).
 *  - Supabase IS configured but there's no signed-in user → redirects to
 *    /login. This is normal, expected behavior (belt-and-suspenders
 *    alongside middleware.ts), not a configuration problem.
 */
export async function requireUser() {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false as const };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return { ok: true as const, supabase, user };
}
