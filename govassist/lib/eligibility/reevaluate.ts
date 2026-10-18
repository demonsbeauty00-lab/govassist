import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { examCycleRowToRules } from "./from-db-row";
import { profileToApplicant } from "./from-profile";
import { profileFingerprint } from "./fingerprint";
import { notifyEligibilityChanges } from "@/lib/notifications/eligibility-change";
import { buildCycleInput, isCorrigendumPending, planResultRow, type CycleInput, type ExistingResult, type ResultRow } from "./plan";

// ---------------------------------------------------------------------------
// Automatic re-evaluation of REAL (published) exam cycles with the existing
// pure engine. Three entry points:
//   reevaluateUser(userId)   a profile / education changed
//   reevaluateCycle(cycleId) a cycle was added/updated/corrigendum published
//   sweepEligibility()       daily safety net: finds cycles whose rules (or
//                            corrigendum state) differ from what was last
//                            evaluated — covers rule edits made in the
//                            database and new cycles created by any means.
// All are idempotent: fingerprints make a repeat run write nothing.
// Service-role client: it must read every user's profile for a cycle change
// and write result rows that users themselves have no policy to write.
// ---------------------------------------------------------------------------

type Admin = ReturnType<typeof createAdminClient>;

const PAGE_SIZE = 500;
const MAX_CYCLES_PER_USER_RUN = 500;
const MAX_CYCLES_PER_SWEEP = 10;
const UPSERT_CHUNK = 200;

/** Published cycles (optionally only some ids) with rules + corrigendum state. */
export async function loadPublishedCycles(admin: Admin, ids?: string[]): Promise<CycleInput[]> {
  let q = admin.from("exam_cycles").select("*").eq("status", "published").limit(MAX_CYCLES_PER_USER_RUN);
  if (ids) q = q.in("id", ids);
  const { data: cycles, error } = await q;
  if (error) throw new Error("couldn't load exam cycles");
  if (!cycles || cycles.length === 0) return [];

  const examIds = Array.from(new Set(cycles.map((c) => c.exam_id)));
  const { data: exams } = await admin.from("exams").select("id, state").in("id", examIds);
  const stateByExam = new Map((exams ?? []).map((e) => [e.id, e.state]));

  const { data: corrigenda } = await admin
    .from("detected_updates")
    .select("exam_cycle_id, processed_at")
    .eq("update_type", "corrigendum")
    .eq("status", "published")
    .in("exam_cycle_id", cycles.map((c) => c.id));
  const byCycle = new Map<string, (string | null)[]>();
  for (const row of corrigenda ?? []) {
    if (!row.exam_cycle_id) continue;
    byCycle.set(row.exam_cycle_id, [...(byCycle.get(row.exam_cycle_id) ?? []), row.processed_at]);
  }

  return cycles.map((c) =>
    buildCycleInput(c.id, examCycleRowToRules(c, stateByExam.get(c.exam_id) ?? null), {
      corrigendumPending: isCorrigendumPending(c.last_verified_date, byCycle.get(c.id) ?? []),
    }));
}

async function upsertRows(admin: Admin, rows: ResultRow[]): Promise<boolean> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await admin
      .from("exam_eligibility_results")
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "user_id,exam_cycle_id" });
    if (error) {
      console.error("eligibility: upsert failed", error.code);
      return false;
    }
  }
  return true;
}

export interface UserReevalResult { skipped?: "no_profile" | "onboarding_incomplete"; evaluated: number; written: number; removed: number }

export async function reevaluateUser(userId: string, client?: Admin): Promise<UserReevalResult> {
  const admin = client ?? createAdminClient();
  const [{ data: profile }, { data: education }] = await Promise.all([
    admin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("education").select("*").eq("user_id", userId),
  ]);
  if (!profile) return { skipped: "no_profile", evaluated: 0, written: 0, removed: 0 };
  if (!profile.onboarding_completed_at) return { skipped: "onboarding_incomplete", evaluated: 0, written: 0, removed: 0 };

  const applicant = profileToApplicant(profile, education ?? []);
  const profileFp = profileFingerprint(applicant);
  const cycles = await loadPublishedCycles(admin);
  const { data: existingRows } = await admin.from("exam_eligibility_results").select("*").eq("user_id", userId);
  const existing = new Map((existingRows ?? []).map((r) => [r.exam_cycle_id, r as ExistingResult]));

  const rows: ResultRow[] = [];
  for (const cycle of cycles) {
    const row = planResultRow({ userId, profile: applicant, profileFp, cycle, existing: existing.get(cycle.id) });
    if (row) rows.push(row);
  }
  const ok = rows.length === 0 || (await upsertRows(admin, rows));
  if (ok && rows.length > 0) await notifyEligibilityChanges(admin, rows);

  // Results for cycles that are no longer published are removed.
  const live = new Set(cycles.map((c) => c.id));
  const stale = (existingRows ?? []).map((r) => r.exam_cycle_id).filter((id) => !live.has(id));
  if (stale.length > 0) await admin.from("exam_eligibility_results").delete().eq("user_id", userId).in("exam_cycle_id", stale);

  return { evaluated: cycles.length, written: ok ? rows.length : 0, removed: stale.length };
}

