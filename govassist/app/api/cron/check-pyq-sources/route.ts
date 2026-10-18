import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAndHash } from "@/lib/source-monitoring/fetch";
import { startJobRun, finishJobRun } from "@/lib/automation/job-runs";
import { ingestPaper } from "@/lib/pyq/ingestion/run";
import type { Database } from "@/lib/supabase/database.types";
import { isAuthorizedCron, selectSourcesForRun, withinBudget } from "@/lib/automation/cron";

type PaperSourceRow = Database["public"]["Tables"]["paper_ingestion_sources"]["Row"];

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Triggered by a second Vercel Cron entry (see vercel.json) — kept
 * separate from /api/cron/check-sources rather than merged into it,
 * because a PYQ document fetch (often a large PDF index) is a heavier,
 * slower operation than a notification-page check and deserves its own
 * failure isolation: a stuck/slow paper source should never delay or
 * crowd out the notification pipeline's run.
 *
 * Protected by CRON_SECRET, same as check-sources — see that route for
 * the full rationale.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured — refusing to run." }, { status: 503 });
  }
  if (!isAuthorizedCron(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const runId = await startJobRun(supabase, "check_pyq_sources");
  const startedAt = Date.now();
  const results: Array<{ sourceId: string; ok: boolean; duplicate?: boolean; classification?: string | null; error?: string | null }> = [];
  let deferred = 0;

  try {
    const { data: sources, error: sourcesError } = await supabase.from("paper_ingestion_sources").select("*").eq("enabled", true).eq("needs_parser_maintenance", false);
    // A failed read must not look like "nothing is due".
    if (sourcesError) throw new Error(sourcesError.message);

    const due = ((sources ?? []) as PaperSourceRow[]).filter((s) => {
      if (!s.last_checked_at) return true;
      const dueAt = new Date(s.last_checked_at).getTime() + s.check_frequency_minutes * 60_000;
      return Date.now() >= dueAt;
    });

    // Phase 16: bounded run, stalest first; anything not reached stays due for the next run.
    const picked = selectSourcesForRun(due, 5);
    deferred = picked.deferred;

    for (const source of picked.selected) {
      if (!withinBudget(startedAt, Date.now())) {
        deferred += 1;
        continue;
      }
      const fetchResult = await fetchAndHash(source.official_url);
      if (!fetchResult.ok || !fetchResult.content) {
        await supabase.from("paper_ingestion_sources").update({ last_checked_at: new Date().toISOString(), last_error: fetchResult.error }).eq("id", source.id);
        results.push({ sourceId: source.id, ok: false, error: fetchResult.error });
        continue;
      }

      try {
        const outcome = await ingestPaper({
          sourceId: source.id,
          documentUrl: source.official_url,
          rawContent: fetchResult.content,
          organization: source.organization,
          parserVersion: source.parser_version,
        });
        results.push({ sourceId: source.id, ok: outcome.ok, duplicate: outcome.duplicate, classification: outcome.classification, error: outcome.error });
      } catch {
        // One broken source must not stop the others; the failure is recorded on the source row.
        await supabase.from("paper_ingestion_sources").update({ last_checked_at: new Date().toISOString(), last_error: "Ingestion failed unexpectedly." }).eq("id", source.id);
        results.push({ sourceId: source.id, ok: false, error: "Ingestion failed unexpectedly." });
      }
    }
  } catch {
    await finishJobRun(supabase, runId, false, { error: "paper source check failed", checked: results.length });
    return NextResponse.json({ error: "Paper source check run failed." }, { status: 500 });
  }

  await finishJobRun(supabase, runId, true, {
    checked: results.length,
    ingested: results.filter((r) => r.ok && !r.duplicate).length,
    errors: results.filter((r) => !r.ok).length,
    deferred,
  });

  return NextResponse.json({
    checked: results.length,
    ingested: results.filter((r) => r.ok && !r.duplicate).length,
    duplicates: results.filter((r) => r.duplicate).length,
    errors: results.filter((r) => !r.ok).map((r) => ({ sourceId: r.sourceId, error: r.error })),
  });
}
