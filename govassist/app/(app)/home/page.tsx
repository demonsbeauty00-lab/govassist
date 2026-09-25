import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { getProfileWithEducation } from "@/lib/actions/profile";
import { getDocumentsAction } from "@/lib/actions/documents";
import { getDashboardSummaryAction } from "@/lib/actions/dashboard";
import { computeProfileCompletion } from "@/lib/profile-completion";
import { HomeContent } from "@/components/home/HomeContent";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { demoExamCycles } from "@/lib/mock-data";
import { evaluateEligibility } from "@/lib/eligibility/engine";
import { profileToApplicant } from "@/lib/eligibility/from-profile";

export default async function HomePage() {
  const [profileResult, documentsResult, dashboardResult] = await Promise.all([
    getProfileWithEducation(),
    getDocumentsAction(),
    getDashboardSummaryAction(),
  ]);

  if (profileResult.configError) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  const firstName = (profileResult.profile?.full_name || "there").split(" ")[0] ?? "there";
  const uploadedDocumentCount = documentsResult.documents.filter((d) => d.status !== "not_uploaded").length;
  const completionPercent = computeProfileCompletion(profileResult.profile, profileResult.education, uploadedDocumentCount);

  const applicant = profileToApplicant(profileResult.profile, profileResult.education);
  const examsWithEligibility = demoExamCycles.map((exam) => ({
    exam,
    eligibilityCategory: evaluateEligibility(applicant, exam.rules).category,
  }));

  const potentiallyEligible = examsWithEligibility.filter((e) => e.eligibilityCategory === "potentially_eligible");
  const applicationsOpen = demoExamCycles.filter(
    (e) => e.applicationWindow.status === "open" || e.applicationWindow.status === "closing_soon"
  );
  const closingSoon = examsWithEligibility.filter((e) => e.exam.applicationWindow.status === "closing_soon");
  const savedSlugs = profileResult.profile?.saved_exam_slugs ?? [];

  const latestExams = [...demoExamCycles]
    .sort((a, b) => b.notificationDate.localeCompare(a.notificationDate))
    .slice(0, 5);

  return (
    <AppShell variant="hamburger">
      <HomeContent
        firstName={firstName}
        completionPercent={completionPercent}
        stats={{
          potentiallyEligible: potentiallyEligible.length,
          applicationsOpen: applicationsOpen.length,
          deadlinesNear: closingSoon.length,
          savedExams: savedSlugs.length,
        }}
        latestExams={latestExams}
        savedSlugs={savedSlugs}
        summary={dashboardResult.summary}
        totalExamsCovered={demoExamCycles.length}
      />
    </AppShell>
  );
}
