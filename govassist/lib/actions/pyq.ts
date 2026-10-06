"use server";

import { requireUser } from "./session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { paperRowToDetail, paperRowToSummary } from "@/lib/pyq/from-db-row";
import { resolveMarks, ScoringAnswer } from "@/lib/pyq/scoring";
import {
  computeAttemptPercentage,
  computeAverageTimePerQuestionSeconds,
  computePaperPerformanceHistory,
  AttemptHistoryPoint,
  PaperPerformanceHistory,
} from "@/lib/pyq/analytics";
import { calculateFromAnswerKey, AnswerKeyQuestion } from "@/lib/scoring/answer-key-calculator";
import {
  AttemptAnswerInput,
  AttemptQuestion,
  AttemptResult,
  AttemptState,
  PaperDetail,
  PaperSummary,
  ReviewQuestion,
} from "@/lib/pyq/types";

// ---------------------------------------------------------------------------
// Listing + paper detail — public-read data (papers/paper_sections/
// marking_schemes all have a "published only" RLS policy), so these use
// the caller's own session client. Every route that calls them still sits
// behind middleware auth (see middleware.ts's PROTECTED_PREFIXES including
// /preparation), consistent with how the rest of the app treats
// "published" reference content.
// ---------------------------------------------------------------------------

export interface PaperListFilters {
  examCategory?: string;
  examSlug?: string;
  year?: number;
  stage?: string;
}

export async function listPublishedPapersAction(filters: PaperListFilters = {}): Promise<{ error?: string; papers: PaperSummary[] }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, papers: [] };

  let query = result.supabase.from("papers").select("*").eq("status", "published").order("year", { ascending: false });
  if (filters.examCategory) query = query.eq("exam_category", filters.examCategory);
  if (filters.examSlug) query = query.eq("exam_slug", filters.examSlug);
  if (filters.year) query = query.eq("year", filters.year);
  if (filters.stage) query = query.eq("stage", filters.stage);

  const { data, error } = await query;
  if (error) return { error: error.message, papers: [] };
  return { papers: (data ?? []).map(paperRowToSummary) };
}

export async function getPaperDetailAction(paperId: string): Promise<{ error?: string; paper: PaperDetail | null }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, paper: null };

  const { data: paperRow, error } = await result.supabase.from("papers").select("*").eq("id", paperId).eq("status", "published").maybeSingle();
  if (error) return { error: error.message, paper: null };
  if (!paperRow) return { paper: null };

  const [{ data: sections }, { data: schemes }] = await Promise.all([
    result.supabase.from("paper_sections").select("*").eq("paper_id", paperId),
    result.supabase.from("marking_schemes").select("*").eq("paper_id", paperId),
  ]);

  return { paper: paperRowToDetail(paperRow, sections ?? [], schemes ?? []) };
}

// ---------------------------------------------------------------------------
// Attempt flow. Question/option content has no RLS policy at all (see
// 0010_pyq_papers.sql's file header) — every read of it below goes through
// the admin (service-role) client, and every function here is careful
// about exactly which fields it lets reach the client: correct answers are
// stripped while an attempt is in progress, and only assembled for review
// once the attempt's own row (owned by the signed-in user, RLS-checked via
// their session client) shows status = 'submitted'.
// ---------------------------------------------------------------------------

async function loadPaperQuestionsForScoring(paperId: string) {
  const admin = createAdminClient();
  const [{ data: questions }, { data: options }, { data: schemes }, { data: sections }] = await Promise.all([
    admin.from("questions").select("*").eq("paper_id", paperId).eq("status", "published").order("question_number", { ascending: true }),
    admin.from("question_options").select("*"),
    admin.from("marking_schemes").select("*").eq("paper_id", paperId),
    admin.from("paper_sections").select("*").eq("paper_id", paperId),
  ]);
  return { questions: questions ?? [], options: options ?? [], schemes: schemes ?? [], sections: sections ?? [] };
}

