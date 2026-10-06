// ---------------------------------------------------------------------------
// profiles.category is a closed enum (General | OBC | SC | ST | EWS) that
// the eligibility engine matches against exam rules verbatim — see
// lib/eligibility/engine.ts. An OCR/user-typed category certificate almost
// never reads back in that exact form ("O.B.C.", "Other Backward Class
// (Non-Creamy Layer)", "General (UR)"), so applying it to the profile
// directly, the way Name/DOB/State are copied as free text, would risk
// silently writing a value the engine can never match — which fails
// exactly the "likely not eligible" / "needs review" judgment calls this
// product exists to get right.
//
// This is a pure, deterministic, intentionally conservative normalizer:
// it recognizes common real-world spellings/abbreviations of each enum
// value and otherwise returns null — never a best guess. A null result
// means the caller (applyExtractedFieldsToProfileAction) must NOT write
// to profiles.category and must tell the user to set it manually instead.
// ---------------------------------------------------------------------------

export type ProfileCategory = "General" | "OBC" | "SC" | "ST" | "EWS";

const PATTERNS: Array<{ category: ProfileCategory; test: RegExp }> = [
  // Longest/most specific patterns first — "Economically Weaker" must not
  // be caught by a shorter, more general pattern below it.
  { category: "EWS", test: /\bEWS\b|economically\s*weaker/i },
  { category: "OBC", test: /\bO\.?\s*B\.?\s*C\.?\b|other\s*backward/i },
  { category: "SC", test: /\bSC\b|scheduled\s*caste/i },
  { category: "ST", test: /\bST\b|scheduled\s*tribe/i },
  { category: "General", test: /\bgeneral\b|\bunreserved\b|\bUR\b|\bGEN\b/i },
];

/** Returns the matching enum value, or null when the input doesn't
 *  confidently match any known category — including empty input. Never
 *  guesses between two plausible matches: if a string genuinely matches
 *  more than one pattern (shouldn't happen with real certificate text,
 *  but inputs are untrusted), the first and most specific match wins,
 *  consistent with the fixed priority order above. */
export function normalizeCategoryValue(raw: string): ProfileCategory | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  for (const { category, test } of PATTERNS) {
    if (test.test(trimmed)) return category;
  }
  return null;
}
