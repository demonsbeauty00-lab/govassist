import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { getProfileWithEducation } from "@/lib/actions/profile";
import { getDocumentsAction } from "@/lib/actions/documents";
import { computeProfileCompletion } from "@/lib/profile-completion";
import { ProfileClient } from "@/components/profile/ProfileClient";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export default async function ProfilePage() {
  const [profileResult, documentsResult] = await Promise.all([getProfileWithEducation(), getDocumentsAction()]);

  if (profileResult.configError) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  const { profile, education, userEmail } = profileResult;
  const uploadedDocumentCount = documentsResult.documents.filter((d) => d.status !== "not_uploaded").length;
  const completionPercent = computeProfileCompletion(profile, education, uploadedDocumentCount);

  return (
    <AppShell title="Profile">
      <ProfileClient
        profile={profile}
        education={education[0] ?? null}
        userEmail={userEmail ?? ""}
        completionPercent={completionPercent}
      />
    </AppShell>
  );
}
