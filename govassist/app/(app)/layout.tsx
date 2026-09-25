import { ReactNode } from "react";

// Every route in this group renders per-user, session-backed content (via
// Server Actions that read cookies() through lib/supabase/server.ts). This
// forces the whole group to render dynamically, per request, rather than
// being swept into Next.js's static/prerendering pass at build time — which
// is both the fix for the Supabase-config build failure and simply correct
// behavior for authenticated, personalized pages (they should never be
// statically cached across users).
export const dynamic = "force-dynamic";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return children;
}
