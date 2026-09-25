import { NextResponse } from "next/server";
import { getDueSources, checkSource } from "@/lib/source-monitoring/checker";
import { sweepRealDeadlineReminders } from "@/lib/source-monitoring/deadline-reminders";

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

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dueSources = await getDueSources();
  const results = [];

  // Sequential, not Promise.all — official sources deserve to be checked
  // politely (no burst of concurrent requests at one organization's
  // servers), and it keeps this run's total load predictable.
  for (const source of dueSources) {
    const result = await checkSource(source);
    results.push(result);
  }

  // Deadline reminders (requirement 10) ride along on the same trigger
  // rather than a second Vercel Cron entry — it's a cheap DB-only sweep,
  // and one cron job is friendlier to Hobby-plan cron limits than two.
  const { remindersSent } = await sweepRealDeadlineReminders();

  return NextResponse.json({
    checked: results.length,
    changed: results.filter((r) => r.changed).length,
    updatesDetected: results.reduce((sum, r) => sum + r.updatesDetected, 0),
    remindersSent,
    errors: results.filter((r) => !r.ok).map((r) => ({ sourceId: r.sourceId, error: r.error })),
  });
}
