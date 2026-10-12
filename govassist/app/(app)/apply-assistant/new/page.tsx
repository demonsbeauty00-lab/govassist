import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { RequestForm } from "@/components/application-requests/RequestForm";
import { getProfileWithEducation } from "@/lib/actions/profile";
import { demoExamCycles } from "@/lib/mock-data";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function NewApplicationRequestPage() {
  const { configError, profile } = await getProfileWithEducation();
  if (configError) return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;

  const exams = demoExamCycles.map((e) => ({ id: e.id, shortName: e.shortName }));
  return (
    <AppShell title="New request" showBack>
      <RequestForm exams={exams} defaultName={profile?.full_name ?? ""} />
    </AppShell>
  );
}