export async function startAttemptAction(
  paperId: string,
  attemptSource: "mock_attempt" | "manual_entry" = "mock_attempt"
): Promise<{ error?: string; attempt?: AttemptState }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  // paperRow and the in-progress-attempt lookup are independent of each
  // other (the lookup only needs paperId/user.id/attemptSource, never
  // paperRow's own fields), so they run in parallel — previously these
  // were two sequential round trips. If paperRow turns out missing, the
  // `existing` result is simply unused below; nothing is wasted by having
  // fetched it, since it's cheap and already in flight.
  const [{ data: paperRow, error: paperError }, { data: existing }] = await Promise.all([
    supabase.from("papers").select("*").eq("id", paperId).eq("status", "published").maybeSingle(),
    // Resume an existing in-progress attempt instead of starting a fresh
    // one — otherwise a page refresh mid-test would silently discard
    // progress.
    supabase
      .from("paper_attempts")
      .select("*")
      .eq("paper_id", paperId)
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .eq("attempt_source", attemptSource)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (paperError) return { error: paperError.message };
  if (!paperRow) return { error: "This paper isn't available." };

  const admin = createAdminClient();
  // Three more independent reads (none depends on another's result) — same
  // parallelization loadPaperQuestionsForScoring already uses elsewhere in
  // this file; this call site just hadn't been updated to match.
  const [{ data: questionRows }, { data: optionRows }, { data: schemeRows }] = await Promise.all([
    admin.from("questions").select("*").eq("paper_id", paperId).eq("status", "published").order("question_number", { ascending: true }),
    admin.from("question_options").select("*"),
    admin.from("marking_schemes").select("*").eq("paper_id", paperId),
  ]);

  if (!questionRows || questionRows.length === 0) {
    return { error: "This paper doesn't have any published questions yet." };
  }

  const optionsByQuestion = new Map<string, typeof optionRows>();
  for (const opt of optionRows ?? []) {
    const list = optionsByQuestion.get(opt.question_id) ?? [];
    list.push(opt);
    optionsByQuestion.set(opt.question_id, list);
  }
  const defaultScheme = schemeRows?.find((s) => s.section_id === null);
  const schemeBySection = new Map((schemeRows ?? []).filter((s) => s.section_id !== null).map((s) => [s.section_id as string, s]));

  const questions: AttemptQuestion[] = questionRows.map((q) => {
    const { marks, negativeMarks } = resolveMarks({
      questionMarks: q.marks,
      questionNegativeMarks: q.negative_marks,
      sectionScheme: q.section_id ? schemeBySection.get(q.section_id) ? { correctMarks: schemeBySection.get(q.section_id)!.correct_marks, incorrectMarks: schemeBySection.get(q.section_id)!.incorrect_marks } : undefined : undefined,
      defaultScheme: { correctMarks: defaultScheme?.correct_marks ?? 1, incorrectMarks: defaultScheme?.incorrect_marks ?? 0 },
    });
    const opts = (optionsByQuestion.get(q.id) ?? []).sort((a, b) => a.order_index - b.order_index);
    return {
      id: q.id,
      sectionId: q.section_id,
      questionNumber: q.question_number,
      questionType: q.question_type,
      prompt: q.prompt,
      promptImageUrl: q.prompt_image_url,
      options: opts.map((o) => ({ id: o.id, label: o.option_label, text: o.option_text })),
      marks,
      negativeMarks,
    };
  });

  const maxScore = questions.reduce((sum, q) => sum + q.marks, 0);

  let attemptId: string;
  let startedAt: string;

  if (existing) {
    attemptId = existing.id;
    startedAt = existing.started_at;
  } else {
    const { data: attemptRow, error: attemptError } = await supabase
      .from("paper_attempts")
      .insert({
        user_id: user.id,
        paper_id: paperId,
        duration_seconds: paperRow.duration_minutes * 60,
        total_questions: questions.length,
        max_score: Math.round(maxScore * 100) / 100,
        attempt_source: attemptSource,
      })
      .select("*")
      .single();
    if (attemptError || !attemptRow) return { error: attemptError?.message ?? "Could not start the attempt." };
    attemptId = attemptRow.id;
    startedAt = attemptRow.started_at;
  }

  return {
    attempt: {
      attemptId,
      paperId,
      status: "in_progress",
      startedAt,
      durationSeconds: paperRow.duration_minutes * 60,
      questions,
    },
  };
}

/** Existing answers for an in-progress attempt (safe subset — no
 *  correctness) so the mock interface can restore selections after a
 *  resume. */
export async function getAttemptAnswersAction(attemptId: string): Promise<{ error?: string; answers: AttemptAnswerInput[] }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, answers: [] };

  const { data, error } = await result.supabase.from("paper_attempt_answers").select("*").eq("attempt_id", attemptId);
  if (error) return { error: error.message, answers: [] };

  return {
    answers: (data ?? []).map((a) => ({
      questionId: a.question_id,
      selectedOptionId: a.selected_option_id,
      numericAnswer: a.numeric_answer,
      isMarkedForReview: a.is_marked_for_review,
    })),
  };
}

