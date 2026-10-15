import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { EmptyState } from "@/components/ui/EmptyState";
import { BellIcon } from "@/components/ui/Icons";
import { OfficialUpdatesList } from "@/components/updates/OfficialUpdatesList";
import { getMyOfficialUpdatesAction } from "@/lib/actions/stage-updates";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function OfficialUpdatesPage() {
  const result = await getMyOfficialUpdatesAction();

  if (result.error === MISSING_SUPABASE_CONFIG_MESSAGE) {
    return <ConfigErrorScreen message={result.error} />;
  }

  return (
    <AppShell title="Official updates" showBack>
      <p className="mt-3 text-sm text-ink-muted">
        Admit cards, exam dates, answer keys, results and more for the exams you saved or applied to — each with its
        publisher, publication date and official link. Only verified updates appear here.
      </p>

      {result.error ? (
        <p className="mt-4 text-sm text-ineligible-fg">{result.error}</p>
      ) : result.groups.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<BellIcon />}
            title="No official updates yet"
            description="Save an exam or record an application, and verified official updates for it will appear here."
          />
        </div>
      ) : (
        <div className="mt-4">
          <OfficialUpdatesList groups={result.groups} />
        </div>
      )}
    </AppShell>
  );
}
