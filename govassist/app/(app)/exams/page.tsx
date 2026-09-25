import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { MyExamsClient } from "@/components/exams/MyExamsClient";
import { getProfileWithEducation } from "@/lib/actions/profile";
import { demoExamCycles, demoCompletedExamCycle, demoAppliedExamIds } from "@/lib/mock-data";
import { evaluateEligibility } from "@/lib/eligibility/engine";
import { profileToApplicant } from "@/lib/eligibility/from-profile";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

const allCycles = [...demoExamCycles, demoCompletedExamCycle];

export default async function MyExamsPage() {
  const result = await getProfileWithEducation();

  if (result.configError) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  const applicant = profileToApplicant(result.profile, result.education);
  const allExams = allCycles.map((exam) => ({
    exam,
    eligibilityCategory: evaluateEligibility(applicant, exam.rules).category,
  }));

  return (
    <AppShell title="My Exams">
      <DemoBanner label="Exam listings are sample data — eligibility below is computed live from your real profile" />
      <MyExamsClient allExams={allExams} savedIds={result.profile?.saved_exam_slugs ?? []} appliedIds={demoAppliedExamIds} />
    </AppShell>
  );
}
