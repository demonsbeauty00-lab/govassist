import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequestStatusBadge } from "@/components/application-requests/StatusBadge";
import { listMyRequestsAction } from "@/lib/actions/application-requests";
import { createClient } from "@/lib/supabase/server";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ApplicationRequestsPage() {
  const supabase = await createClient();
  if (!supabase) return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;

  const { requests, error } = await listMyRequestsAction();

  return (
    <AppShell title="Application Requests" showBack>
      <p className="mt-1 text-sm text-ink-muted">
        Ask a GovAssist admin to help with an official application. An admin handles it manually — GovAssist never logs
        in to portals, and you never share passwords, OTPs or payment details.
      </p>
      <Link href="/apply-assistant/new"
        className="mt-4 inline-flex h-11 items-center justify-center rounded bg-brand-600 px-5 text-[15px] font-medium text-white hover:bg-brand-700 tap-target">
        New request
      </Link>

      <h2 className="mt-6 text-base font-semibold text-ink">Your requests</h2>
      {error ? (
        <p className="mt-2 text-sm text-ineligible-fg">{error}</p>
      ) : requests.length === 0 ? (
        <div className="mt-2">
          <EmptyState title="No requests yet" description="When you submit one, you'll see its status and any messages from the admin here." />
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {requests.map((r) => (
            <Link key={r.id} href={`/apply-assistant/${r.id}`} className="block">
              <Card interactive className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">{r.exam_title}</p>
                    <p className="text-xs text-ink-faint">{r.request_code} · {new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <RequestStatusBadge status={r.status} />
                </div>
                {r.latest_update && <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{r.latest_update}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