/** Backs the "Save & Next" / mark-for-review / clear-response actions —
 *  upserted immediately rather than held only in client state, so a lost
 *  connection or a refresh mid-test never silently drops a saved answer. */
export async function saveAttemptAnswerAction(attemptId: string, answer: AttemptAnswerInput): Promise<{ error?: string; saved?: boolean }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: attempt } = await supabase.from("paper_attempts").select("id, user_id, status").eq("id", attemptId).maybeSingle();
  if (!attempt || attempt.user_id !== user.id) return { error: "Attempt not found." };
  if (attempt.status !== "in_progress") return { error: "This attempt has already been submitted." };

  const hasAnswer = answer.selectedOptionId !== null || (answer.numericAnswer !== null && answer.numericAnswer.trim().length > 0);

  const { error } = await supabase.from("paper_attempt_answers").upsert(
    {
      attempt_id: attemptId,
      question_id: answer.questionId,
      selected_option_id: answer.selectedOptionId,
      numeric_answer: answer.numericAnswer,
      is_marked_for_review: answer.isMarkedForReview,
      answered_at: hasAnswer ? new Date().toISOString() : null,
    },
    { onConflict: "attempt_id,question_id" }
  );

  if (error) return { error: error.message };
  return { saved: true };
}

export async function submitAttemptAction(attemptId: string): Promise<{ error?: string; result?: AttemptResult }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: attempt, error: attemptError } = await supabase.from("paper_attempts").select("*").eq("id", attemptId).maybeSingle();
  if (attemptError) return { error: attemptError.message };
  if (!attempt || attempt.user_id !== user.id) return { error: "Attempt not found." };
  if (attempt.status !== "in_progress") {
    // Idempotent — a double-click on Submit (or a race with the auto-submit
    // timer) should show the existing result, not error.
    return getAttemptResultAction(attemptId);
  }

  const { data: paperRow } = await supabase.from("papers").select("title, answer_key_version, answer_key_status").eq("id", attempt.paper_id).maybeSingle();
  const { questions, options, schemes, sections } = await loadPaperQuestionsForScoring(attempt.paper_id);
  const { data: savedAnswers } = await supabase.from("paper_attempt_answers").select("*").eq("attempt_id", attemptId);

  const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));

  const optionsByQuestion = new Map<string, typeof options>();
  for (const opt of options) {
    const list = optionsByQuestion.get(opt.question_id) ?? [];
    list.push(opt);
    optionsByQuestion.set(opt.question_id, list);
  }
  const defaultScheme = schemes.find((s) => s.section_id === null);
  const schemeBySection = new Map(schemes.filter((s) => s.section_id !== null).map((s) => [s.section_id as string, s]));

  // Every question this attempt is scored against, in the shape
  // lib/scoring/answer-key-calculator.ts expects — this is the SAME
  // calculation path Phase 7.5's manual-entry flow uses too (see
  // startManualAnswerKeyEntryAction in lib/actions/answer-key.ts, which
  // just calls startAttemptAction with a different attempt_source before
  // funneling back through this same submitAttemptAction), so a mock
  // attempt and a manually-entered real-exam response are scored
  // identically, and a paper's dropped/bonus-marked/revised-answer-key
  // questions are honored here automatically without any separate code
  // path.
  const answerKeyQuestions: AnswerKeyQuestion[] = questions.map((q) => {
    const correctOption = (optionsByQuestion.get(q.id) ?? []).find((o) => o.is_correct) ?? null;
    const { marks, negativeMarks } = resolveMarks({
      questionMarks: q.marks,
      questionNegativeMarks: q.negative_marks,
      sectionScheme: q.section_id ? schemeBySection.get(q.section_id) ? { correctMarks: schemeBySection.get(q.section_id)!.correct_marks, incorrectMarks: schemeBySection.get(q.section_id)!.incorrect_marks } : undefined : undefined,
      defaultScheme: { correctMarks: defaultScheme?.correct_marks ?? 1, incorrectMarks: defaultScheme?.incorrect_marks ?? 0 },
    });
    return {
      id: q.id,
      questionNumber: q.question_number,
      correctOptionId: correctOption?.id ?? null,
      correctNumericValue: q.correct_numeric_value,
      marks,
      negativeMarks,
      sectionId: q.section_id,
      sectionName: q.section_id ? sectionNameById.get(q.section_id) ?? "General" : "General",
      statusFlag: q.question_status_flag,
    };
  });

  const scoringAnswers: ScoringAnswer[] = (savedAnswers ?? []).map((a) => ({
    questionId: a.question_id,
    selectedOptionId: a.selected_option_id,
    numericAnswer: a.numeric_answer,
  }));

  // Question-wise labels aren't needed here — getAttemptReviewAction
  // builds its own richer per-question review (full option text,
  // explanations) independently. Empty maps just skip that unused work.
  const calc = calculateFromAnswerKey({
    questions: answerKeyQuestions,
    answers: scoringAnswers,
    hasMarkingScheme: schemes.length > 0,
    candidateAnswerLabels: new Map(),
    officialAnswerLabels: new Map(),
  });

  if (calc.calculationStatus === "needs_review") {
    return { error: calc.reviewMessage ?? "This paper's marking scheme needs verification before a score can be calculated." };
  }

  // Persist per-answer grading — only for answers that exist; unattempted
  // questions correctly have no row and don't need one. question_number is
  // unique per paper (DB constraint), so it's a safe join key back to id.
  const idByQuestionNumber = new Map(answerKeyQuestions.map((q) => [q.questionNumber, q.id]));
  const gradedByQuestionId = new Map(
    calc.questionWiseResults
      .map((r) => [idByQuestionNumber.get(r.questionNumber), r] as const)
      .filter((entry): entry is [string, (typeof calc.questionWiseResults)[number]] => entry[0] !== undefined)
  );
  for (const a of savedAnswers ?? []) {
    const graded = gradedByQuestionId.get(a.question_id);
    if (!graded) continue;
    const isCorrect = graded.outcome === "correct" || graded.outcome === "bonus" ? true : graded.outcome === "incorrect" ? false : null;
    await supabase
      .from("paper_attempt_answers")
      .update({ is_correct: isCorrect, marks_awarded: graded.marksAwarded > 0 ? graded.marksAwarded : -graded.negativeMarksApplied })
      .eq("id", a.id);
  }

  const timeTakenSeconds = Math.max(0, Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000));
  const markedForReviewCount = (savedAnswers ?? []).filter((a) => a.is_marked_for_review).length;

  const { error: updateError } = await supabase
    .from("paper_attempts")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      time_taken_seconds: timeTakenSeconds,
      attempted_count: calc.attempted,
      marked_for_review_count: markedForReviewCount,
      correct_count: calc.correct,
      incorrect_count: calc.incorrect,
      unattempted_count: calc.unattempted,
      score: calc.finalScore ?? 0,
      max_score: calc.maximumMarks ?? attempt.max_score,
      accuracy: calc.accuracy,
      marks_earned: calc.marksFromCorrect,
      negative_marks_deducted: calc.negativeMarks,
      section_breakdown: { sections: calc.sectionWiseScores },
      answer_key_version_at_submission: paperRow?.answer_key_version ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attemptId);

  if (updateError) return { error: updateError.message };

  return {
    result: {
      attemptId,
      paperId: attempt.paper_id,
      paperTitle: paperRow?.title ?? "Mock test",
      totalQuestions: calc.totalQuestions,
      attemptedCount: calc.attempted,
      markedForReviewCount,
      correctCount: calc.correct,
      incorrectCount: calc.incorrect,
      unattemptedCount: calc.unattempted,
      score: calc.finalScore ?? 0,
      maxScore: calc.maximumMarks ?? attempt.max_score,
      accuracy: calc.accuracy,
      timeTakenSeconds,
      attemptPercentage: calc.attemptPercentage,
      avgTimePerQuestionSeconds: computeAverageTimePerQuestionSeconds(timeTakenSeconds, calc.totalQuestions),
      marksEarned: calc.marksFromCorrect,
      negativeMarksDeducted: calc.negativeMarks,
      sectionBreakdown: calc.sectionWiseScores,
      attemptSource: attempt.attempt_source,
      answerKeyStatus: paperRow?.answer_key_status ?? null,
      isStale: false, // just submitted against the current version, by definition
    },
  };
}

