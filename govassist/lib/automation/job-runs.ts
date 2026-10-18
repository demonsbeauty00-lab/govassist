import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
export type JobName = "check_sources" | "check_pyq_sources";

/** Records that a scheduled run started. Best-effort: bookkeeping must never stop the job. */
export async function startJobRun(admin: Admin, job: JobName): Promise<string | null> {
  try {
    const { data } = await admin.from("automation_job_runs").insert({ job }).select("id").single();
    return (data as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

export async function finishJobRun(admin: Admin, id: string | null, ok: boolean, summary: Record<string, unknown>): Promise<void> {
  if (!id) return;
  try {
    await admin.from("automation_job_runs").update({ finished_at: new Date().toISOString(), ok, summary }).eq("id", id);
  } catch {
    // ignore
  }
}
