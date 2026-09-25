import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAndHash } from "@/lib/source-monitoring/fetch";
import { ingestPaper } from "@/lib/pyq/ingestion/run";

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
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: sources } = await supabase.from("paper_ingestion_sources").select("*").eq("enabled", true).eq("needs_parser_maintenance", false);

  const dueSources = (sources ?? []).filter((s) => {
    if (!s.last_checked_at) return true;
    const dueAt = new Date(s.last_checked_at).getTime() + s.check_frequency_minutes * 60_000;
    return Date.now() >= dueAt;
  });

  const results = [];
  for (const source of dueSources) {
    const fetchResult = await fetchAndHash(source.official_url);
    if (!fetchResult.ok || !fetchResult.content) {
      await supabase.from("paper_ingestion_sources").update({ last_checked_at: new Date().toISOString(), last_error: fetchResult.error }).eq("id", source.id);
      results.push({ sourceId: source.id, ok: false, error: fetchResult.error });
      continue;
    }

    const outcome = await ingestPaper({
      sourceId: source.id,
      documentUrl: source.official_url,
      rawContent: fetchResult.content,
      organization: source.organization,
      parserVersion: source.parser_version,
    });
    results.push({ sourceId: source.id, ok: outcome.ok, duplicate: outcome.duplicate, classification: outcome.classification, error: outcome.error });
  }

  return NextResponse.json({
    checked: results.length,
    ingested: results.filter((r) => r.ok && !r.duplicate).length,
    duplicates: results.filter((r) => r.duplicate).length,
    errors: results.filter((r) => !r.ok).map((r) => ({ sourceId: r.sourceId, error: r.error })),
  });
}