export async function getAttemptResultAction(attemptId: string): Promise<{ error?: string; result?: AttemptResult }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: attempt, error } = await supabase.from("paper_attempts").select("*").eq("id", attemptId).maybeSingle();
  if (error) return { error: error.message };
  if (!attempt || attempt.user_id !== user.id) return { error: "Attempt not found." };
  if (attempt.status !== "submitted") return { error: "This attempt hasn't been submitted yet." };

  const { data: paperRow } = await supabase.from("papers").select("title, answer_key_version, answer_key_status").eq("id", attempt.paper_id).maybeSingle();

  return {
    result: {
      attemptId: attempt.id,
      paperId: attempt.paper_id,
      paperTitle: paperRow?.title ?? "Mock test",
      totalQuestions: attempt.total_questions,
      attemptedCount: attempt.attempted_count,
      markedForReviewCount: attempt.marked_for_review_count,
      correctCount: attempt.correct_count,
      incorrectCount: attempt.incorrect_count,
      unattemptedCount: attempt.unattempted_count,
      score: attempt.score,
      maxScore: attempt.max_score,
      accuracy: attempt.accuracy,
      timeTakenSeconds: attempt.time_taken_seconds ?? 0,
      attemptPercentage: computeAttemptPercentage(attempt.score, attempt.max_score),
      avgTimePerQuestionSeconds: computeAverageTimePerQuestionSeconds(attempt.time_taken_seconds ?? 0, attempt.total_questions),
      marksEarned: attempt.marks_earned,
      negativeMarksDeducted: attempt.negative_marks_deducted,
      sectionBreakdown: attempt.section_breakdown?.sections ?? [],
      attemptSource: attempt.attempt_source,
      answerKeyStatus: paperRow?.answer_key_status ?? null,
      isStale: (paperRow?.answer_key_version ?? 0) > attempt.answer_key_version_at_submission,
    },
  };
}

