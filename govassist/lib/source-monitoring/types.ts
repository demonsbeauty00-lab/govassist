// ---------------------------------------------------------------------------
// Types shared across the source monitoring pipeline. Kept independent of
// the Supabase Row types (same principle as lib/eligibility/types.ts): the
// checker and classifier only ever know about these shapes, so a parser or
// a storage detail can change without rippling through the whole pipeline.
// ---------------------------------------------------------------------------

import { Database } from "@/lib/supabase/database.types";

export type UpdateType = Database["public"]["Tables"]["detected_updates"]["Row"]["update_type"];
export type Classification = Database["public"]["Tables"]["detected_updates"]["Row"]["classification"];
export type SourceType = Database["public"]["Tables"]["notification_sources"]["Row"]["source_type"];

export interface ExtractedNoticeField {
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
}

/** What a parser produces from one fetched page/document — one page can
 *  yield zero, one, or several updates (e.g. a notices index listing three
 *  separate new PDFs). */
export interface ParsedUpdate {
  updateType: UpdateType;
  title: string;
  documentUrl: string | null;
  publicationDate: string | null; // ISO date, only if confidently determined
  extractedFields: ExtractedNoticeField[];
}

/**
 * The contract every source parser implements. Deliberately narrow: given
 * the raw fetched content and the source it came from, return zero or more
 * parsed updates. No side effects, no I/O — a parser never fetches
 * anything itself (the checker owns fetching) and never writes to the
 * database (the checker owns persistence). That split is what makes a
 * parser something you can unit test with a saved HTML fixture instead of
 * a live network call.
 */
export interface SourceParser {
  /** Matches notification_sources.parser_version, so the checker knows
   *  which parser a given source is currently configured to use. */
  version: string;
  parse(content: string, context: { sourceUrl: string; organization: string }): ParsedUpdate[];
}

export interface FetchResult {
  ok: boolean;
  content: string | null;
  contentHash: string | null;
  error: string | null;
}
