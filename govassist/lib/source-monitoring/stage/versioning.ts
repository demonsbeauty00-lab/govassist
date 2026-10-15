// ---------------------------------------------------------------------------
// Duplicate and revision handling for official documents. Pure.
//
//  - document_key: normalised URL, so the same PDF found twice (or on two
//    pages) is one document.
//  - series_key: the document's title with revision words, dates and years
//    removed, so "Provisional Answer Key - Tier I" and "Revised Answer Key -
//    Tier I (12.03.2026)" belong to the same series, while Tier II does not.
//  - planVersioning decides what a new document means for what is already
//    published for the same cycle + stage.
// ---------------------------------------------------------------------------

const REVISION_WORDS = /\b(revised|revision|updated|modified|amended|re-?issued|replaced|replacement|supersed\w*|final|corrected|rectified|provisional|tentative|new)\b/gi;
const REVISION_TEST = /\b(revised|revision|updated|modified|amended|re-?issued|replaced|replacement|supersed\w*|final|corrected|rectified)\b/i;

export function isRevisionTitle(title: string): boolean {
  return REVISION_TEST.test(title);
}

export function normalizeDocumentUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    u.hash = "";
    for (const key of Array.from(u.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    }
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
    const query = u.searchParams.toString();
    return `${u.protocol}//${u.host.toLowerCase()}${path}${query ? `?${query}` : ""}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

/** A stable key for one document. A notice with no file of its own is keyed by
 *  the page it was found on plus its title, so two different notices on one
 *  page never collapse into one. */
export function documentKeyFor(documentUrl: string | null, officialUrl: string, title: string): string {
  if (documentUrl && documentUrl.trim()) return normalizeDocumentUrl(documentUrl);
  return `${normalizeDocumentUrl(officialUrl)}#${title.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

const STOP = new Set(["the", "of", "for", "and", "to", "in", "on", "regarding", "reg", "dated", "date", "a", "an", "with", "against"]);

export function seriesKey(title: string, fallback: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/\d{1,2}[./-]\d{1,2}[./-]\d{4}/g, " ")
    .replace(/\d{1,2}(st|nd|rd|th)?\s+[a-z]{3,9}\.?,?\s+\d{4}/g, " ")
    .replace(/[a-z]{3,9}\.?\s+\d{1,2}(st|nd|rd|th)?,?\s+\d{4}/g, " ")
    .replace(/\b(19|20)\d{2}(\s*[-–]\s*\d{2,4})?\b/g, " ")
    .replace(REVISION_WORDS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .join(" ")
    .trim();
  return cleaned || fallback;
}

export interface ExistingStageRow {
  id: string;
  seriesKey: string;
  documentKey: string;
  publicationDate: string | null;
  isLatest: boolean;
  version: number;
}

export type VersionAction = "new" | "duplicate" | "supersede" | "ambiguous" | "historical";

export interface VersionPlan {
  action: VersionAction;
  version: number;
  /** Rows to demote (mark not-latest, point at the new row). */
  supersedesIds: string[];
  /** For "historical": the newer row this older document sits behind. */
  supersededById: string | null;
}

export function planVersioning(input: {
  seriesKey: string;
  documentKey: string;
  publicationDate: string | null;
  isRevision: boolean;
  existing: ExistingStageRow[];
}): VersionPlan {
  if (input.existing.some((e) => e.documentKey === input.documentKey)) {
    return { action: "duplicate", version: 0, supersedesIds: [], supersededById: null };
  }
  const sameSeries = input.existing.filter((e) => e.seriesKey === input.seriesKey);
  const nextVersion = sameSeries.reduce((max, e) => Math.max(max, e.version), 0) + 1;
  const latest = sameSeries.find((e) => e.isLatest);

  if (!latest) return { action: "new", version: nextVersion, supersedesIds: [], supersededById: null };

  // An older document turning up late must not displace a newer verified one.
  if (input.publicationDate && latest.publicationDate && input.publicationDate < latest.publicationDate) {
    return { action: "historical", version: nextVersion, supersedesIds: [], supersededById: latest.id };
  }
  if (input.isRevision) {
    return { action: "supersede", version: nextVersion, supersedesIds: [latest.id], supersededById: null };
  }
  // Same series, different document, not labelled as a revision: could be a
  // genuine replacement or a separate batch. Do not decide automatically.
  return { action: "ambiguous", version: nextVersion, supersedesIds: [latest.id], supersededById: null };
}

/** After a human has approved an ambiguous update, it replaces the latest. */
export function resolveAmbiguous(plan: VersionPlan): VersionPlan {
  return plan.action === "ambiguous" ? { ...plan, action: "supersede" } : plan;
}
