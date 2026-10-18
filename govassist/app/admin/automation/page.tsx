import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RetryDeliveriesButton, RetryPublishButton, SourceActions } from "@/components/admin/AutomationActions";
import { getAutomationOverviewAction } from "@/lib/actions/automation-admin";
import { SOURCE_HEALTH_LABEL, type SourceHealth } from "@/lib/automation/sources";
import { ADMIN_STATUS_LABEL } from "@/lib/application-requests/admin-queues";
import { REQUEST_STATUSES } from "@/lib/application-requests/constants";
import type { JobRunItem, Loaded } from "@/lib/automation/overview-types";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";
function fmt(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-IN", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
}

const HEALTH_TONE: Record<SourceHealth, "positive" | "warning" | "negative" | "neutral"> = {
  healthy: "positive", stale: "warning", never_checked: "neutral", error: "warning", failing: "negative", maintenance: "negative", disabled: "neutral",
};

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "bad" }) {
  const color = tone === "bad" ? "text-ineligible-fg" : tone === "warn" ? "text-caution-fg" : "text-ink";
  return (
    <div className="rounded border border-hairline bg-paper-raised p-3">
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function Section<T>({ title, note, data, children }: { title: string; note?: string; data: Loaded<T>; children: (d: T) => React.ReactNode }) {
  return (
    <section className="mt-6" aria-label={title}>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-ink-faint">{note}</p>}
      <div className="mt-2">
        {data.ok ? children(data.data) : <p role="alert" className="text-sm text-ineligible-fg">{data.error} Numbers are not shown rather than guessed.</p>}
      </div>
    </section>
  );
}

function jobLine(name: string, run: JobRunItem | null) {
  if (!run) return <p className="text-sm text-ink-muted">{name}: no run recorded yet.</p>;
  const state = run.finishedAt === null ? "started but did not finish (interrupted)" : run.ok ? "finished" : "finished with problems";
  return <p className="text-sm text-ink-muted">{name}: last run {fmt(run.startedAt)} – {state}.</p>;
}

export default async function AutomationControlCenterPage() {
  const res = await getAutomationOverviewAction();
  if (res.error || !res.overview) {
    return (
      <div className="app-shell min-h-screen px-4 py-6">
        <p className="text-sm text-ineligible-fg">{res.error ?? "You don't have access to this."}</p>
      </div>
    );
  }
  const o = res.overview;

  return (
    <div className="app-shell min-h-screen px-4 py-6 md:mx-auto md:max-w-5xl">
      <h1 className="font-display text-xl font-semibold text-ink">Automation control center</h1>
      <p className="mt-1 text-sm text-ink-muted">Health of the automatic monitoring system. Updated {fmt(o.generatedAt)} (IST). Admins only.</p>
      <div className="mt-2 flex flex-wrap gap-4 text-sm font-medium text-brand-600">
        <a className="underline" href="/admin/reviews">Official update reviews</a>
        <a className="underline" href="/admin/application-requests">Application requests</a>
        <a className="underline" href="/admin/pyq-reviews">PYQ reviews</a>
        <a className="underline" href="/admin/answer-keys">Answer keys</a>
      </div>

      <Section title="Scheduled jobs" data={o.jobs} note="Cron runs once a day on the Vercel Hobby plan.">
        {(j) => (<Card className="space-y-1 p-4">{jobLine("Official source checks", j.checkSources)}{jobLine("Previous-year paper checks", j.checkPyqSources)}</Card>)}
      </Section>

      <Section title="Official sources" data={o.sources}
        note="If a website fails, the last verified information is kept. If a parser fails, the source is flagged for maintenance and skipped until an admin clears it.">
        {(s) => (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Active" value={s.counts.active} />
              <Stat label="Inactive" value={s.counts.inactive} />
              <Stat label="Need parser maintenance" value={s.counts.maintenance} tone={s.counts.maintenance > 0 ? "bad" : undefined} />
              <Stat label="Last check failed" value={s.counts.withErrors} tone={s.counts.withErrors > 0 ? "warn" : undefined} />
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              Previous-year paper sources: {s.paper.active} active, {s.paper.inactive} inactive, {s.paper.maintenance} need maintenance, {s.paper.withErrors} with errors (read-only here).
            </p>
            {s.items.length === 0 ? (
              <div className="mt-3"><EmptyState title="No official sources registered" description="Add sources to notification_sources to start monitoring." /></div>
            ) : (
              <ul className="mt-3 space-y-3">
                {s.items.map((src) => (
                  <li key={src.id}>
                    <Card className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-ink">{src.organization}</p>
                          <p className="break-all text-xs text-ink-faint">{src.url}</p>
                        </div>
                        <Badge tone={HEALTH_TONE[src.health]}>{SOURCE_HEALTH_LABEL[src.health]}</Badge>
                      </div>
                      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-ink-muted sm:grid-cols-2">
                        <div>Last checked: {fmt(src.lastCheckedAt)}</div>
                        <div>Last successful check: {fmt(src.lastSuccessAt)}</div>
                        <div>Parser: {src.parserVersion}</div>
                        <div>Failed checks in a row: {src.consecutiveFailures}</div>
                      </dl>
                      {src.lastError && <p className="mt-2 break-words text-xs text-ineligible-fg">Last error: {src.lastError}</p>}
                      <SourceActions sourceId={src.id} enabled={src.enabled} needsMaintenance={src.needsMaintenance} />
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      <Section title="Automatic updates" data={o.updates}>
        {(u) => (
          <>
            <p className="mb-2 text-xs text-ink-faint">Last {u.windowDays} days. “Waiting for review” is the live backlog.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat label="Detected" value={u.detected} />
              <Stat label="Processed" value={u.processed} />
              <Stat label="Published" value={u.published} />
              <Stat label="Waiting for review" value={u.needsReview} tone={u.needsReview > 0 ? "warn" : undefined} />
              <Stat label="Rejected" value={u.rejected} />
            </div>
            {u.needsReview > 0 && (
              <p className="mt-2 text-sm text-ink-muted">
                Oldest waiting since {fmt(u.oldestNeedsReviewAt)}. <a className="font-medium text-brand-600 underline" href="/admin/reviews">Open review queue</a>. Uncertain updates are never published automatically.
              </p>
            )}
            {u.stuckAutoPublish.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-ink">Publishing did not finish ({u.stuckAutoPublish.length})</p>
                <ul className="mt-2 space-y-2">
                  {u.stuckAutoPublish.map((s) => (
                    <li key={s.id}>
                      <Card className="p-3">
                        <p className="break-words text-sm text-ink">{s.title}</p>
                        <p className="text-xs text-ink-faint">{s.organization ?? "Unknown source"} · detected {fmt(s.detectedAt)}</p>
                        <RetryPublishButton updateId={s.id} />
                      </Card>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Exam cycles" data={o.cycles} note="By application window, for published cycles. A cycle with no last date announced counts as current.">
        {(c) => (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Current" value={c.counts.current} />
              <Stat label="Upcoming" value={c.counts.upcoming} />
              <Stat label="Expired" value={c.counts.expired} />
              <Stat label="No dates" value={c.counts.undated} />
            </div>
            {c.closingSoon.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-ink">Closing within 7 days</p>
                <ul className="mt-1 space-y-1 text-sm text-ink-muted">
                  {c.closingSoon.map((x) => <li key={x.id}>{x.label} – {x.endDate} ({x.daysLeft === 0 ? "today" : `${x.daysLeft} day${x.daysLeft === 1 ? "" : "s"}`})</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Documents" data={o.documents} note="Counts only: no document contents or owners are shown here.">
        {(d) => (
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-sm font-medium text-ink">User documents</p>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Processing" value={d.user.processing} />
                <Stat label="Needs user review" value={d.user.needsReview} />
                <Stat label="Verified" value={d.user.verified} />
              </div>
              <p className="mt-1 text-xs text-ink-faint">A “failed” state is not tracked for user documents (text extraction is still simulated).</p>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-ink">Previous-year paper ingestion</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Stat label="Processing" value={d.ingestion.processing} />
                <Stat label="Successful" value={d.ingestion.successful} />
                <Stat label="Needs review" value={d.ingestion.needsReview} tone={d.ingestion.needsReview > 0 ? "warn" : undefined} />
                <Stat label="Failed" value={d.ingestion.failed} tone={d.ingestion.failed > 0 ? "bad" : undefined} />
                <Stat label="Rejected" value={d.ingestion.rejected} />
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title="Notification jobs" data={o.notifications}>
        {(n) => (
          <>
            <p className="mb-2 text-xs text-ink-faint">
              Last {n.windowDays} days, from {n.batches} recorded batch(es). {n.loggedSince ? `Batch logging began ${fmt(n.loggedSince)}; earlier history is not counted.` : "No batches have been recorded yet."}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Sent (in-app)" value={n.created} />
              <Stat label="Duplicates prevented" value={n.duplicatesPrevented} />
              <Stat label="Off by user preference" value={n.disabledByPreference} />
              <Stat label="Failed" value={n.failed} tone={n.failed > 0 ? "bad" : undefined} />
            </div>
            <p className="mt-3 text-sm font-medium text-ink">Email deliveries (all time)</p>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat label="Pending" value={n.deliveries.pending} />
              <Stat label="Sent to provider" value={n.deliveries.sent} />
              <Stat label="Confirmed delivered" value={n.deliveries.delivered} />
              <Stat label="Failed" value={n.deliveries.failed} tone={n.deliveries.failed > 0 ? "bad" : undefined} />
              <Stat label="Skipped" value={n.deliveries.skipped} />
            </div>
            {n.failedDeliveries.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {n.failedDeliveries.map((d) => <li key={d.id} className="break-words">{d.channel} · {d.attempts} attempt(s) · {fmt(d.updatedAt)} · {d.lastError ?? "no detail"}</li>)}
              </ul>
            )}
            <RetryDeliveriesButton disabled={n.deliveries.failed === 0} />
          </>
        )}
      </Section>

      <Section title="Application assistance" data={o.requests} note="Manual, admin-assisted requests. Nothing is submitted on any official portal automatically.">
        {(r) => (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Open" value={r.open} />
              <Stat label="Overdue" value={r.overdue} tone={r.overdue > 0 ? "bad" : undefined} />
              <Stat label="Waiting for user" value={r.byStatus.waiting_for_user + r.byStatus.awaiting_user_action} />
              <Stat label="Rejected" value={r.byStatus.rejected} />
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              {REQUEST_STATUSES.map((s) => `${ADMIN_STATUS_LABEL[s]}: ${r.byStatus[s]}`).join(" · ")}
            </p>
            <p className="mt-1 text-xs text-ink-faint">Applicant notifications that failed (30 days): {r.notificationFailures}. <a className="font-medium text-brand-600 underline" href="/admin/application-requests">Open requests</a></p>
          </>
        )}
      </Section>

      <Section title="Guided application sessions (older autofill flow)" data={o.sessions} note="A “failed” state does not exist for these sessions, so blocked submission attempts are shown instead.">
        {(s) => (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Active" value={s.active} />
            <Stat label="Paused" value={s.paused} />
            <Stat label="Needs user action" value={s.needsUserAction} />
            <Stat label="Blocked submissions (30 days)" value={s.blockedSubmissions} tone={s.blockedSubmissions > 0 ? "warn" : undefined} />
          </div>
        )}
      </Section>

      <Section title="Recent admin actions" data={o.audit} note="Every action on this page is recorded, including refused ones.">
        {(items) => items.length === 0 ? (
          <p className="text-sm text-ink-muted">No admin actions recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-muted">
            {items.map((a) => (
              <li key={a.id} className="break-words">
                {fmt(a.createdAt)} · admin {a.adminRef ?? "?"} · {a.action.replace(/_/g, " ")} · <span className={a.outcome === "success" ? "text-eligible-fg" : a.outcome === "failed" ? "text-ineligible-fg" : "text-caution-fg"}>{a.outcome}</span>
                {a.targetId ? ` · ${a.targetId.slice(0, 8)}` : ""}{a.note ? ` · ${a.note}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