/** Full answer-review shape — correct answers included — only ever
 *  assembled once the attempt's own status is 'submitted' (checked via
 *  the user's own RLS-scoped client above, before the admin client is
 *  ever consulted for the correct-answer fields). */
export async function getAttemptReviewAction(attemptId: string): Promise<{ error?: string; questions: ReviewQuestion[] }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, questions: [] };
  const { supabase, user } = result;

  const { data: attempt, error } = await supabase.from("paper_attempts").select("*").eq("id", attemptId).maybeSingle();
  if (error) return { error: error.message, questions: [] };
  if (!attempt || attempt.user_id !== user.id) return { error: "Attempt not found.", questions: [] };
  if (attempt.status !== "submitted") return { error: "This attempt hasn't been submitted yet.", questions: [] };

  const { data: savedAnswers } = await supabase.from("paper_attempt_answers").select("*").eq("attempt_id", attemptId);
  const answerByQuestion = new Map((savedAnswers ?? []).map((a) => [a.question_id, a]));

  const { questions, options, schemes } = await loadPaperQuestionsForScoring(attempt.paper_id);
  const optionsByQuestion = new Map<string, typeof options>();
  for (const opt of options) {
    const list = optionsByQuestion.get(opt.question_id) ?? [];
    list.push(opt);
    optionsByQuestion.set(opt.question_id, list);
  }
  const defaultScheme = schemes.find((s) => s.section_id === null);
  const schemeBySection = new Map(schemes.filter((s) => s.section_id !== null).map((s) => [s.section_id as string, s]));

  const reviewQuestions: ReviewQuestion[] = questions
    .sort((a, b) => a.question_number - b.question_number)
    .map((q) => {
      const opts = (optionsByQuestion.get(q.id) ?? []).sort((a, b) => a.order_index - b.order_index);
      const correctOption = opts.find((o) => o.is_correct) ?? null;
      const savedAnswer = answerByQuestion.get(q.id);
      const { marks, negativeMarks } = resolveMarks({
        questionMarks: q.marks,
        questionNegativeMarks: q.negative_marks,
        sectionScheme: q.section_id ? schemeBySection.get(q.section_id) ? { correctMarks: schemeBySection.get(q.section_id)!.correct_marks, incorrectMarks: schemeBySection.get(q.section_id)!.incorrect_marks } : undefined : undefined,
        defaultScheme: { correctMarks: defaultScheme?.correct_marks ?? 1, incorrectMarks: defaultScheme?.incorrect_marks ?? 0 },
      });
      return {
        id: q.id,
        sectionId: q.section_id,
        questionNumber: q.question_number,
        questionType: q.question_type,
        prompt: q.prompt,
        promptImageUrl: q.prompt_image_url,
        options: opts.map((o) => ({ id: o.id, label: o.option_label, text: o.option_text })),
        marks,
        negativeMarks,
        correctOptionId: correctOption?.id ?? null,
        correctNumericValue: q.correct_numeric_value,
        explanation: q.explanation,
        userSelectedOptionId: savedAnswer?.selected_option_id ?? null,
        userNumericAnswer: savedAnswer?.numeric_answer ?? null,
        isMarkedForReview: savedAnswer?.is_marked_for_review ?? false,
        isCorrect: savedAnswer?.is_correct ?? null,
        marksAwarded: savedAnswer?.marks_awarded ?? null,
      };
    });

  return { questions: reviewQuestions };
}

