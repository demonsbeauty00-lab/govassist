"use server";

import { requireUser } from "./session";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { buildOfficialUpdateGroups, CycleInfo, CycleUpdateGroup } from "@/lib/stage-updates/present";

const MAX_ROWS = 300;

/**
 * Official stage updates for the exams THIS user follows: saved exams,
 * recorded applications, and assistance requests linked to a cycle. All reads
 * use the signed-in user's own session, so RLS applies: user-owned tables are
 * their own rows only, and stage updates / cycles are the published-only
 * public set.
 */
export async function getMyOfficialUpdatesAction(): Promise<{ error?: string; groups: CycleUpdateGroup[] }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, groups: [] };
  const { supabase, user } = result;

  const [{ data: profile }, { data: applied }, { data: requests }] = await Promise.all([
    supabase.from("profiles").select("saved_exam_slugs").eq("user_id", user.id).maybeSingle(),
    supabase.from("applications").select("exam_cycle_id").eq("user_id", user.id).eq("status", "applied"),
    supabase.from("application_requests").select("exam_cycle_id").eq("user_id", user.id).not("exam_cycle_id", "is", null),
  ]);

  const cycleIds = new Set<string>();
  for (const a of applied ?? []) cycleIds.add(a.exam_cycle_id);
  for (const r of requests ?? []) if (r.exam_cycle_id) cycleIds.add(r.exam_cycle_id);

  const savedSlugs = profile?.saved_exam_slugs ?? [];
  if (savedSlugs.length > 0) {
    const { data: savedExams } = await supabase.from("exams").select("id").in("slug", savedSlugs);
    const examIds = (savedExams ?? []).map((e) => e.id);
    if (examIds.length > 0) {
      const { data: savedCycles } = await supabase.from("exam_cycles").select("id").eq("status", "published").in("exam_id", examIds);
      for (const c of savedCycles ?? []) cycleIds.add(c.id);
    }
  }

  if (cycleIds.size === 0) return { groups: [] };
  const ids = Array.from(cycleIds);

  const [{ data: rows, error }, { data: cycleRows }] = await Promise.all([
    supabase.from("exam_stage_updates").select("*").in("exam_cycle_id", ids).order("published_at", { ascending: false }).limit(MAX_ROWS),
    supabase.from("exam_cycles").select("id, exam_id, cycle_label").in("id", ids),
  ]);
  if (error) return { error: error.message, groups: [] };

  const examIds = Array.from(new Set((cycleRows ?? []).map((c) => c.exam_id)));
  const { data: examRows } = examIds.length > 0 ? await supabase.from("exams").select("id, short_name").in("id", examIds) : { data: [] as { id: string; short_name: string }[] };
  const examName = new Map((examRows ?? []).map((e) => [e.id, e.short_name]));

  const info = new Map<string, CycleInfo>();
  for (const c of cycleRows ?? []) info.set(c.id, { examName: examName.get(c.exam_id) ?? "Exam", cycleLabel: c.cycle_label });

  return { groups: buildOfficialUpdateGroups(rows ?? [], info) };
}
