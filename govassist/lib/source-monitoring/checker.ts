import "server-only";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAndHash } from "./fetch";
import { prepareDetectedUpdate } from "./stage/prepare";
import { loadMatchContext } from "./stage/context";
import { getParser } from "./parsers/registry";
import { applyDetectedUpdate } from "./apply";
import { Database } from "@/lib/supabase/database.types";
import { ParsedUpdate } from "./types";

type SourceRow = Database["public"]["Tables"]["notification_sources"]["Row"];

export interface CheckSourceResult {
  sourceId: string;
  ok: boolean;
  changed: boolean;
  updatesDetected: number;
  duplicatesSkipped: number;
  error: string | null;
}

/** Stable per-item identifier — deliberately independent of the whole
 *  page's content hash, so three distinct notices found in one page fetch
 *  get three distinct, individually-dedupable identifiers (requirement 3),
 *  rather than one hash that could only ever represent "this page changed"
 *  at all. */
function updateIdentityHash(update: ParsedUpdate): string {
  const basis = `${update.updateType}|${update.title.trim().toLowerCase()}|${update.documentUrl ?? ""}`;
  return createHash("sha256").update(basis).digest("hex");
}

/**
 * Checks one source: fetch → compare against last known page hash → if
 * changed, parse → classify each parsed update → insert as a
 * detected_update (skipping anything already seen, by identity hash) →
 * audit-log every step. Never throws — every failure path is recorded on
 * the source row and in the audit log instead (requirement 16: keep
 * previous verified information, record the failure, retry later).
 */
