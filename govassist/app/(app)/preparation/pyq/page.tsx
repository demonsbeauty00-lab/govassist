import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { PyqLibraryClient } from "@/components/pyq/PyqLibraryClient";
import { listPublishedPapersAction } from "@/lib/actions/pyq";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function PyqLibraryPage() {
  const result = await listPublishedPapersAction();

  if (result.error === MISSING_SUPABASE_CONFIG_MESSAGE) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  return (
    <AppShell title="Previous year papers" showBack>
      <p className="mt-1 text-sm text-ink-muted">
        Verified previous year papers, converted into timed mock tests with a real question palette, marking
        scheme, and a full answer review after you submit.
      </p>

      {result.error ? (
        <p className="mt-6 text-sm text-ineligible-fg">{result.error}</p>
      ) : (
        <div className="mt-4">
          <PyqLibraryClient papers={result.papers} />
        </div>
      )}
    </AppShell>
  );
}