/**
 * Cross-attempt performance for ONE paper — "latest score / previous
 * score / improvement / weak-strong sections / accuracy trend" from the
 * phase brief. Reads only the signed-in user's own submitted attempts
 * (RLS-scoped via their session client, same as every other read here) —
 * never another user's data, and honestly returns empty/null fields when
 * there's fewer than two attempts rather than fabricating a trend.
 */
export async function getPaperPerformanceAction(paperId: string): Promise<{ error?: string; history?: PaperPerformanceHistory }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: attempts, error } = await supabase
    .from("paper_attempts")
    .select("*")
    .eq("paper_id", paperId)
    .eq("user_id", user.id)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  if (error) return { error: error.message };

  const points: AttemptHistoryPoint[] = (attempts ?? [])
    .filter((a) => a.submitted_at !== null)
    .map((a) => ({
      attemptId: a.id,
      submittedAt: a.submitted_at as string,
      score: a.score,
      maxScore: a.max_score,
      attemptPercentage: computeAttemptPercentage(a.score, a.max_score),
      accuracy: a.accuracy,
    }));

  const latestAttemptRow = (attempts ?? [])[(attempts ?? []).length - 1] ?? null;
  const history = computePaperPerformanceHistory(points, latestAttemptRow?.section_breakdown ?? null);

  return { history };
}
