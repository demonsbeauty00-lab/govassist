import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AnswerReviewClient } from "@/components/pyq/AnswerReviewClient";
import { getAttemptResultAction, getAttemptReviewAction } from "@/lib/actions/pyq";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AttemptResultPage({ params }: { params: { attemptId: string } }) {
  const [resultRes, reviewRes] = await Promise.all([
    getAttemptResultAction(params.attemptId),
    getAttemptReviewAction(params.attemptId),
  ]);

  if (resultRes.error === MISSING_SUPABASE_CONFIG_MESSAGE) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  if (resultRes.error || !resultRes.result) {
    return (
      <AppShell title="Result" showBack>
        <div className="mt-4">
          <EmptyState title="Result not available" description={resultRes.error ?? "This attempt could not be found."} />
        </div>
      </AppShell>
    );
  }

  const result = resultRes.result;

  return (
    <AppShell title="Result" showBack>
      <h1 className="mt-1 text-lg font-semibold text-ink">{result.paperTitle}</h1>

      <Card className="mt-4 p-4">
        <div className="text-center">
          <p className="font-display text-3xl font-semibold text-ink">
            {result.score} <span className="text-lg font-normal text-ink-muted">/ {result.maxScore}</span>
          </p>
          <p className="mt-1 text-sm text-ink-muted">Your score</p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-hairline pt-4 text-center">
          <div>
            <p className="font-display text-xl font-semibold text-eligible-fg">{result.correctCount}</p>
            <p className="text-xs text-ink-muted">Correct</p>
          </div>
          <div>
            <p className="font-display text-xl font-semibold text-ineligible-fg">{result.incorrectCount}</p>
            <p className="text-xs text-ink-muted">Incorrect</p>
          </div>
          <div>
            <p className="font-display text-xl font-semibold text-ink-faint">{result.unattemptedCount}</p>
            <p className="text-xs text-ink-muted">Skipped</p>
          </div>
        </div>
      </Card>

      <Card className="mt-3 space-y-2 p-4">
        <Row label="Accuracy" value={result.accuracy !== null ? `${result.accuracy}%` : "—"} />
        <Row label="Attempted" value={`${result.attemptedCount} / ${result.totalQuestions}`} />
        <Row label="Marked for review" value={`${result.markedForReviewCount}`} />
        <Row label="Time taken" value={`${Math.floor(result.timeTakenSeconds / 60)}m ${result.timeTakenSeconds % 60}s`} />
      </Card>

      <Link href={`/preparation/pyq/${result.paperId}`}>
        <Button variant="secondary" fullWidth className="mt-4">
          Back to paper
        </Button>
      </Link>

      <h2 className="mt-8 text-[15px] font-semibold text-ink">Answer review</h2>
      <p className="mt-1 text-sm text-ink-muted">Tap a question to see the correct answer and explanation.</p>
      <div className="mt-3">
        {reviewRes.error ? (
          <p className="text-sm text-ineligible-fg">{reviewRes.error}</p>
        ) : (
          <AnswerReviewClient questions={reviewRes.questions} />
        )}
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
