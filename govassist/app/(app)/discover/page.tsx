import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { EligibilityPill } from "@/components/ui/EligibilityPill";
import { EligibilityBreakdown } from "@/components/eligibility/EligibilityBreakdown";
import { getProfileWithEducation } from "@/lib/actions/profile";
import { refreshUserEligibility } from "@/lib/eligibility/reevaluate";
import { RESULT_CATEGORY_LABEL, type EligibilityCategory } from "@/lib/eligibility/types";
import { createClient } from "@/lib/supabase/server";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ORDER: EligibilityCategory[] = ["potentially_eligible", "needs_review", "likely_not_eligible"];
const RECENT_MS = 7 * 86_400_000;

type EligibilityResultRow = Database["public"]["Tables"]["exam_eligibility_results"]["Row"];

/** Stored categories come from a text column; anything unexpected (e.g. an old
 *  or hand-edited value) is treated as "no previous category", never indexed. */
function isEligibilityCategory(value: unknown): value is EligibilityCategory {
  return typeof value === "string" && (ORDER as string[]).includes(value);
}

export default async function DiscoverPage() {
  const { configError, profile } = await getProfileWithEducation();
  if (configError) return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  const supabase = await createClient();
  if (!supabase || !profile) {
    return (
      <AppShell title="Exam Discovery">
        <div className="mt-4"><EmptyState title="Finish your profile first" description="Exam Discovery compares official exam rules with your profile. Complete onboarding to see your matches." /></div>
      </AppShell>
    );
  }

  // Self-healing: a no-op when nothing changed (fingerprints), otherwise
  // brings this user's stored results up to date before they are shown.
  await refreshUserEligibility(profile.user_id);

  const { data: resultData } = await supabase.from("exam_eligibility_results").select("*").eq("user_id", profile.user_id);
  const results: EligibilityResultRow[] = resultData ?? [];
  const cycleIds = results.map((r) => r.exam_cycle_id);
  // exam_cycles is readable only when published (RLS), so withdrawn cycles drop out here too.
  const { data: cycles } = cycleIds.length
    ? await supabase.from("exam_cycles").select("id, exam_id, cycle_label, official_notification_url, last_verified_date").in("id", cycleIds)
    : { data: [] as { id: string; exam_id: string; cycle_label: string; official_notification_url: string; last_verified_date: string }[] };
  const examIds = Array.from(new Set((cycles ?? []).map((c) => c.exam_id)));
  const { data: exams } = examIds.length
    ? await supabase.from("exams").select("id, short_name, name, recruiting_body").in("id", examIds)
    : { data: [] as { id: string; short_name: string; name: string; recruiting_body: string }[] };
  const examById = new Map((exams ?? []).map((e) => [e.id, e]));
  const cycleById = new Map((cycles ?? []).map((c) => [c.id, c]));

  const items = results
    .map((r) => ({ r, cycle: cycleById.get(r.exam_cycle_id) }))
    .filter((x): x is { r: EligibilityResultRow; cycle: NonNullable<typeof x.cycle> } => !!x.cycle)
    .sort((a, b) => b.r.category_changed_at.localeCompare(a.r.category_changed_at));

  return (
    <AppShell title="Exam Discovery">
      <p className="mt-1 text-sm text-ink-muted">
        Official exam cycles checked against your profile with fixed, published rules — no guessing. This is guidance, not a
        guarantee: always confirm on the official notification before applying.
      </p>

      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No official exam cycles to show yet" description="When verified exam cycles are published, they appear here automatically, classified against your profile." />
        </div>
      ) : (
        ORDER.map((category) => {
          const group = items.filter((i) => i.r.category === category);
          if (group.length === 0) return null;
          return (
            <section key={category} className="mt-6 space-y-3">
              <h2 className="text-base font-semibold text-ink">{RESULT_CATEGORY_LABEL[category]} ({group.length})</h2>
              {group.map(({ r, cycle }) => {
                const exam = examById.get(cycle.exam_id);
                const previous = isEligibilityCategory(r.previous_category) ? r.previous_category : null;
                const recent = Date.now() - new Date(r.category_changed_at).getTime() < RECENT_MS;
                return (
                  <Card key={r.exam_cycle_id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-ink">{exam?.short_name ?? "Exam"} · {cycle.cycle_label}</p>
                        {exam && <p className="text-xs text-ink-faint">{exam.recruiting_body}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {recent && <span className="rounded-sm bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{previous ? "Updated" : "New"}</span>}
                        <EligibilityPill category={r.category} />
                      </div>
                    </div>
                    {previous && (
                      <p className="mt-1 text-xs text-ink-faint">
                        Changed from {RESULT_CATEGORY_LABEL[previous]} on {formatDate(r.category_changed_at.slice(0, 10))}.
                      </p>
                    )}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-brand-600">Why this result</summary>
                      <div className="mt-3"><EligibilityBreakdown checks={r.checks} bare /></div>
                    </details>
                    <p className="mt-3 text-xs text-ink-faint">
                      Rules last verified {formatDate(cycle.last_verified_date)} ·{" "}
                      <a className="underline" href={cycle.official_notification_url} target="_blank" rel="noopener noreferrer">Official notification ↗</a>
                    </p>
                  </Card>
                );
              })}
            </section>
          );
        })
      )}
    </AppShell>
  );
}
