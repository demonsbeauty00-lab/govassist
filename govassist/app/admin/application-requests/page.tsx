import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequestStatusBadge } from "@/components/application-requests/StatusBadge";
import { getRequestCountsAction, listAdminRequestsAction } from "@/lib/actions/application-requests-admin";
import { Badge } from "@/components/ui/Badge";
import { ASSISTANCE_LABEL, REQUEST_STATUSES, type RequestStatus } from "@/lib/application-requests/constants";
import { ADMIN_STATUS_LABEL, deadlineUrgency } from "@/lib/application-requests/admin-queues";
import { todayIST } from "@/lib/application-requests/schema";

// The queues an admin works through, in the order they usually matter.
const PRIMARY_QUEUES: RequestStatus[] = ["submitted", "under_review", "in_progress", "waiting_for_user", "form_filled", "completed", "rejected"];
const OTHER_QUEUES: RequestStatus[] = REQUEST_STATUSES.filter((s) => !PRIMARY_QUEUES.includes(s));

export const dynamic = "force-dynamic";

export default async function AdminApplicationRequestsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string; queue?: string };
}) {
  const status = REQUEST_STATUSES.find((s) => s === searchParams.status);
  const queue = searchParams.queue === "overdue" ? ("overdue" as const) : undefined;
  const q = (searchParams.q ?? "").slice(0, 100);
  const today = todayIST();

  const [counts, list] = await Promise.all([
    getRequestCountsAction(),
    listAdminRequestsAction({ status, q: q || undefined, queue }),
  ]);

  // Non-admins get an error from the server action — nothing else is shown.
  if (counts.error && list.error) {
    return (
      <div className="app-shell min-h-screen px-4 py-6">
        <p className="text-sm text-ineligible-fg">{counts.error}</p>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen px-4 py-6 md:max-w-5xl md:mx-auto">
      <h1 className="font-display text-xl font-semibold text-ink">Application requests</h1>
      <p className="mt-1 text-sm text-ink-muted">Manual assistance requests from applicants. Processed outside GovAssist.</p>
      <div className="mt-2 flex flex-wrap gap-4 text-sm font-medium text-brand-600">
        <a className="underline" href="/admin/automation">Automation control center</a>
        <a className="underline" href="/admin/reviews">Official update reviews</a>
        <a className="underline" href="/admin/pyq-reviews">PYQ reviews</a>
        <a className="underline" href="/admin/answer-keys">Answer keys</a>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <a href="/admin/application-requests?queue=overdue" aria-current={queue === "overdue" ? "page" : undefined}>
          <Card interactive className={`p-3 ${counts.overdue > 0 ? "border-ineligible-fg/40" : ""}`}>
            <p className={`text-2xl font-semibold ${counts.overdue > 0 ? "text-ineligible-fg" : "text-ink"}`}>{counts.overdue}</p>
            <p className="text-xs text-ink-muted">Overdue (last date passed)</p>
          </Card>
        </a>
        {PRIMARY_QUEUES.map((s) => (
          <a key={s} href={`/admin/application-requests?status=${s}`} aria-current={status === s ? "page" : undefined}>
            <Card interactive className="p-3">
              <p className="text-2xl font-semibold text-ink">{counts.counts[s]}</p>
              <p className="text-xs text-ink-muted">{ADMIN_STATUS_LABEL[s]}</p>
            </Card>
          </a>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        Also:{" "}
        {OTHER_QUEUES.map((s, i) => (
          <span key={s}>{i > 0 ? " · " : ""}<a className="underline" href={`/admin/application-requests?status=${s}`}>{ADMIN_STATUS_LABEL[s]} ({counts.counts[s]})</a></span>
        ))}
        {" · "}<a className="underline" href="/admin/application-requests">All ({counts.open} open)</a>
      </p>
      {queue === "overdue" && (
        <p className="mt-3 rounded border border-hairline bg-paper-sunk p-3 text-sm text-ink-muted">
          Showing requests that are still open although the applicant&apos;s last date has passed, longest overdue first. Check the official notice: the date may have been extended.
        </p>
      )}

      <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="q" className="block text-sm font-medium text-ink">Search</label>
          <input id="q" name="q" defaultValue={q} maxLength={100} placeholder="Request ID, applicant or exam"
            className="h-11 w-full rounded border border-hairline bg-paper-raised px-3.5 text-[15px] text-ink" />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-ink">Status</label>
          <select id="status" name="status" defaultValue={status ?? ""}
            className="h-11 rounded border border-hairline bg-paper-raised px-3 text-[15px] text-ink">
            <option value="">All</option>
            {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{ADMIN_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <button type="submit" className="h-11 rounded bg-brand-600 px-5 text-[15px] font-medium text-white hover:bg-brand-700">Filter</button>
      </form>

      <div className="mt-4 space-y-3">
        {list.error ? (
          <p className="text-sm text-ineligible-fg">{list.error}</p>
        ) : list.requests.length === 0 ? (
          <EmptyState title="No requests found" description="Nothing matches this filter yet." />
        ) : list.requests.map((r) => (
          <a key={r.id} href={`/admin/application-requests/${r.id}`} className="block">
            <Card interactive className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-ink">{r.exam_title}</p>
                  <p className="text-xs text-ink-faint">{r.request_code} · {r.applicant_name}</p>
                  <p className="text-xs text-ink-muted">
                    {ASSISTANCE_LABEL[r.assistance_type]} · submitted {new Date(r.created_at).toLocaleDateString()}
                    {r.application_deadline ? ` · last date ${r.application_deadline}` : " · no last date given"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <RequestStatusBadge status={r.status} />
                  {(() => {
                    const u = deadlineUrgency(r, today);
                    if (u === "overdue") return <Badge tone="negative">Overdue</Badge>;
                    if (u === "today") return <Badge tone="warning">Last date today</Badge>;
                    if (u === "soon") return <Badge tone="warning">Closing soon</Badge>;
                    return null;
                  })()}
                </div>
              </div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
