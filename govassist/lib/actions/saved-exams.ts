"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

/** Returns the signed-in user's saved exam slugs, or [] if unconfigured/no
 *  profile yet — callers that need to distinguish "not configured" from
 *  "no profile" should use getProfileWithEducation() directly instead. */
export async function getSavedExamSlugsAction(): Promise<string[]> {
  const result = await requireUser();
  if (!result.ok) return [];
  const { supabase, user } = result;

  const { data } = await supabase.from("profiles").select("saved_exam_slugs").eq("user_id", user.id).maybeSingle();
  return data?.saved_exam_slugs ?? [];
}

export async function toggleSavedExamAction(examSlug: string): Promise<{ error?: string; saved?: boolean }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("saved_exam_slugs")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) return { error: readError.message };
  if (!profile) return { error: "Complete onboarding before saving exams." };

  const current: string[] = profile.saved_exam_slugs ?? [];
  const alreadySaved = current.includes(examSlug);
  const next: string[] = alreadySaved ? current.filter((s: string) => s !== examSlug) : [...current, examSlug];

  const { error } = await supabase
    .from("profiles")
    .update({ saved_exam_slugs: next, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  revalidatePath("/exams");
  revalidatePath("/home");
  revalidatePath(`/jobs/${examSlug}`);

  return { saved: !alreadySaved };
}
