import { Database } from "@/lib/supabase/database.types";
import { ApplicantProfile } from "./types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type EducationRow = Database["public"]["Tables"]["education"]["Row"];

/**
 * Converts the real, signed-in user's profile + education rows into the
 * engine's input shape. This is the one place that knows about the Supabase
 * schema; engine.ts never does, which is what lets the same engine run
 * against a completely different profile source later without changes.
 */
export function profileToApplicant(profile: ProfileRow | null, education: EducationRow[]): ApplicantProfile {
  return {
    dob: profile?.dob ?? null,
    gender: profile?.gender ?? null,
    category: profile?.category ?? null,
    state: profile?.state ?? null,
    isPwbd: profile?.is_pwbd ?? false,
    qualifications: education.map((e) => ({
      qualificationLevel: e.qualification_level,
      subject: e.subject,
      percentageOrCgpa: e.percentage_or_cgpa,
    })),
  };
}