export async function checkSource(source: SourceRow): Promise<CheckSourceResult> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  await supabase.from("source_audit_log").insert({
    source_id: source.id,
    event_type: "checked",
    detected_at: now,
  });

  if (source.needs_parser_maintenance) {
    return { sourceId: source.id, ok: false, changed: false, updatesDetected: 0, duplicatesSkipped: 0, error: "Source flagged for parser maintenance — skipped." };
  }

  const fetchResult = await fetchAndHash(source.official_url);

  if (!fetchResult.ok || !fetchResult.content || !fetchResult.contentHash) {
    await supabase
      .from("notification_sources")
      .update({
        last_checked_at: now,
        last_error: fetchResult.error,
        // Phase 15: lets the control center tell a one-off blip from a source that has been down.
        // Nothing already verified or published is touched by a failed check.
        consecutive_failures: (source.consecutive_failures ?? 0) + 1,
        updated_at: now,
      })
      .eq("id", source.id);
    await supabase.from("source_audit_log").insert({
      source_id: source.id,
      event_type: "check_failed",
      new_value: { error: fetchResult.error },
      detected_at: now,
    });
    return { sourceId: source.id, ok: false, changed: false, updatesDetected: 0, duplicatesSkipped: 0, error: fetchResult.error };
  }

  const changed = fetchResult.contentHash !== source.last_content_hash;

  await supabase
    .from("notification_sources")
    .update({
      last_checked_at: now,
      last_success_at: now,
      last_error: null,
      consecutive_failures: 0,
      last_content_hash: fetchResult.contentHash,
      updated_at: now,
    })
    .eq("id", source.id);

  await supabase.from("source_audit_log").insert({
    source_id: source.id,
    event_type: "check_succeeded",
    previous_value: { content_hash: source.last_content_hash },
    new_value: { content_hash: fetchResult.contentHash },
    detected_at: now,
  });

  if (!changed) {
    return { sourceId: source.id, ok: true, changed: false, updatesDetected: 0, duplicatesSkipped: 0, error: null };
  }

  await supabase.from("source_audit_log").insert({
    source_id: source.id,
    event_type: "change_detected",
    detected_at: now,
  });

  const parser = getParser(source.parser_version);
  if (!parser) {
    // A configured parser_version with no matching implementation is a
    // config error, not a content problem — flag for maintenance rather
    // than silently doing nothing on every future check.
    await supabase
      .from("notification_sources")
      .update({ needs_parser_maintenance: true, last_error: `No parser registered for version "${source.parser_version}"`, updated_at: now })
      .eq("id", source.id);
    return { sourceId: source.id, ok: false, changed: true, updatesDetected: 0, duplicatesSkipped: 0, error: "No parser registered." };
  }

  let parsedUpdates: ParsedUpdate[];
  try {
    parsedUpdates = parser.parse(fetchResult.content, { sourceUrl: source.official_url, organization: source.organization });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parser threw an unknown error";
    // A parser that throws on real content is exactly "the website changes
    // its structure" (requirement 16) — flag for maintenance rather than
    // erroring the whole scheduled run.
    await supabase
      .from("notification_sources")
      .update({ needs_parser_maintenance: true, last_error: `Parser error: ${message}`, updated_at: now })
      .eq("id", source.id);
    return { sourceId: source.id, ok: false, changed: true, updatesDetected: 0, duplicatesSkipped: 0, error: message };
  }

  let inserted = 0;
  let duplicates = 0;

  // Phase 13: load the candidate exams/cycles once per source, not per update.
  // If this lookup fails we cannot identify cycles, so nothing is auto-linked:
  // every update below falls to NEEDS_REVIEW instead of being guessed.
  let matchContext: Awaited<ReturnType<typeof loadMatchContext>>;
  try {
    matchContext = await loadMatchContext(supabase, source.exam_id);
  } catch {
    matchContext = { exams: [], cycles: [], loadExisting: async () => [] };
  }

  for (const original of parsedUpdates) {
    // Identity is computed from what the PARSER produced (before refinement),
    // so rows detected before Phase 13 keep the same hash and are never re-inserted.
    const identityHash = updateIdentityHash(original);

    const prepared = await prepareDetectedUpdate({
      parsed: original,
      source: { examId: source.exam_id, officialUrl: source.official_url },
      exams: matchContext.exams,
      cycles: matchContext.cycles,
      loadExisting: matchContext.loadExisting,
    });
    const update = prepared.update;
    const classification = prepared.classification;

    // The same official document is already published for this cycle + stage
    // (e.g. the same PDF linked from two pages): do not stage it again.
    if (prepared.duplicate) {
      duplicates++;
      await supabase.from("source_audit_log").insert({
        source_id: source.id,
        event_type: "duplicate_skipped",
        new_value: { title: update.title, reason: "document already published for this cycle and stage", document_key: prepared.documentKey },
        detected_at: now,
      });
      continue;
    }

    // Visible to the reviewer, so "why is this in review?" is never a mystery.
    const reviewNotes = prepared.reasons.map((r) => ({ label: "Needs review because", value: r, confidence: "low" as const }));

    const { data: insertedRow, error: insertError } = await supabase
      .from("detected_updates")
      .insert({
        source_id: source.id,
        exam_cycle_id: prepared.examCycleId,
        update_type: update.updateType,
        title: update.title,
        official_url: source.official_url,
        document_url: update.documentUrl,
        publication_date: update.publicationDate,
        event_date: update.eventDate ?? null,
        cycle_match: prepared.cycleMatch,
        series_key: prepared.seriesKey,
        is_revision: prepared.isRevision,
        content_hash: identityHash,
        extracted_fields: [...update.extractedFields, ...reviewNotes],
        classification,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !insertedRow) {
      // The unique index on (source_id, content_hash) is what makes this
      // path routine, not exceptional — a duplicate insert is expected to
      // fail this way on every re-check of an unchanged notice.
      if (insertError?.code === "23505") {
        duplicates++;
        await supabase.from("source_audit_log").insert({
          source_id: source.id,
          event_type: "duplicate_skipped",
          new_value: { title: update.title, identity_hash: identityHash },
          detected_at: now,
        });
        continue;
      }
      // Any other insert error is unexpected and worth recording, but
      // still shouldn't abort the rest of this source's updates.
      await supabase.from("source_audit_log").insert({
        source_id: source.id,
        event_type: "check_failed",
        new_value: { title: update.title, error: insertError?.message },
        detected_at: now,
      });
      continue;
    }

    inserted++;

    if (!prepared.examCycleId && update.updateType !== "new_notification") {
      await supabase.from("source_audit_log").insert({
        source_id: source.id,
        detected_update_id: insertedRow.id,
        event_type: "cycle_unmatched",
        new_value: { reason: prepared.cycleReason },
        detected_at: now,
      });
    }

    // AUTO_PUBLISH means no human verification is required (requirement
    // 6) — apply it immediately, through the exact same function admin
    // approval uses, so both paths are identically auditable.
    if (classification === "auto_publish") {
      await applyDetectedUpdate(insertedRow.id, null);
    }
  }

  return { sourceId: source.id, ok: true, changed: true, updatesDetected: inserted, duplicatesSkipped: duplicates, error: null };
}

/** Sources due for a check right now, per their own check_frequency —
 *  this is what lets a single cron trigger serve many sources with
 *  different cadences (see app/api/cron/check-sources/route.ts). */
export async function getDueSources(): Promise<SourceRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("notification_sources")
    .select("*")
    .eq("enabled", true)
    .eq("needs_parser_maintenance", false);

  // Phase 16: a failed read must not look like "nothing is due" — the cron route records the run as failed.
  if (error) throw new Error(`Could not read notification sources: ${error.message}`);
  if (!data) return [];

  const now = Date.now();
  return data.filter((source: SourceRow) => {
    if (!source.last_checked_at) return true;
    const dueAt = new Date(source.last_checked_at).getTime() + source.check_frequency_minutes * 60_000;
    return now >= dueAt;
  });
}
