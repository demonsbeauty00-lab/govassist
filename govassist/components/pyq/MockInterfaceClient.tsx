"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/lib/utils";
import { AttemptAnswerInput, AttemptState } from "@/lib/pyq/types";
import { saveAttemptAnswerAction, submitAttemptAction } from "@/lib/actions/pyq";

type AnswerMap = Record<string, AttemptAnswerInput>;

function emptyAnswer(questionId: string): AttemptAnswerInput {
  return { questionId, selectedOptionId: null, numericAnswer: null, isMarkedForReview: false };
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export function MockInterfaceClient({ attempt, initialAnswers }: { attempt: AttemptState; initialAnswers: AttemptAnswerInput[] }) {
  const router = useRouter();
  const { questions } = attempt;

  const [answers, setAnswers] = useState<AnswerMap>(() => {
    const map: AnswerMap = {};
    for (const q of questions) map[q.id] = emptyAnswer(q.id);
    for (const a of initialAnswers) map[a.questionId] = a;
    return map;
  });
  const [visited, setVisited] = useState<Set<string>>(() => new Set(initialAnswers.filter((a) => a.selectedOptionId || a.numericAnswer).map((a) => a.questionId)));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startedAtMs = useMemo(() => new Date(attempt.startedAt).getTime(), [attempt.startedAt]);
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
    return Math.max(0, attempt.durationSeconds - elapsed);
  });

  const submittingRef = useRef(false);

  const doSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const current = questions[currentIndex];
    if (current) {
      await saveAttemptAnswerAction(attempt.attemptId, answers[current.id] ?? emptyAnswer(current.id));
    }
    const result = await submitAttemptAction(attempt.attemptId);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      submittingRef.current = false;
      return;
    }
    router.push(`/preparation/pyq/attempts/${attempt.attemptId}`);
  }, [answers, attempt.attemptId, currentIndex, questions, router]);

  // Timer — ticks every second, auto-submits at zero. Deliberately a
  // wall-clock computation from startedAt (not a plain decrementing
  // counter) so a backgrounded tab that throttles setInterval still
  // catches up to the correct remaining time instead of running long.
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
      const left = Math.max(0, attempt.durationSeconds - elapsed);
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(interval);
        doSubmit();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAtMs, attempt.durationSeconds, doSubmit]);

  const current = questions[currentIndex];

  // A getter, never a raw index — `answers` is seeded with every question
  // id up front (see the useState initializer above), so this invariant
  // always holds at runtime, but TypeScript's noUncheckedIndexedAccess
  // can't know that from a bare `answers[id]` read; this keeps every call
  // site's type as plain AttemptAnswerInput instead of `| undefined`.
  function getAnswer(questionId: string): AttemptAnswerInput {
    return answers[questionId] ?? emptyAnswer(questionId);
  }

  function updateCurrentAnswer(patch: Partial<AttemptAnswerInput>) {
    if (!current) return;
    const currentId = current.id;
    setAnswers((prev) => ({ ...prev, [currentId]: { ...(prev[currentId] ?? emptyAnswer(currentId)), ...patch } }));
  }

  async function persist(questionId: string, answer: AttemptAnswerInput) {
    setSaving(true);
    setError(null);
    const result = await saveAttemptAnswerAction(attempt.attemptId, answer);
    setSaving(false);
    if (result.error) setError(result.error);
  }

  function goTo(index: number) {
    if (!current) return;
    setVisited((v) => new Set(v).add(current.id));
    setCurrentIndex(Math.max(0, Math.min(questions.length - 1, index)));
  }

  async function handleSaveAndNext() {
    if (!current) return;
    await persist(current.id, getAnswer(current.id));
    setVisited((v) => new Set(v).add(current.id));
    goTo(currentIndex + 1);
  }

  async function handleMarkForReview() {
    if (!current) return;
    const next: AttemptAnswerInput = { ...getAnswer(current.id), isMarkedForReview: true };
    const currentId = current.id;
    setAnswers((prev) => ({ ...prev, [currentId]: next }));
    await persist(current.id, next);
    setVisited((v) => new Set(v).add(current.id));
    goTo(currentIndex + 1);
  }

  async function handleClearResponse() {
    if (!current) return;
    const next: AttemptAnswerInput = { questionId: current.id, selectedOptionId: null, numericAnswer: null, isMarkedForReview: getAnswer(current.id).isMarkedForReview };
    const currentId = current.id;
    setAnswers((prev) => ({ ...prev, [currentId]: next }));
    await persist(current.id, next);
  }

  async function handlePrevious() {
    if (!current) return;
    await persist(current.id, getAnswer(current.id));
    goTo(currentIndex - 1);
  }

  function statusFor(questionId: string): "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked" {
    const a = answers[questionId];
    const hasAnswer = !!(a?.selectedOptionId || (a?.numericAnswer && a.numericAnswer.trim().length > 0));
    if (a?.isMarkedForReview) return hasAnswer ? "answered_marked" : "marked";
    if (!visited.has(questionId)) return "not_visited";
    return hasAnswer ? "answered" : "not_answered";
  }

  const summary = useMemo(() => {
    let answeredCount = 0,
      markedCount = 0,
      notAnsweredCount = 0,
      notVisitedCount = 0;
    for (const q of questions) {
      const status = statusFor(q.id);
      if (status === "answered") answeredCount++;
      else if (status === "answered_marked") {
        answeredCount++;
        markedCount++;
      } else if (status === "marked") markedCount++;
      else if (status === "not_answered") notAnsweredCount++;
      else notVisitedCount++;
    }
    return { answeredCount, markedCount, notAnsweredCount, notVisitedCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, visited, questions]);

  if (!current) return null;

  const isLowTime = secondsLeft < 60;

  return (
    <div className="app-shell min-h-screen pb-28">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-hairline bg-paper px-4">
        <Badge tone="brand">Q{currentIndex + 1}</Badge>
        <span className={cx("font-display text-lg font-semibold tabular-nums", isLowTime ? "text-ineligible-fg" : "text-ink")}>
          {formatTime(secondsLeft)}
        </span>
        <button
          onClick={() => setPaletteOpen(true)}
          className="tap-target rounded border border-hairline px-3 py-1.5 text-xs font-medium text-ink"
        >
          Questions ({currentIndex + 1}/{questions.length})
        </button>
      </header>

      <main className="px-4 pt-5">
        <p className="text-sm text-ink-faint">
          Question {currentIndex + 1} of {questions.length}
          {saving && <span className="ml-2 text-ink-faint">· saving…</span>}
        </p>
        <p className="mt-2 whitespace-pre-line text-[16px] font-medium leading-snug text-ink">{current.prompt}</p>

        {current.questionType === "numerical" ? (
          <input
            value={answers[current.id]?.numericAnswer ?? ""}
            onChange={(e) => updateCurrentAnswer({ numericAnswer: e.target.value })}
            placeholder="Enter your answer"
            inputMode="decimal"
            className="mt-5 h-12 w-full rounded border border-hairline bg-paper-raised px-4 text-[15px] text-ink"
          />
        ) : (
          <div className="mt-5 space-y-2.5">
            {current.options.map((opt) => {
              const selected = answers[current.id]?.selectedOptionId === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => updateCurrentAnswer({ selectedOptionId: opt.id })}
                  className={cx(
                    "flex w-full items-center gap-3 rounded border px-4 py-3 text-left text-[15px] transition-colors",
                    selected ? "border-brand-600 bg-brand-50 text-brand-700" : "border-hairline bg-paper-raised text-ink"
                  )}
                >
                  <span
                    className={cx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      selected ? "border-brand-600 bg-brand-600 text-white" : "border-hairline text-ink-muted"
                    )}
                  >
                    {opt.label}
                  </span>
                  <span>{opt.text}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-ineligible-fg">{error}</p>}
      </main>

      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-app -translate-x-1/2 border-t border-hairline bg-paper-raised px-4 pb-[env(safe-area-inset-bottom)] pt-2.5">
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleClearResponse}>
            Clear
          </Button>
          <Button variant="secondary" size="sm" onClick={handleMarkForReview} className="flex-1">
            Mark for review
          </Button>
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" size="sm" disabled={currentIndex === 0} onClick={handlePrevious}>
            Previous
          </Button>
          {currentIndex < questions.length - 1 ? (
            <Button size="sm" fullWidth onClick={handleSaveAndNext}>
              Save &amp; Next
            </Button>
          ) : (
            <Button size="sm" fullWidth onClick={() => setConfirmSubmit(true)}>
              Submit test
            </Button>
          )}
        </div>
      </div>

      {paletteOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setPaletteOpen(false)}>
          <div className="w-full max-w-app rounded-t-lg bg-paper-raised p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-ink">Question palette</p>
              <button onClick={() => setPaletteOpen(false)} className="tap-target text-sm text-ink-muted">
                Close
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-ink-muted">
              <LegendItem tone="bg-eligible-bg text-eligible-fg" label={`Answered (${summary.answeredCount})`} />
              <LegendItem tone="bg-ineligible-bg text-ineligible-fg" label={`Not answered (${summary.notAnsweredCount})`} />
              <LegendItem tone="bg-brand-100 text-brand-700" label={`Marked (${summary.markedCount})`} />
              <LegendItem tone="bg-paper-sunk text-ink-faint" label={`Not visited (${summary.notVisitedCount})`} />
            </div>

            <div className="mt-4 grid max-h-64 grid-cols-6 gap-2 overflow-y-auto">
              {questions.map((q, i) => {
                const status = statusFor(q.id);
                const toneClass = {
                  not_visited: "bg-paper-sunk text-ink-faint border-hairline",
                  not_answered: "bg-ineligible-bg text-ineligible-fg border-transparent",
                  answered: "bg-eligible-bg text-eligible-fg border-transparent",
                  marked: "bg-brand-100 text-brand-700 border-transparent",
                  answered_marked: "bg-brand-100 text-brand-700 border-2 border-eligible-fg",
                }[status];
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setPaletteOpen(false);
                      goTo(i);
                    }}
                    className={cx("tap-target h-9 rounded border text-sm font-medium", toneClass, i === currentIndex && "ring-2 ring-brand-600")}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <Button fullWidth className="mt-4" onClick={() => setConfirmSubmit(true)}>
              Submit test
            </Button>
          </div>
        </div>
      )}

      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm rounded-lg bg-paper-raised p-5">
            <p className="font-semibold text-ink">Submit test?</p>
            <p className="mt-1.5 text-sm text-ink-muted">
              You've answered {summary.answeredCount} of {questions.length} questions, with {summary.markedCount} marked for review. This can't be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => setConfirmSubmit(false)} disabled={submitting}>
                Go back
              </Button>
              <Button fullWidth onClick={doSubmit} isLoading={submitting}>
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItem({ tone, label }: { tone: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cx("h-3 w-3 shrink-0 rounded-sm", tone)} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
