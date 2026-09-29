import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { EmptyState } from "@/components/ui/EmptyState";
import { ManualAnswerEntryClient } from "@/components/pyq/ManualAnswerEntryClient";
import { startManualAnswerKeyEntryAction } from "@/lib/actions/answer-key";
import { getAttemptAnswersAction } from "@/lib/actions/pyq";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ManualAnswerKeyEntryPage({ params }: { params: { paperId: string } }) {
  const started = await startManualAnswerKeyEntryAction(params.paperId);

  if (started.error === MISSING_SUPABASE_CONFIG_MESSAGE) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  if (started.error || !started.attempt) {
    return (
      <AppShell title="Enter your answers" showBack>
        <div className="mt-4">
          <EmptyState title="Can't start this right now" description={started.error ?? "This paper isn't available."} />
        </div>
      </AppShell>
    );
  }

  const existingAnswers = await getAttemptAnswersAction(started.attempt.attemptId);

  return (
    <AppShell title="Enter your answers" showBack>
      <ManualAnswerEntryClient attempt={started.attempt} initialAnswers={existingAnswers.answers ?? []} />
    </AppShell>
  );
}
