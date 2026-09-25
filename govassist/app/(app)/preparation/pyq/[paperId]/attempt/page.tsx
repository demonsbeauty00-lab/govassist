import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { EmptyState } from "@/components/ui/EmptyState";
import { MockInterfaceClient } from "@/components/pyq/MockInterfaceClient";
import { startAttemptAction, getAttemptAnswersAction } from "@/lib/actions/pyq";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AttemptPage({ params }: { params: { paperId: string } }) {
  const started = await startAttemptAction(params.paperId);

  if (started.error === MISSING_SUPABASE_CONFIG_MESSAGE) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  if (started.error || !started.attempt) {
    return (
      <AppShell title="Mock test" showBack>
        <div className="mt-4">
          <EmptyState title="Can't start this test" description={started.error ?? "This paper isn't available right now."} />
        </div>
      </AppShell>
    );
  }

  const existingAnswers = await getAttemptAnswersAction(started.attempt.attemptId);

  return <MockInterfaceClient attempt={started.attempt} initialAnswers={existingAnswers.answers ?? []} />;
}