export interface CycleReevalResult { skipped?: "unchanged" | "not_published"; users: number; written: number; failed: boolean }

export async function reevaluateCycle(cycleId: string, client?: Admin): Promise<CycleReevalResult> {
  const admin = client ?? createAdminClient();
  const [cycle] = await loadPublishedCycles(admin, [cycleId]);
  if (!cycle) {
    // Unpublished/archived/deleted: its results must not keep showing.
    await admin.from("exam_eligibility_results").delete().eq("exam_cycle_id", cycleId);
    await admin.from("exam_eligibility_cycle_state").delete().eq("exam_cycle_id", cycleId);
    return { skipped: "not_published", users: 0, written: 0, failed: false };
  }

  const { data: state } = await admin.from("exam_eligibility_cycle_state").select("rules_fingerprint").eq("exam_cycle_id", cycleId).maybeSingle();
  if (state?.rules_fingerprint === cycle.fingerprint) return { skipped: "unchanged", users: 0, written: 0, failed: false };

  let users = 0;
  let written = 0;
  let failed = false;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await admin
      .from("profiles").select("*")
      .not("onboarding_completed_at", "is", null)
      .order("user_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) { failed = true; break; }
    if (!page || page.length === 0) break;
    const ids = page.map((p) => p.user_id);

    const [{ data: educationRows }, { data: existingRows }] = await Promise.all([
      admin.from("education").select("*").in("user_id", ids),
      admin.from("exam_eligibility_results").select("*").eq("exam_cycle_id", cycleId).in("user_id", ids),
    ]);
    const educationByUser = new Map<string, NonNullable<typeof educationRows>>();
    for (const e of educationRows ?? []) educationByUser.set(e.user_id, [...(educationByUser.get(e.user_id) ?? []), e]);
    const existing = new Map((existingRows ?? []).map((r) => [r.user_id, r as ExistingResult]));

    const rows: ResultRow[] = [];
    for (const profile of page) {
      users += 1;
      const row = planResultRow({
        userId: profile.user_id,
        profile: profileToApplicant(profile, educationByUser.get(profile.user_id) ?? []),
        cycle,
        existing: existing.get(profile.user_id),
      });
      if (row) rows.push(row);
    }
    if (rows.length > 0) {
      if (!(await upsertRows(admin, rows))) { failed = true; break; }
      written += rows.length;
      await notifyEligibilityChanges(admin, rows);
    }
    if (page.length < PAGE_SIZE) break;
  }

  // The cycle is only marked evaluated when every page succeeded, so a
  // partial failure is retried by the next sweep instead of being forgotten.
  if (!failed) {
    await admin.from("exam_eligibility_cycle_state").upsert(
      { exam_cycle_id: cycleId, rules_fingerprint: cycle.fingerprint, users_evaluated: users, evaluated_at: new Date().toISOString() },
      { onConflict: "exam_cycle_id" },
    );
  }
  return { users, written, failed };
}

export interface SweepResult { cyclesChecked: number; cyclesReevaluated: number; failed: number }

/** Re-evaluates every published cycle whose rules/corrigendum state differs
 *  from the last evaluated state (or that was never evaluated — i.e. newly
 *  added). Bounded per run; leftovers are picked up by the next run. */
export async function sweepEligibility(client?: Admin): Promise<SweepResult> {
  const admin = client ?? createAdminClient();
  const cycles = await loadPublishedCycles(admin);
  const { data: states } = await admin.from("exam_eligibility_cycle_state").select("exam_cycle_id, rules_fingerprint");
  const known = new Map((states ?? []).map((s) => [s.exam_cycle_id, s.rules_fingerprint]));

  const due = cycles.filter((c) => known.get(c.id) !== c.fingerprint).slice(0, MAX_CYCLES_PER_SWEEP);
  let reevaluated = 0;
  let failed = 0;
  for (const c of due) {
    const res = await reevaluateCycle(c.id, admin);
    if (res.failed) failed += 1;
    else reevaluated += 1;
  }
  return { cyclesChecked: cycles.length, cyclesReevaluated: reevaluated, failed };
}

/** Fire-and-forget safe wrappers for call sites (server actions, pipeline):
 *  a failure here must never break the profile save or the already-published
 *  official update. */
export async function refreshUserEligibility(userId: string): Promise<void> {
  try {
    await reevaluateUser(userId);
  } catch (e) {
    console.error("eligibility: user refresh failed", e instanceof Error ? e.message : "unknown");
  }
}

export async function refreshCycleEligibility(cycleId: string): Promise<void> {
  try {
    await reevaluateCycle(cycleId);
  } catch (e) {
    console.error("eligibility: cycle refresh failed", e instanceof Error ? e.message : "unknown");
  }
}
