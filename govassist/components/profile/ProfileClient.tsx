"use client";

import { useState } from "react";
import Link from "next/link";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { ProfileField, ProfileSection } from "@/components/profile/ProfileField";
import { SettingsIcon } from "@/components/ui/Icons";
import { EXAM_CATEGORY_OPTIONS } from "@/lib/constants";
import { ExamCategory } from "@/lib/types";
import { updateProfileFieldAction, updateEducationFieldAction } from "@/lib/actions/profile";
import { Database } from "@/lib/supabase/database.types";
import { getAge } from "@/lib/utils";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Education = Database["public"]["Tables"]["education"]["Row"];

interface ProfileClientProps {
  profile: Profile | null;
  education: Education | null;
  userEmail: string;
  completionPercent: number;
}

export function ProfileClient({ profile, education, userEmail, completionPercent }: ProfileClientProps) {
  const [preferred, setPreferred] = useState<string[]>(profile?.preferred_categories ?? []);
  const [isPwBD, setIsPwBD] = useState(profile?.is_pwbd ?? false);
  const [savingPref, setSavingPref] = useState(false);
  const [prefError, setPrefError] = useState<string | null>(null);

  if (!profile) {
    return (
      <div className="mt-4 rounded border border-hairline bg-paper-raised p-4 text-center">
        <p className="text-[15px] font-medium text-ink">Profile setup isn't complete</p>
        <p className="mt-1 text-sm text-ink-muted">Finish onboarding to see your details here.</p>
        <Link href="/onboarding" className="mt-4 inline-block">
          <Button size="sm">Continue setup</Button>
        </Link>
      </div>
    );
  }

  async function save(field: string, value: string | boolean | string[]) {
    const result = await updateProfileFieldAction(field, value);
    if (result?.error) throw new Error(result.error);
  }

  async function togglePreferred(cat: ExamCategory) {
    const next = preferred.includes(cat) ? preferred.filter((c) => c !== cat) : [...preferred, cat];
    setPreferred(next);
    setSavingPref(true);
    setPrefError(null);
    try {
      await save("preferred_categories", next);
    } catch (e) {
      setPreferred(preferred); // revert on failure
      setPrefError(e instanceof Error ? e.message : "Couldn't save — try again.");
    } finally {
      setSavingPref(false);
    }
  }

  async function togglePwBD(value: boolean) {
    setIsPwBD(value);
    try {
      await save("is_pwbd", value);
    } catch {
      setIsPwBD(!value); // revert on failure
    }
  }

  async function saveEducation(field: string, value: string) {
    if (!education) return;
    const parsedValue = field === "passing_year" ? (value ? Number(value) : null) : value || null;
    const result = await updateEducationFieldAction(education.id, field, parsedValue);
    if (result?.error) throw new Error(result.error);
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-center justify-between rounded border border-hairline bg-paper-raised p-4">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{profile.full_name}</p>
          <p className="text-sm text-ink-muted">{getAge(profile.dob)} years · {profile.state}</p>
          <p className="mt-0.5 truncate text-xs text-ink-faint">{userEmail}</p>
        </div>
        <Link href="/settings" className="tap-target flex items-center justify-center text-ink-faint" aria-label="Settings">
          <SettingsIcon />
        </Link>
      </div>

      <div className="rounded border border-hairline bg-paper-raised p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-ink">Profile completion</p>
          <span className="text-sm font-medium text-ink">{completionPercent}%</span>
        </div>
        <div className="mt-2">
          <ProgressBar percent={completionPercent} />
        </div>
      </div>

      <ProfileSection title="Personal details">
        <ProfileField label="Full name" value={profile.full_name} onSave={(v) => save("full_name", v)} />
        <ProfileField label="Date of birth" value={profile.dob} inputType="date" onSave={(v) => save("dob", v)} />
        <ProfileField label="Gender" value={profile.gender} onSave={(v) => save("gender", v)} />
        <ProfileField label="State" value={profile.state} onSave={(v) => save("state", v)} />
        <ProfileField label="Category" value={profile.category} onSave={(v) => save("category", v)} />
        <Toggle
          id="pwbd"
          checked={isPwBD}
          onChange={togglePwBD}
          label="PwBD status"
          description="Unlocks age and fee relaxations you may be entitled to."
        />
      </ProfileSection>

      <ProfileSection title="Education">
        {education ? (
          <>
            <ProfileField label="Qualification" value={education.qualification_level} onSave={(v) => saveEducation("qualification_level", v)} />
            <ProfileField label="Subject" value={education.subject ?? ""} onSave={(v) => saveEducation("subject", v)} />
            <ProfileField label="Passing year" value={education.passing_year?.toString() ?? ""} onSave={(v) => saveEducation("passing_year", v)} />
          </>
        ) : (
          <p className="py-2.5 text-sm text-ink-muted">No education details on file yet.</p>
        )}
      </ProfileSection>

      <div className="rounded border border-hairline bg-paper-raised p-4">
        <p className="text-sm font-semibold text-ink">Preferred exam categories</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAM_CATEGORY_OPTIONS.map((cat) => (
            <Chip key={cat} label={cat} selected={preferred.includes(cat)} onClick={() => togglePreferred(cat)} />
          ))}
        </div>
        {savingPref && <p className="mt-2 text-xs text-ink-faint">Saving…</p>}
        {prefError && <p className="mt-2 text-sm text-ineligible-fg">{prefError}</p>}
      </div>

      <Link href="/documents">
        <Button variant="secondary" fullWidth>
          Manage documents
        </Button>
      </Link>
    </div>
  );
}
