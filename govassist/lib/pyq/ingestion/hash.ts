import { createHash } from "crypto";

/** Normalizes whitespace/case before hashing so incidental formatting
 *  differences (extra spaces, line breaks) between two copies of the same
 *  source document don't register as "different content" — same reasoning
 *  as lib/source-monitoring/fetch.ts's normalizeForHashing. */
function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function hashDocument(rawContent: string): string {
  return createHash("sha256").update(normalize(rawContent)).digest("hex");
}

/** Identity hash for one question — prompt + option text, not option
 *  order/labels (an OCR re-run that shuffles A/B/C/D labelling but
 *  extracts the same content should still be recognized as the same
 *  question). Used for duplicate detection within an exam's question bank
 *  (lib/pyq/ingestion/dedupe.ts) — never a DB uniqueness constraint, since
 *  a question can legitimately recur verbatim across shifts. */
export function hashQuestionContent(prompt: string, optionTexts: string[]): string {
  const basis = [normalize(prompt), ...optionTexts.map(normalize).sort()].join("|");
  return createHash("sha256").update(basis).digest("hex");
}
