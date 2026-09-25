"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cx } from "@/lib/utils";
import { demoMockQuestions } from "@/lib/mock-questions";
import { demoExamCycles, demoCompletedExamCycle } from "@/lib/mock-data";

const allCycles = [...demoExamCycles, demoCompletedExamCycle];
const TEST_DURATION_SECONDS = 10 * 60;

type Phase = "intro" | "in_progress" | "submitted";

export default function MockTestPage({ params }: { params: { examId: string } }) {
  const exam = allCycles.find((e) => e.id === params.examId);
  const [phase, setPhase] = useState<Phase>("intro");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [secondsLeft, setSecondsLeft] = useState(TEST_DURATION_SECONDS);

  useEffect(() => {
    if (phase !== "in_progress") return;
    if (secondsLeft <= 0) {
      setPhase("submitted");
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft]);

  const timeLabel = useMemo(() => {
    const m = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
    const s = (secondsLeft % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [secondsLeft]);

  function startTest() {
    setAnswers({});
    setCurrent(0);
    setSecondsLeft(TEST_DURATION_SECONDS);
    setPhase("in_progress");
  }

  function selectAnswer(qId: string, index: number) {
    setAnswers((a) => ({ ...a, [qId]: index }));
  }

  const score = useMemo(() => {
    let correct = 0, incorrect = 0, unattempted = 0;
    for (const q of demoMockQuestions) {
      const given = answers[q.id];
      if (given === undefined || given === null) unattempted++;
      else if (given === q.correctIndex) correct++;
      else incorrect++;
    }
    return { correct, incorrect, unattempted, total: demoMockQuestions.length };
  }, [answers]);

  if (!exam) {
    return (
      <AppShell title="Mock test" showBack>
        <EmptyState title="Exam not found" description="This mock test isn't available." />
      </AppShell>
    );
  }

  if (phase === "intro") {
    return (
      <AppShell title="Mock test" showBack>
        <DemoBanner label="Sample questions — for preview only" />
        <h1 className="mt-3 text-lg font-semibold text-ink">{exam.shortName} · Mock test</h1>
        <Card className="mt-4 space-y-2 p-4">
          <Row label="Questions" value={`${demoMockQuestions.length}`} />
          <Row label="Duration" value="10 minutes" />
          <Row label="Marking" value={exam.examPattern[0]?.negativeMarking ?? "As per exam pattern"} />
        </Card>
        <p className="mt-4 text-sm text-ink-muted">
          This is a timed practice attempt built from sample questions to demonstrate the format.
          Once submitted, you can review a section-wise breakdown of your attempt.
        </p>
        <Button fullWidth className="mt-6" onClick={startTest}>
          Start test
        </Button>
      </AppShell>
    );
  }

  if (phase === "in_progress") {
    const q = demoMockQuestions[current];
    if (!q) {
      // current is always kept in range by startTest()/Next/Previous, so this
      // only guards the type checker against a theoretical out-of-range
      // index — not a state update mid-render, just a safe empty render.
      return null;
    }
    return (
      <div className="app-shell min-h-screen pb-6">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-paper px-4">
          <Badge tone="brand">{q.section}</Badge>
          <span className={cx("font-display text-lg font-semibold", secondsLeft < 60 ? "text-ineligible-fg" : "text-ink")}>
            {timeLabel}
          </span>
        </header>

        <main className="px-4 pt-5">
          <p className="text-sm text-ink-faint">Question {current + 1} of {demoMockQuestions.length}</p>
          <p className="mt-2 text-[16px] font-medium leading-snug text-ink">{q.prompt}</p>

          <div className="mt-5 space-y-2.5">
            {q.options.map((opt, i) => {
              const selected = answers[q.id] === i;
              return (
                <button
                  key={i}
                  onClick={() => selectAnswer(q.id, i)}
                  className={cx(
                    "w-full rounded border px-4 py-3 text-left text-[15px] transition-colors",
                    selected ? "border-brand-600 bg-brand-50 text-brand-700" : "border-hairline bg-paper-raised text-ink"
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex gap-3">
            <Button
              variant="secondary"
              disabled={current === 0}
              onClick={() => setCurrent((c) => c - 1)}
            >
              Previous
            </Button>
            {current < demoMockQuestions.length - 1 ? (
              <Button fullWidth onClick={() => setCurrent((c) => c + 1)}>
                Next
              </Button>
            ) : (
              <Button fullWidth onClick={() => setPhase("submitted")}>
                Submit test
              </Button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // phase === "submitted"
  const accuracy = score.total > 0 ? Math.round((score.correct / (score.correct + score.incorrect || 1)) * 100) : 0;

  return (
    <AppShell title="Results" showBack>
      <DemoBanner label="Sample attempt — for preview only" />
      <h1 className="mt-3 text-lg font-semibold text-ink">Your attempt</h1>

      <Card className="mt-4 p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="font-display text-2xl font-semibold text-eligible-fg">{score.correct}</p>
            <p className="text-xs text-ink-muted">Correct</p>
          </div>
          <div>
            <p className="font-display text-2xl font-semibold text-ineligible-fg">{score.incorrect}</p>
            <p className="text-xs text-ink-muted">Incorrect</p>
          </div>
          <div>
            <p className="font-display text-2xl font-semibold text-ink-faint">{score.unattempted}</p>
            <p className="text-xs text-ink-muted">Skipped</p>
          </div>
        </div>
      </Card>

      <Card className="mt-3 space-y-2 p-4">
        <Row label="Accuracy" value={`${accuracy}%`} />
        <Row label="Time taken" value={`${Math.floor((TEST_DURATION_SECONDS - secondsLeft) / 60)}m ${(TEST_DURATION_SECONDS - secondsLeft) % 60}s`} />
      </Card>

      <div className="mt-6 flex gap-3">
        <Button variant="secondary" fullWidth onClick={startTest}>
          Retake
        </Button>
        <Button fullWidth onClick={() => (window.location.href = "/preparation")}>
          Back to preparation
        </Button>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
