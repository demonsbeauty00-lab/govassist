import Link from "next/link";
import { ExamCycle } from "@/lib/types";
import { EligibilityCategory } from "@/lib/eligibility/types";
import { Card } from "@/components/ui/Card";
import { EligibilityPill, eligibilityStripColor } from "@/components/ui/EligibilityPill";
import { NotificationStatusBadge } from "@/components/exams/NotificationStatusBadge";
import { SaveExamButton } from "@/components/exams/SaveExamButton";
import { computeNotificationStatus } from "@/lib/notifications/status";

/** eligibilityCategory is always passed in, computed once by the page (via
 *  evaluateEligibility) against the signed-in user's real profile — the
 *  card itself never runs the engine or knows about profile data, so the
 *  same card works whether it's shown 1 time or 100 times on a list page. */
export function ExamCard({
  exam,
  eligibilityCategory,
  isSaved,
}: {
  exam: ExamCycle;
  eligibilityCategory: EligibilityCategory;
  isSaved: boolean;
}) {
  const status = computeNotificationStatus(exam);

  return (
    <Link href={`/jobs/${exam.id}`} aria-label={`View details for ${exam.shortName}`}>
      <Card stripColor={eligibilityStripColor(eligibilityCategory)} interactive className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{exam.shortName}</p>
            <p className="truncate text-sm text-ink-muted">{exam.organization}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <SaveExamButton examSlug={exam.id} initiallySaved={isSaved} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-muted">
          <span>{exam.qualificationSummary}</span>
        </div>

        {eligibilityCategory === "potentially_eligible" && (
          <p className="mt-2 text-sm font-medium text-eligible-fg">You may be eligible for this exam.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <NotificationStatusBadge status={status} />
          <EligibilityPill category={eligibilityCategory} />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-ink-faint">Verify details in official notification.</p>
          <span className="text-sm font-medium text-brand-600">View details</span>
        </div>
      </Card>
    </Link>
  );
}
