// ---------------------------------------------------------------------------
// Stage detection from an official notice's TITLE. Pure and deterministic.
// It never guesses: when a title matches more than one stage (e.g. "Answer
// Key and Result") the result is flagged ambiguous so the pipeline sends it
// to human review instead of picking one.
// ---------------------------------------------------------------------------

import { UpdateType } from "../types";

interface Rule { type: UpdateType; pattern: RegExp }

// Order matters only for the "primary" tie-break below (corrigendum).
const RULES: Rule[] = [
  { type: "corrigendum", pattern: /\b(corrigendum|corrigenda|addendum|erratum)\b|\bamendment\b/i },
  { type: "exam_city_intimation", pattern: /city\s+(intimation|slip|allotment)|exam(ination)?\s+city|city\s+of\s+(the\s+)?exam|intimation\s+(of|regarding|about)\s+(the\s+)?(exam(ination)?\s+)?(city|centre|center)/i },
  { type: "admit_card", pattern: /admit\s*card|hall\s*ticket|call\s*letter|e-?admit/i },
  { type: "answer_key", pattern: /answer[\s-]*key/i },
  { type: "response_sheet", pattern: /response\s*sheet|candidates?'?s?\s+responses?|responses?\s+of\s+(the\s+)?candidates?/i },
  { type: "objection_window", pattern: /objection|challenge\s+(window|link|facility)/i },
  { type: "scorecard", pattern: /score[\s-]*card|marks?\s*(sheet|card)|scores?\s+of\s+(the\s+)?candidates?/i },
  { type: "cutoff", pattern: /cut[\s-]*off/i },
  { type: "result", pattern: /\bresults?\b|merit\s+list|list\s+of\s+(selected|shortlisted|qualified)\s+candidates?/i },
  { type: "exam_date", pattern: /exam(ination)?\s+(date|schedule|calendar|time[\s-]*table)|date\s+of\s+(the\s+)?exam(ination)?|schedule\s+of\s+(the\s+)?exam(ination)?|tentative\s+(exam(ination)?\s+)?(date|schedule)/i },
  { type: "application_end_date_change", pattern: /extension\s+of\s+(the\s+)?(last\s+)?date|last\s+date.*\bextended\b|\bextended\b.*last\s+date|revised\s+last\s+date|date\s+extended/i },
];

export interface StageDetection {
  /** The single detected type, or "new_notification" when nothing matched. */
  type: UpdateType;
  matched: boolean;
  /** True when the title matches more than one distinct stage. */
  ambiguous: boolean;
  candidates: UpdateType[];
}

export function detectStageType(title: string): StageDetection {
  const hits = RULES.filter((r) => r.pattern.test(title)).map((r) => r.type);

  if (hits.length === 0) {
    return { type: "new_notification", matched: false, ambiguous: false, candidates: [] };
  }
  // A corrigendum is about another document; it is the primary type even if
  // the title also names the document it corrects ("Corrigendum to Admit Card").
  if (hits.includes("corrigendum")) {
    return { type: "corrigendum", matched: true, ambiguous: false, candidates: ["corrigendum"] };
  }
  const first = hits[0] as UpdateType;
  return { type: first, matched: true, ambiguous: hits.length > 1, candidates: hits };
}
