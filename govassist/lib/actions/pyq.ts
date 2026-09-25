"use server";

import { requireUser } from "./session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { paperRowToDetail, paperRowToSummary } from "@/lib/pyq/from-db-row";
import { resolveMarks, scoreAttempt, ScoringAnswer, ScoringQuestion } from "@/lib/pyq/scoring";
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
  const [{ data: questions }, { data: options }, { data: schemes }] = await Promise.all([
    admin.from("questions").select("*").eq("paper_id", paperId).eq("status", "published").order("question_number", { ascending: true }),
    admin.from("question_options").select("*"),
    admin.from("marking_schemes").select("*").eq("paper_id", paperId),
  ]);
  return { questions: questions ?? [], options: options ?? [], schemes: schemes ?? [] };
}

export async function startAttemptAction(paperId: string): Promise<{ error?: string; attempt?: AttemptState }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: paperRow, error: paperError } = await supabase.from("papers").select("*").eq("id", paperId).eq("status", "published").maybeSingle();
  if (paperError) return { error: paperError.message };
  if (!paperRow) return { error: "This paper isn't available." };

  // Resume an existing in-progress attempt instead of starting a fresh one
  // — otherwise a page refresh mid-test would silently discard progress.
  const { data: existing } = await supabase
    .from("paper_attempts")
    .select("*")
    .eq("paper_id", paperId)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const admin = createAdminClient();
  const { data: questionRows } = await admin
    .from("questions")
    .select("*")
    .eq("paper_id", paperId)
    .eq("status", "published")
    .order("question_number", { ascending: true });
  const { data: optionRows } = await admin.from("question_options").select("*");
  const { data: schemeRows } = await admin.from("marking_schemes").select("*").eq("paper_id", paperId);

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

  const { data: paperRow } = await supabase.from("papers").select("title").eq("id", attempt.paper_id).maybeSingle();
  const { questions, options, schemes } = await loadPaperQuestionsForScoring(attempt.paper_id);
  const { data: savedAnswers } = await supabase.from("paper_attempt_answers").select("*").eq("attempt_id", attemptId);

  const optionsByQuestion = new Map<string, typeof options>();
  for (const opt of options) {
    const list = optionsByQuestion.get(opt.question_id) ?? [];
    list.push(opt);
    optionsByQuestion.set(opt.question_id, list);
  }
  const defaultScheme = schemes.find((s) => s.section_id === null);
  const schemeBySection = new Map(schemes.filter((s) => s.section_id !== null).map((s) => [s.section_id as string, s]));

  const scoringQuestions: ScoringQuestion[] = questions.map((q) => {
    const correctOption = (optionsByQuestion.get(q.id) ?? []).find((o) => o.is_correct) ?? null;
    const { marks, negativeMarks } = resolveMarks({
      questionMarks: q.marks,
      questionNegativeMarks: q.negative_marks,
      sectionScheme: q.section_id ? schemeBySection.get(q.section_id) ? { correctMarks: schemeBySection.get(q.section_id)!.correct_marks, incorrectMarks: schemeBySection.get(q.section_id)!.incorrect_marks } : undefined : undefined,
      defaultScheme: { correctMarks: defaultScheme?.correct_marks ?? 1, incorrectMarks: defaultScheme?.incorrect_marks ?? 0 },
    });
    return { id: q.id, correctOptionId: correctOption?.id ?? null, correctNumericValue: q.correct_numeric_value, marks, negativeMarks };
  });

  const scoringAnswers: ScoringAnswer[] = (savedAnswers ?? []).map((a) => ({
    questionId: a.question_id,
    selectedOptionId: a.selected_option_id,
    numericAnswer: a.numeric_answer,
  }));

  const outcome = scoreAttempt(scoringQuestions, scoringAnswers);

  // Persist per-answer grading — only for answers that exist; unattempted
  // questions correctly have no row and don't need one.
  for (const a of savedAnswers ?? []) {
    const graded = outcome.perQuestion[a.question_id];
    if (!graded) continue;
    await supabase
      .from("paper_attempt_answers")
      .update({ is_correct: graded.isCorrect, marks_awarded: graded.marksAwarded })
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
      attempted_count: outcome.attemptedCount,
      marked_for_review_count: markedForReviewCount,
      correct_count: outcome.correctCount,
      incorrect_count: outcome.incorrectCount,
      unattempted_count: outcome.unattemptedCount,
      score: outcome.score,
      accuracy: outcome.accuracy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attemptId);

  if (updateError) return { error: updateError.message };

  return {
    result: {
      attemptId,
      paperId: attempt.paper_id,
      paperTitle: paperRow?.title ?? "Mock test",
      totalQuestions: questions.length,
      attemptedCount: outcome.attemptedCount,
      markedForReviewCount,
      correctCount: outcome.correctCount,
      incorrectCount: outcome.incorrectCount,
      unattemptedCount: outcome.unattemptedCount,
      score: outcome.score,
      maxScore: attempt.max_score,
      accuracy: outcome.accuracy,
      timeTakenSeconds,
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

  const { data: paperRow } = await supabase.from("papers").select("title").eq("id", attempt.paper_id).maybeSingle();

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
