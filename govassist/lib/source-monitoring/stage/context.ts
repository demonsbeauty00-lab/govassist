// Loads the exams/cycles an update could belong to. One load per checked
// source (not per update). Uses the service-role client passed in by the caller.

import type { createAdminClient } from "@/lib/supabase/admin";
import { CycleCandidate, ExamCandidate } from "./match-cycle";
import { ExistingStageRow } from "./versioning";
import { supabaseStageStore } from "./publish";
import { UpdateType } from "../types";

// The real service-role client type (type-only import: nothing server-only is loaded at runtime).
type AdminClient = ReturnType<typeof createAdminClient>;

export async function loadMatchContext(client: AdminClient, sourceExamId: string | null): Promise<{
  exams: ExamCandidate[];
  cycles: CycleCandidate[];
  loadExisting: (cycleId: string, type: UpdateType) => Promise<ExistingStageRow[]>;
}> {
  let examQuery = client.from("exams").select("id, name, short_name");
  if (sourceExamId) examQuery = examQuery.eq("id", sourceExamId);
  const { data: examRows } = await examQuery.limit(1000);
  const exams: ExamCandidate[] = ((examRows ?? []) as { id: string; name: string; short_name: string }[]).map((e) => ({
    id: e.id, name: e.name, shortName: e.short_name,
  }));

  let cycles: CycleCandidate[] = [];
  if (exams.length > 0) {
    const { data: cycleRows } = await client
      .from("exam_cycles")
      .select("id, exam_id, cycle_label")
      .eq("status", "published")
      .in("exam_id", exams.map((e) => e.id))
      .limit(3000);
    cycles = ((cycleRows ?? []) as { id: string; exam_id: string; cycle_label: string }[]).map((c) => ({
      id: c.id, examId: c.exam_id, cycleLabel: c.cycle_label,
    }));
  }

  const store = supabaseStageStore(client);
  return { exams, cycles, loadExisting: (cycleId, type) => store.listForCycleType(cycleId, type) };
}
