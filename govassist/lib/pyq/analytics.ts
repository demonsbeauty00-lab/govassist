// ---------------------------------------------------------------------------
// Automated scoring & performance analytics — Phase 7.
//
// Same principle as lib/pyq/scoring.ts and lib/eligibility/engine.ts: pure,
// deterministic functions. Nothing here hardcodes a marking scheme or a
// section list for any specific exam — every number is derived from
// whatever marking scheme and sections THIS paper's own DB rows say it
// has, which is exactly why lib/pyq/scoring.ts's resolveMarks() (question
// override → section scheme → paper default) is reused rather than
// duplicated here.
// ---------------------------------------------------------------------------

import { SectionBreakdownEntry, SectionBreakdownJson } from "@/lib/supabase/database.types";
import { ScoringOutcome, ScoringQuestion } from "./scoring";

export interface SectionAwareQuestion extends ScoringQuestion {
  sectionId: string | null;
  sectionName: string;
}

/**
 * Groups the same per-question scoring outcome (see scoreAttempt) by
 * section. Questions with no section (paper has none, or the question
 * wasn't assigned one) are grouped under a single "General" bucket rather
 * than silently dropped — every question counts toward exactly one
 * section-breakdown row.
 */
export function computeSectionBreakdown(questions: SectionAwareQuestion[], outcome: ScoringOutcome): SectionBreakdownJson {
  const bySection = new Map<string, { sectionId: string | null; sectionName: string; questions: SectionAwareQuestion[] }>();

  for (const q of questions) {
    const key = q.sectionId ?? "__general__";
    if (!bySection.has(key)) {
      bySection.set(key, { sectionId: q.sectionId, sectionName: q.sectionId ? q.sectionName : "General", questions: [] });
    }
    bySection.get(key)!.questions.push(q);
  }

  const sections: SectionBreakdownEntry[] = Array.from(bySection.values()).map(({ sectionId, sectionName, questions: sectionQuestions }) => {
    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;
    let marksEarned = 0;
    let negativeMarks = 0;
    let maxScore = 0;

    for (const q of sectionQuestions) {
      maxScore += q.marks;
      const graded = outcome.perQuestion[q.id];
      if (!graded || graded.isCorrect === null) {
        unattempted++;
        continue;
      }
      if (graded.isCorrect) {
        correct++;
        marksEarned += graded.marksAwarded;
      } else {
        incorrect++;
        negativeMarks += Math.abs(graded.marksAwarded);
      }
    }

    const attempted = correct + incorrect;
    const score = marksEarned - negativeMarks;
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : null;

    return {
      sectionId,
      sectionName,
      totalQuestions: sectionQuestions.length,
      attempted,
      correct,
      incorrect,
      unattempted,
      marksEarned: Math.round(marksEarned * 100) / 100,
      negativeMarks: Math.round(negativeMarks * 100) / 100,
      score: Math.round(score * 100) / 100,
      maxScore: Math.round(maxScore * 100) / 100,
      accuracy,
    };
  });

  return { sections };
}

/** Sum of marks actually earned from correct answers and marks actually
 *  lost to negative marking — derived straight from the same
 *  per-question outcome scoreAttempt() already produced, never
 *  recomputed from a flat "questions * scheme" assumption (which would be
 *  wrong the moment a paper has per-question marks overrides). */
export function computeMarksBreakdown(outcome: ScoringOutcome): { marksEarned: number; negativeMarksDeducted: number } {
  let marksEarned = 0;
  let negativeMarksDeducted = 0;
  for (const graded of Object.values(outcome.perQuestion)) {
    if (graded.isCorrect === true) marksEarned += graded.marksAwarded;
    else if (graded.isCorrect === false) negativeMarksDeducted += Math.abs(graded.marksAwarded);
  }
  return {
    marksEarned: Math.round(marksEarned * 100) / 100,
    negativeMarksDeducted: Math.round(negativeMarksDeducted * 100) / 100,
  };
}

export function computeAttemptPercentage(score: number, maxScore: number): number | null {
  if (maxScore <= 0) return null;
  return Math.round((score / maxScore) * 1000) / 10;
}

export function computeAverageTimePerQuestionSeconds(timeTakenSeconds: number, totalQuestions: number): number | null {
  if (totalQuestions <= 0) return null;
  return Math.round(timeTakenSeconds / totalQuestions);
}

// ---------------------------------------------------------------------------
// Cross-attempt performance — comparing a user's attempts at the SAME
// paper over time. Every field here is honestly optional: with fewer than
// two submitted attempts there is no "previous score" and no real trend,
// and this module returns null/empty rather than fabricating one.
// ---------------------------------------------------------------------------

export interface AttemptHistoryPoint {
  attemptId: string;
  submittedAt: string;
  score: number;
  maxScore: number;
  attemptPercentage: number | null;
  accuracy: number | null;
}

export interface SectionTrendEntry {
  sectionName: string;
  accuracy: number | null;
}

export interface PaperPerformanceHistory {
  attempts: AttemptHistoryPoint[]; // oldest → newest
  latest: AttemptHistoryPoint | null;
  previous: AttemptHistoryPoint | null;
  /** Percentage-point change, latest vs previous. Null when there's no
   *  previous attempt to compare against — never defaults to 0. */
  improvementPercentagePoints: number | null;
  /** Only populated when there are 2+ attempts — a single point is a
   *  score, not a trend. */
  hasTrend: boolean;
  weakSections: SectionTrendEntry[]; // up to 2, lowest accuracy first, from the latest attempt
  strongSections: SectionTrendEntry[]; // up to 2, highest accuracy first, from the latest attempt
}

export function computePaperPerformanceHistory(
  attempts: AttemptHistoryPoint[],
  latestSectionBreakdown: SectionBreakdownJson | null
): PaperPerformanceHistory {
  const sorted = [...attempts].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] ?? null : null;
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] ?? null : null;

  const improvementPercentagePoints =
    latest?.attemptPercentage != null && previous?.attemptPercentage != null
      ? Math.round((latest.attemptPercentage - previous.attemptPercentage) * 10) / 10
      : null;

  // Only meaningful with 2+ distinct sections that actually had attempted
  // questions — a single-section paper has nothing to call "weak" vs
  // "strong" relative to, so both stay empty rather than showing one
  // section as fake "weakest".
  const scoredSections = (latestSectionBreakdown?.sections ?? []).filter((s) => s.accuracy !== null);
  let weakSections: SectionTrendEntry[] = [];
  let strongSections: SectionTrendEntry[] = [];
  if (scoredSections.length >= 2) {
    const bySectionAccuracy = [...scoredSections].sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));
    weakSections = bySectionAccuracy.slice(0, 2).map((s) => ({ sectionName: s.sectionName, accuracy: s.accuracy }));
    strongSections = bySectionAccuracy
      .slice(-2)
      .reverse()
      .map((s) => ({ sectionName: s.sectionName, accuracy: s.accuracy }));
  }

  return {
    attempts: sorted,
    latest,
    previous,
    improvementPercentagePoints,
    hasTrend: sorted.length >= 2,
    weakSections,
    strongSections,
  };
}
