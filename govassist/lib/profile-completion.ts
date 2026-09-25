import { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"] | null;
type Education = Database["public"]["Tables"]["education"]["Row"][];

const PROFILE_FIELDS: (keyof NonNullable<Profile>)[] = [
  "full_name",
  "dob",
  "gender",
  "state",
  "category",
  "preferred_categories",
];

/**
 * Deliberately computed on read rather than stored as a column — a stored
 * percentage drifts the moment a field changes unless every write path
 * remembers to recompute it. This is the single source of truth instead.
 */
export function computeProfileCompletion(profile: Profile, education: Education, documentsUploadedCount: number): number {
  if (!profile) return 0;

  let filled = 0;
  let total = PROFILE_FIELDS.length + 1 /* education */ + 1 /* at least one document */;

  for (const field of PROFILE_FIELDS) {
    const value = profile[field];
    if (Array.isArray(value) ? value.length > 0 : !!value) filled++;
  }
  if (education.length > 0) filled++;
  if (documentsUploadedCount > 0) filled++;

  return Math.round((filled / total) * 100);
}
