import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AnswerReviewClient } from "@/components/pyq/AnswerReviewClient";
import { RecalculateButton } from "@/components/pyq/RecalculateButton";
import { getAttemptResultAction, getAttemptReviewAction, getPaperPerformanceAction } from "@/lib/actions/pyq";
import { getAnswerKeyInfoAction } from "@/lib/actions/answer-key";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { formatDate } from "@/lib/utils";

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
  const [performanceRes, answerKeyRes] = await Promise.all([
    getPaperPerformanceAction(result.paperId),
    getAnswerKeyInfoAction(result.paperId),
  ]);
  const history = performanceRes.history;
  const answerKeyInfo = answerKeyRes.info;

  const scoreLabel =
    result.answerKeyStatus === "final" ? "Official Score" : result.answerKeyStatus ? "Expected Score" : "Your score";

  return (
    <AppShell title="Result" showBack>
      <h1 className="mt-1 text-lg font-semibold text-ink">{result.paperTitle}</h1>

      {result.answerKeyStatus && (
        <Card className="mt-3 border-brand-300 bg-brand-50 p-3.5">
          <p className="text-sm font-semibold text-brand-700">Calculated from official answer key</p>
          <p className="mt-1 text-xs text-ink-muted">
            Status: <span className="font-medium capitalize">{result.answerKeyStatus}</span>
            {answerKeyInfo?.publishedAt && ` · Published ${formatDate(answerKeyInfo.publishedAt)}`}
          </p>
          {answerKeyInfo?.sourceUrl && (
            <a href={answerKeyInfo.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-brand-600 underline">
              View official source
            </a>
          )}
          {result.answerKeyStatus !== "final" && (
            <p className="mt-1.5 text-xs text-ink-faint">
              This is an {scoreLabel.toLowerCase()}, not a confirmed official result — the answer key may still be revised.
            </p>
          )}
        </Card>
      )}

      {result.isStale && (
        <Card className="mt-3 border-caution-fg/30 bg-caution-bg p-3.5">
          <p className="text-sm font-semibold text-caution-fg">This result may be out of date</p>
          <p className="mt-1 text-xs text-ink-muted">The answer key for this paper has been revised since you submitted this attempt.</p>
          <div className="mt-2">
            <RecalculateButton attemptId={result.attemptId} />
          </div>
        </Card>
      )}

      <Card className="mt-4 p-4">
        <div className="text-center">
          <p className="font-display text-3xl font-semibold text-ink">
            {result.score} <span className="text-lg font-normal text-ink-muted">/ {result.maxScore}</span>
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {scoreLabel}{result.attemptPercentage !== null ? ` · ${result.attemptPercentage}%` : ""}
          </p>
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
        {result.avgTimePerQuestionSeconds !== null && <Row label="Avg. time / question" value={`${result.avgTimePerQuestionSeconds}s`} />}
        {result.marksEarned !== null && result.negativeMarksDeducted !== null && (
          <Row label="Marks" value={`+${result.marksEarned}${result.negativeMarksDeducted > 0 ? ` / -${result.negativeMarksDeducted}` : ""}`} />
        )}
      </Card>

      {result.sectionBreakdown.length > 1 && (
        <>
          <h2 className="mt-6 text-[15px] font-semibold text-ink">Section-wise performance</h2>
          <div className="mt-3 space-y-2">
            {result.sectionBreakdown.map((s) => (
              <Card key={s.sectionId ?? s.sectionName} className="p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">{s.sectionName}</p>
                  <span className="text-sm font-medium text-ink-muted">{s.accuracy !== null ? `${s.accuracy}% accuracy` : "Not attempted"}</span>
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  {s.correct} correct · {s.incorrect} incorrect · {s.unattempted} skipped · {s.score}/{s.maxScore} marks
                </p>
              </Card>
            ))}
          </div>
        </>
      )}

      <h2 className="mt-6 text-[15px] font-semibold text-ink">Your progress on this paper</h2>
      <Card className="mt-3 p-4">
        {performanceRes.error ? (
          <p className="text-sm text-ineligible-fg">{performanceRes.error}</p>
        ) : !history || !history.hasTrend ? (
          <p className="text-sm text-ink-muted">
            {history?.latest
              ? "Attempt this paper again to see your improvement trend — one attempt isn't a trend yet."
              : "No attempts recorded yet."}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-ink-muted">Latest</p>
                <p className="font-display text-lg font-semibold text-ink">{history.latest?.attemptPercentage ?? "—"}%</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Previous</p>
                <p className="font-display text-lg font-semibold text-ink-muted">{history.previous?.attemptPercentage ?? "—"}%</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-muted">Change</p>
                <p
                  className={`font-display text-lg font-semibold ${
                    (history.improvementPercentagePoints ?? 0) >= 0 ? "text-eligible-fg" : "text-ineligible-fg"
                  }`}
                >
                  {history.improvementPercentagePoints !== null
                    ? `${history.improvementPercentagePoints >= 0 ? "+" : ""}${history.improvementPercentagePoints}pp`
                    : "—"}
                </p>
              </div>
            </div>

            {(history.weakSections.length > 0 || history.strongSections.length > 0) && (
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4">
                <div>
                  <p className="text-xs font-medium text-ink-muted">Weak sections</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {history.weakSections.map((s) => (
                      <Badge key={s.sectionName} tone="negative">
                        {s.sectionName} · {s.accuracy}%
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-ink-muted">Strong sections</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {history.strongSections.map((s) => (
                      <Badge key={s.sectionName} tone="positive">
                        {s.sectionName} · {s.accuracy}%
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-hairline pt-3">
              <p className="text-xs font-medium text-ink-muted">Accuracy trend</p>
              <div className="mt-1.5 space-y-1">
                {history.attempts.map((a, i) => (
                  <div key={a.attemptId} className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">
                      Attempt {i + 1} · {formatDate(a.submittedAt)}
                    </span>
                    <span className="font-medium text-ink">{a.accuracy !== null ? `${a.accuracy}%` : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
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
