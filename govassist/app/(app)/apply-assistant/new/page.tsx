import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { RequestForm } from "@/components/application-requests/RequestForm";
import { getProfileWithEducation } from "@/lib/actions/profile";
import { demoExamCycles } from "@/lib/mock-data";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewApplicationRequestPage() {
  const { configError, profile } = await getProfileWithEducation();
  if (configError) return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;

  const supabase = await createClient();
  let cycles: { id: string; label: string; endDate: string | null }[] = [];
  let vaultDocs: { id: string; name: string }[] = [];
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    // Only PUBLISHED cycles are offered; names come from the database.
    const { data: cycleRows } = await supabase
      .from("exam_cycles").select("id, exam_id, cycle_label, application_end_date").eq("status", "published").limit(200);
    const examIds = Array.from(new Set((cycleRows ?? []).map((c) => c.exam_id)));
    const { data: examRows } = examIds.length
      ? await supabase.from("exams").select("id, short_name").in("id", examIds)
      : { data: [] as { id: string; short_name: string }[] };
    const examName = new Map((examRows ?? []).map((e) => [e.id, e.short_name]));
    cycles = (cycleRows ?? []).map((c) => ({
      id: c.id, label: `${examName.get(c.exam_id) ?? "Exam"} — ${c.cycle_label}`, endDate: c.application_end_date,
    }));
    if (user) {
      const { data: docs } = await supabase
        .from("documents").select("id, document_type, file_name, storage_path").eq("user_id", user.id);
      vaultDocs = (docs ?? [])
        .filter((d) => !!d.storage_path)
        .map((d) => ({ id: d.id, name: d.file_name ?? d.document_type.replace(/_/g, " ") }));
    }
  }

  const exams = demoExamCycles.map((e) => ({ id: e.id, shortName: e.shortName }));
  return (
    <AppShell title="New request" showBack>
      <RequestForm exams={exams} cycles={cycles} vaultDocs={vaultDocs} defaultName={profile?.full_name ?? ""} />
    </AppShell>
  );
}
