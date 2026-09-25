"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/lib/utils";
import { ReviewQuestion } from "@/lib/pyq/types";

function statusBadge(q: ReviewQuestion) {
  if (q.isCorrect === true) return <Badge tone="positive">Correct</Badge>;
  if (q.isCorrect === false) return <Badge tone="negative">Incorrect</Badge>;
  return <Badge tone="neutral">Not attempted</Badge>;
}

function QuestionReviewCard({ q, index }: { q: ReviewQuestion; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm text-ink-faint">Q{index + 1}</p>
          <p className="mt-0.5 line-clamp-2 text-[15px] font-medium text-ink">{q.prompt}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {statusBadge(q)}
          {q.isMarkedForReview && <Badge tone="brand">Marked</Badge>}
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-2.5 border-t border-hairline pt-3">
          {q.questionType === "numerical" ? (
            <>
              <AnswerRow label="Your answer" value={q.userNumericAnswer ?? "—"} tone={q.isCorrect} />
              <AnswerRow label="Correct answer" value={q.correctNumericValue ?? "—"} tone="correct" />
            </>
          ) : (
            <div className="space-y-1.5">
              {q.options.map((opt) => {
                const isCorrectOpt = opt.id === q.correctOptionId;
                const isUserOpt = opt.id === q.userSelectedOptionId;
                return (
                  <div
                    key={opt.id}
                    className={cx(
                      "flex items-center gap-2 rounded border px-3 py-2 text-sm",
                      isCorrectOpt ? "border-eligible-fg bg-eligible-bg text-eligible-fg" : isUserOpt ? "border-ineligible-fg bg-ineligible-bg text-ineligible-fg" : "border-hairline text-ink"
                    )}
                  >
                    <span className="font-semibold">{opt.label}.</span>
                    <span className="flex-1">{opt.text}</span>
                    {isCorrectOpt && <span className="text-xs font-medium">Correct</span>}
                    {isUserOpt && !isCorrectOpt && <span className="text-xs font-medium">Your answer</span>}
                  </div>
                );
              })}
            </div>
          )}

          {q.explanation && (
            <div className="rounded bg-paper-sunk p-3 text-sm text-ink-muted">
              <p className="font-medium text-ink">Explanation</p>
              <p className="mt-1">{q.explanation}</p>
            </div>
          )}

          <p className="text-xs text-ink-faint">
            Marks: +{q.marks}{q.negativeMarks > 0 ? ` / -${q.negativeMarks}` : ""} · Awarded: {q.marksAwarded ?? 0}
          </p>
        </div>
      )}
    </Card>
  );
}

function AnswerRow({ label, value, tone }: { label: string; value: string; tone: boolean | null | "correct" }) {
  const toneClass = tone === "correct" || tone === true ? "text-eligible-fg" : tone === false ? "text-ineligible-fg" : "text-ink";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className={cx("font-medium", toneClass)}>{value}</span>
    </div>
  );
}

export function AnswerReviewClient({ questions }: { questions: ReviewQuestion[] }) {
  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <QuestionReviewCard key={q.id} q={q} index={i} />
      ))}
    </div>
  );
}
