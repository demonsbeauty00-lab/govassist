import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { JobsListClient } from "@/components/exams/JobsListClient";
import { getProfileWithEducation } from "@/lib/actions/profile";
import { demoExamCycles } from "@/lib/mock-data";
import { evaluateEligibility } from "@/lib/eligibility/engine";
import { profileToApplicant } from "@/lib/eligibility/from-profile";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { daysUntil } from "@/lib/utils";
import { ensureDeadlineReminders } from "@/lib/actions/reminders";
import { EXAM_CATEGORY_OPTIONS } from "@/lib/constants";
import { ExamCategory } from "@/lib/types";

export default async function JobsPage({ searchParams }: { searchParams: { category?: string; q?: string } }) {
  const result = await getProfileWithEducation();

  if (result.configError) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  const applicant = profileToApplicant(result.profile, result.education);
  const examsWithEligibility = demoExamCycles.map((exam) => ({
    exam,
    eligibilityCategory: evaluateEligibility(applicant, exam.rules).category,
  }));

  const savedSlugs = result.profile?.saved_exam_slugs ?? [];

  // Best-effort, real deadline reminders (see lib/actions/reminders.ts) for
  // exams the user has actually saved and that are genuinely closing soon —
  // never awaited-blocking in a way that would fail the page if it errors.
  const closingSoonSaved = examsWithEligibility
    .filter(({ exam }) => savedSlugs.includes(exam.id) && exam.applicationWindow.status === "closing_soon")
    .map(({ exam }) => ({ slug: exam.id, shortName: exam.shortName, daysLeft: Math.max(daysUntil(exam.applicationWindow.endDate), 0) }));
  if (closingSoonSaved.length > 0) {
    await ensureDeadlineReminders(closingSoonSaved);
  }

  const initialCategory = EXAM_CATEGORY_OPTIONS.includes(searchParams.category as ExamCategory)
    ? (searchParams.category as ExamCategory)
    : undefined;

  return (
    <AppShell title="Jobs">
      <DemoBanner label="Exam listings are sample data — eligibility below is computed live from your real profile" />
      <p className="mt-2 text-sm text-ink-muted">
        Every notification below links to the official source. Eligibility is shown as a guide, not a guarantee.
      </p>

      <JobsListClient
        examsWithEligibility={examsWithEligibility}
        savedSlugs={savedSlugs}
        initialCategory={initialCategory}
        initialQuery={searchParams.q}
      />
    </AppShell>
  );
}
