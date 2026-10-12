import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { RequestDetailClient } from "@/components/application-requests/RequestDetailClient";
import { getMyRequestAction } from "@/lib/actions/application-requests";
import { createClient } from "@/lib/supabase/server";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ApplicationRequestDetailPage({ params }: { params: { requestId: string } }) {
  const supabase = await createClient();
  if (!supabase) return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;

  const detail = await getMyRequestAction(params.requestId);
  if (!detail) notFound();

  return (
    <AppShell title="Request details" showBack>
      <RequestDetailClient detail={detail} />
    </AppShell>
  );
}
