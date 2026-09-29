import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { ResponseSheetUploadClient } from "@/components/pyq/ResponseSheetUploadClient";
import { getResponseSheetUploadsAction } from "@/lib/actions/answer-key";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ResponseSheetUploadPage({ params }: { params: { paperId: string } }) {
  const result = await getResponseSheetUploadsAction(params.paperId);

  if (result.error === MISSING_SUPABASE_CONFIG_MESSAGE) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  return (
    <AppShell title="Upload response sheet" showBack>
      <ResponseSheetUploadClient paperId={params.paperId} initialUploads={result.uploads} />
    </AppShell>
  );
}
