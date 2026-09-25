import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that require a signed-in session. Everything else (landing, login,
// signup, password reset) stays public.
const PROTECTED_PREFIXES = ["/home", "/jobs", "/exams", "/preparation", "/documents", "/profile", "/notifications", "/settings", "/onboarding", "/admin"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env vars are missing, let the request through — app/error.tsx (via
  // lib/env.ts's ConfigError) surfaces a clear message once a page actually
  // tries to use Supabase, rather than middleware failing in a way that's
  // hard to diagnose from a redirect loop.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // IMPORTANT: this call refreshes the session token if it's expired and
  // must run on every request that touches a protected route — skipping it
  // is the most common cause of users getting randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p));

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets and the manifest, so the session
     * cookie stays fresh across the whole app without re-running on every
     * image/font request.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)",
  ],
};
