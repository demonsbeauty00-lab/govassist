import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// This route handler reads request.url, which Next.js already treats as
// dynamic request data — the route is automatically excluded from static
// generation. The explicit export below just makes that intent unambiguous
// rather than relying on the implicit detection.
export const dynamic = "force-dynamic";

/**
 * Every Supabase auth email (signup confirmation, password reset, magic
 * link) points here with a `code` param. We exchange it for a session, then
 * forward to wherever the flow that sent the email wants to land next.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  const supabase = await createClient();

  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const errorParam = supabase ? "auth_callback_failed" : "not_configured";
  return NextResponse.redirect(`${origin}/login?error=${errorParam}`);
}
