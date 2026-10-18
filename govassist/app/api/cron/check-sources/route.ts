import { NextResponse } from "next/server";
import { getDueSources, checkSource } from "@/lib/source-monitoring/checker";
import { createAdminClient } from "@/lib/supabase/admin";
import { startJobRun, finishJobRun } from "@/lib/automation/job-runs";
import { retryFailedDeliveries } from "@/lib/notifications/engine";
import { sweepRealDeadlineReminders } from "@/lib/source-monitoring/deadline-reminders";
import { sweepEligibility } from "@/lib/eligibility/reevaluate";
import { isAuthorizedCron, selectSourcesForRun, withinBudget } from "@/lib/automation/cron";

// Uses Node's crypto module (via lib/source-monitoring/fetch.ts) and may
// fetch several external sources in one run — the Node runtime, not Edge,
// is the right fit here.
export const runtime = "nodejs";
// Scheduled runs can take longer than an interactive request; raise this if
// your Vercel plan's function duration limit allows more (Hobby: 10s,
// Pro: up to 300s by default — see vercel.json's functions config if you
// need to raise it further).
export const maxDuration = 60;

/**
 * Triggered by the Vercel Cron entry in vercel.json (see that file for the
 * schedule). A single cron trigger serves every source regardless of its
 * individual check_frequency_minutes — getDueSources() only returns the
 * ones actually due right now, so the cron's own interval just needs to be
 * at least as frequent as your shortest-configured source.
 *
 * Protected by CRON_SECRET (see .env.example): Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` on requests it triggers for a
 * scheduled function, once that env var is set on the project — see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 * Without CRON_SECRET configured, this route refuses every request rather
 * than running unauthenticated — there is no "open" fallback.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured — refusing to run." }, { status: 503 });
  }

  if (!isAuthorizedCron(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Phase 15: a recorded start with no finish means the run was interrupted - the control center shows that.
  const jobAdmin = createAdminClient();
  const runId = await startJobRun(jobAdmin, "check_sources");

  const startedAt = Date.now();
  const results: Awaited<ReturnType<typeof checkSource>>[] = [];
  let deferred = 0;
  try {
    // Phase 16: bounded run — a fixed number of sources and a time budget, stalest first. Anything
    // not reached stays due and is picked up by the next run.
    const due = await getDueSources();
    const picked = selectSourcesForRun(due);
    deferred = picked.deferred;

    // Sequential, not Promise.all — official sources deserve to be checked
    // politely (no burst of concurrent requests at one organization's
    // servers), and it keeps this run's total load predictable.
    for (const source of picked.selected) {
      if (!withinBudget(startedAt, Date.now())) {
        deferred += 1;
        continue;
      }
      results.push(await checkSource(source));
    }
  } catch {
    // checkSource never throws by design; this guards getDueSources / unexpected failures so the
    // run is recorded as failed instead of being left "started" forever.
    await finishJobRun(jobAdmin, runId, false, { error: "source check loop failed", checked: results.length });
    return NextResponse.json({ error: "Source check run failed." }, { status: 500 });
  }

  // Deadline reminders (requirement 10) ride along on the same trigger
  // rather than a second Vercel Cron entry — it's a cheap DB-only sweep,
  // and one cron job is friendlier to Hobby-plan cron limits than two.
  let remindersSent = 0;
  let remindersCancelled = 0;
  try {
    const sweep = await sweepRealDeadlineReminders();
    remindersSent = sweep.remindersSent;
    remindersCancelled = sweep.cancelled;
  } catch {
    console.error("cron: deadline reminder sweep failed");
  }

  // Phase 14: retry failed/pending email deliveries whose backoff has elapsed.
  // Isolated so a provider outage cannot hide the results above.
  let deliveries: { due: number; sent: number; failed: number; skipped: number } | { error: string };
  try {
    deliveries = await retryFailedDeliveries();
  } catch {
    deliveries = { error: "delivery retry failed" };
  }

  // Phase 12: re-evaluate exam cycles that are new or whose rules changed
  // since the last run (covers cycles added or edited outside the pipeline).
  // Failure here must not hide the source-check results above.
  let eligibility: { cyclesChecked: number; cyclesReevaluated: number; failed: number } | { error: string };
  try {
    eligibility = await sweepEligibility();
  } catch {
    eligibility = { error: "eligibility sweep failed" };
  }

  const summary = {
    checked: results.length,
    changed: results.filter((r) => r.changed).length,
    updatesDetected: results.reduce((sum, r) => sum + r.updatesDetected, 0),
    sourceErrors: results.filter((r) => !r.ok).length,
    deferred,
    remindersSent,
    remindersCancelled,
    deliveries,
    eligibility,
  };
  await finishJobRun(jobAdmin, runId, true, summary);

  return NextResponse.json({
    eligibility,
    checked: results.length,
    changed: results.filter((r) => r.changed).length,
    updatesDetected: results.reduce((sum, r) => sum + r.updatesDetected, 0),
    deferred,
    remindersSent,
    remindersCancelled,
    deliveries,
    errors: results.filter((r) => !r.ok).map((r) => ({ sourceId: r.sourceId, error: r.error })),
  });
}
