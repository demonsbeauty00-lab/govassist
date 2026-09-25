import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EligibilityPill } from "@/components/ui/EligibilityPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationStatusBadge } from "@/components/exams/NotificationStatusBadge";
import { SaveExamButton } from "@/components/exams/SaveExamButton";
import { demoExamCycles, demoCompletedExamCycle } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
import { getProfileWithEducation } from "@/lib/actions/profile";
import { evaluateEligibility } from "@/lib/eligibility/engine";
import { profileToApplicant } from "@/lib/eligibility/from-profile";
import { computeNotificationStatus } from "@/lib/notifications/status";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

const allCycles = [...demoExamCycles, demoCompletedExamCycle];

export default async function JobDetailsPage({ params }: { params: { id: string } }) {
  const exam = allCycles.find((e) => e.id === params.id);

  if (!exam) {
    return (
      <AppShell title="Exam details" showBack>
        <div className="mt-4">
          <EmptyState title="Exam not found" description="This listing may have been removed or archived." />
        </div>
      </AppShell>
    );
  }

  const profileResult = await getProfileWithEducation();
  if (profileResult.configError) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  const applicant = profileToApplicant(profileResult.profile, profileResult.education);
  const eligibility = evaluateEligibility(applicant, exam.rules);
  const whyEligible = eligibility.checks.filter((c) => c.status === "pass");
  const whatIsMissing = eligibility.checks.filter((c) => c.status !== "pass");
  const notificationStatus = computeNotificationStatus(exam);
  const isSaved = (profileResult.profile?.saved_exam_slugs ?? []).includes(exam.id);

  const resultDates = [
    exam.admitCardDate ? { label: "Admit card", date: exam.admitCardDate } : null,
    exam.answerKeyDate ? { label: "Answer key", date: exam.answerKeyDate } : null,
    exam.resultDate ? { label: "Result", date: exam.resultDate } : null,
  ].filter((d): d is { label: string; date: string } => d !== null);

  return (
    <AppShell title={exam.shortName} showBack>
      <DemoBanner label="Exam listing is sample data — eligibility below is computed live from your real profile" />

      <div className="mt-2 space-y-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-ink-muted">{exam.organization} · {exam.cycleLabel}</p>
              <h1 className="mt-0.5 text-xl font-semibold text-ink">{exam.examName}</h1>
            </div>
            <SaveExamButton examSlug={exam.id} initiallySaved={isSaved} />
          </div>
          {exam.post && <p className="mt-1 text-sm text-ink-muted">{exam.post}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EligibilityPill category={eligibility.category} />
            <NotificationStatusBadge status={notificationStatus} />
          </div>
          {eligibility.category === "potentially_eligible" && (
            <p className="mt-2 text-sm font-medium text-eligible-fg">You may be eligible for this exam.</p>
          )}
        </div>

        {whyEligible.length > 0 && (
          <Card className="space-y-2 p-4">
            <p className="text-sm font-semibold text-ink">Why am I eligible?</p>
            <ul className="space-y-2">
              {whyEligible.map((c) => (
                <li key={c.label} className="flex gap-2 text-sm">
                  <span className="text-eligible-fg">✓</span>
                  <span className="text-ink-muted">
                    <span className="font-medium text-ink">{c.label}: </span>
                    {c.explanation}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {whatIsMissing.length > 0 && (
          <Card className="space-y-2 p-4">
            <p className="text-sm font-semibold text-ink">What is missing?</p>
            <ul className="space-y-2">
              {whatIsMissing.map((c) => (
                <li key={c.label} className="flex gap-2 text-sm">
                  <span className={c.status === "fail" ? "text-ineligible-fg" : "text-caution-fg"}>
                    {c.status === "fail" ? "✕" : "?"}
                  </span>
                  <span className="text-ink-muted">
                    <span className="font-medium text-ink">{c.label}: </span>
                    {c.explanation}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="border-brand-300 bg-brand-50 p-4">
          <p className="text-sm text-brand-700">{eligibility.disclaimer}</p>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Eligibility criteria</p>
          <dl className="mt-2 space-y-2 text-sm">
            <Row label="Qualification" value={exam.qualificationSummary} />
            <Row label="Age" value={exam.ageRange} />
            {exam.state && <Row label="Domicile / State" value={exam.state} />}
            {exam.vacancies && <Row label="Vacancies" value={exam.vacancies.toLocaleString("en-IN")} />}
          </dl>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Exam pattern</p>
          <div className="mt-2 space-y-3">
            {exam.examPattern.map((tier) => (
              <div key={tier.tierLabel}>
                <p className="text-sm font-medium text-ink">{tier.tierLabel}</p>
                <p className="text-sm text-ink-muted">{tier.sections.join(" · ")}</p>
                <p className="mt-0.5 text-sm text-ink-faint">
                  {tier.duration} · Negative marking: {tier.negativeMarking}
                </p>
              </div>
            ))}
          </div>
          {exam.syllabusSummary && (
            <div className="mt-3 border-t border-hairline pt-3">
              <p className="text-sm font-medium text-ink">Syllabus</p>
              <p className="mt-0.5 text-sm text-ink-muted">{exam.syllabusSummary}</p>
            </div>
          )}
          {exam.markingSchemeSummary && (
            <div className="mt-3 border-t border-hairline pt-3">
              <p className="text-sm font-medium text-ink">Marking scheme</p>
              <p className="mt-0.5 text-sm text-ink-muted">{exam.markingSchemeSummary}</p>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Important dates</p>
          <dl className="mt-2 space-y-2 text-sm">
            {exam.importantDates.map((d) => (
              <div key={d.label} className="flex items-center justify-between">
                <dt className="text-ink-muted">{d.label}</dt>
                <dd className="font-medium text-ink">
                  {formatDate(d.date)}
                  {d.isTentative && <span className="text-ink-faint"> (tentative)</span>}
                </dd>
              </div>
            ))}
            {resultDates.map((d) => (
              <div key={d.label} className="flex items-center justify-between">
                <dt className="text-ink-muted">{d.label}</dt>
                <dd className="font-medium text-ink">{formatDate(d.date)}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Source & verification</p>
          <dl className="mt-2 space-y-2 text-sm">
            <Row label="Recruitment cycle" value={exam.cycleLabel} />
            <Row label="Notification date" value={formatDate(exam.notificationDate)} />
            <Row label="Last verified" value={formatDate(exam.lastVerifiedDate)} />
          </dl>
          <div className="mt-3 space-y-1.5">
            <a
              href={exam.officialNotificationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm font-medium text-brand-600 underline"
            >
              View official notification ↗
            </a>
            <a
              href={exam.officialWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm font-medium text-brand-600 underline"
            >
              Official website ↗
            </a>
          </div>
          <p className="mt-3 text-xs font-medium text-ink-faint">Verify details in official notification.</p>
        </Card>

        <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 border-t border-hairline bg-paper/95 px-4 py-3 backdrop-blur">
          <a href={exam.officialApplicationUrl ?? exam.officialWebsite} target="_blank" rel="noopener noreferrer">
            <Button fullWidth>Start application on official site</Button>
          </a>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
