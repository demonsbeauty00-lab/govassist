"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx } from "@/lib/utils";
import { AttemptAnswerInput, AttemptState } from "@/lib/pyq/types";
import { saveAttemptAnswerAction, submitAttemptAction } from "@/lib/actions/pyq";

export function ManualAnswerEntryClient({ attempt, initialAnswers }: { attempt: AttemptState; initialAnswers: AttemptAnswerInput[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, AttemptAnswerInput>>(() => {
    const map: Record<string, AttemptAnswerInput> = {};
    for (const q of attempt.questions) map[q.id] = { questionId: q.id, selectedOptionId: null, numericAnswer: null, isMarkedForReview: false };
    for (const a of initialAnswers) map[a.questionId] = a;
    return map;
  });
  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function getAnswer(questionId: string): AttemptAnswerInput {
    return answers[questionId] ?? { questionId, selectedOptionId: null, numericAnswer: null, isMarkedForReview: false };
  }

  function selectOption(questionId: string, optionId: string) {
    const next = { ...getAnswer(questionId), selectedOptionId: optionId };
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
    saveAttemptAnswerAction(attempt.attemptId, next);
  }

  function setNumeric(questionId: string, value: string) {
    const next = { ...getAnswer(questionId), numericAnswer: value };
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
    saveAttemptAnswerAction(attempt.attemptId, next);
  }

  const answeredCount = Object.values(answers).filter((a) => a.selectedOptionId || (a.numericAnswer && a.numericAnswer.trim())).length;

  function handleSubmit() {
    setError(null);
    startSubmit(async () => {
      const result = await submitAttemptAction(attempt.attemptId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/preparation/pyq/attempts/${attempt.attemptId}`);
    });
  }

  return (
    <div className="pb-28">
      <p className="text-sm text-ink-muted">
        Select the answer you actually gave in the real exam for each question. {answeredCount} of {attempt.questions.length} answered.
      </p>

      <div className="mt-4 space-y-4">
        {attempt.questions.map((q, i) => (
          <Card key={q.id} className="p-4">
            <p className="text-sm text-ink-faint">Q{i + 1}</p>
            <p className="mt-1 whitespace-pre-line text-[15px] font-medium text-ink">{q.prompt}</p>

            {q.questionType === "numerical" ? (
              <input
                value={answers[q.id]?.numericAnswer ?? ""}
                onChange={(e) => setNumeric(q.id, e.target.value)}
                placeholder="Your answer"
                inputMode="decimal"
                className="mt-3 h-11 w-full rounded border border-hairline bg-paper-raised px-3 text-[15px] text-ink"
              />
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {q.options.map((opt) => {
                  const selected = answers[q.id]?.selectedOptionId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => selectOption(q.id, opt.id)}
                      className={cx(
                        "rounded border px-3 py-2 text-left text-sm",
                        selected ? "border-brand-600 bg-brand-50 text-brand-700" : "border-hairline text-ink"
                      )}
                    >
                      <span className="font-semibold">{opt.label}.</span> {opt.text}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-ineligible-fg">{error}</p>}

      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-app -translate-x-1/2 border-t border-hairline bg-paper-raised px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:max-w-none md:pl-64">
        <div className="md:mx-auto md:max-w-5xl md:px-8">
          <Button fullWidth onClick={handleSubmit} isLoading={submitting}>
            Calculate my score
          </Button>
        </div>
      </div>
    </div>
  );
}
