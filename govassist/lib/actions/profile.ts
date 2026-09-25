"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { profileSchema, educationSchema } from "@/lib/validation";
import { ActionState } from "./auth";
import { Database } from "@/lib/supabase/database.types";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { requireUser } from "./session";

export async function getProfileWithEducation() {
  const result = await requireUser();
  if (!result.ok) {
    return { configError: true as const, profile: null, education: [], userEmail: null };
  }
  const { supabase, user } = result;

  const [{ data: profile }, { data: education }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("education").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
  ]);

  return { configError: false as const, profile, education: education ?? [], userEmail: user.email ?? null };
}

export async function completeOnboardingAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, configError: true };
  const { supabase, user } = result;

  const profileRaw = {
    full_name: String(formData.get("full_name") ?? ""),
    dob: String(formData.get("dob") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    state: String(formData.get("state") ?? ""),
    category: String(formData.get("category") ?? ""),
    is_pwbd: formData.get("is_pwbd") === "true",
    preferred_categories: formData.getAll("preferred_categories").map(String),
  };

  const parsedProfile = profileSchema.safeParse(profileRaw);
  if (!parsedProfile.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsedProfile.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors };
  }

  const educationRaw = {
    qualification_level: String(formData.get("qualification_level") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    passing_year: String(formData.get("passing_year") ?? ""),
  };
  const parsedEducation = educationSchema.safeParse(educationRaw);
  if (!parsedEducation.success) {
    return { error: parsedEducation.error.issues[0]?.message ?? "Check your education details." };
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      ...parsedProfile.data,
      onboarding_completed_at: new Date().toISOString(),
    },
    // Explicit, rather than relying on PostgREST's implicit
    // primary-key-based default — makes the insert-vs-update decision
    // for this upsert unambiguous regardless of how the request is
    // formed, which is what actually determines whether a first-time
    // profile creation or a re-run of onboarding succeeds.
    { onConflict: "user_id" }
  );
  if (profileError) return { error: profileError.message };

  const { error: educationError } = await supabase.from("education").insert({
    user_id: user.id,
    qualification_level: parsedEducation.data.qualification_level,
    subject: parsedEducation.data.subject || null,
    passing_year: parsedEducation.data.passing_year ? Number(parsedEducation.data.passing_year) : null,
    source: "manual",
  });
  if (educationError) return { error: educationError.message };

  redirect("/home");
}

export async function updateProfileFieldAction(field: string, value: string | boolean | string[]) {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const allowedFields = ["full_name", "dob", "gender", "state", "category", "is_pwbd", "preferred_categories"];
  if (!allowedFields.includes(field)) {
    return { error: "That field can't be edited here." };
  }

  // The cast below is deliberate, not a shortcut: `field` is a runtime string
  // (validated by the allowlist above), so `{ [field]: value }` has type
  // `{ [x: string]: ... }` — an index signature, which Supabase's generated
  // `Update` type (a fixed set of optional named properties) doesn't
  // structurally accept. The allowlist check is what actually keeps this
  // safe; the cast only tells TypeScript what we've already verified.
  const payload = { [field]: value, updated_at: new Date().toISOString() } as Database["public"]["Tables"]["profiles"]["Update"];

  const { error } = await supabase.from("profiles").update(payload).eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { success: true };
}

export async function updateEducationFieldAction(educationId: string, field: string, value: string | number | null) {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const allowedFields = ["qualification_level", "subject", "passing_year"];
  if (!allowedFields.includes(field)) {
    return { error: "That field can't be edited here." };
  }

  const payload = { [field]: value, updated_at: new Date().toISOString() } as Database["public"]["Tables"]["education"]["Update"];

  // .eq("user_id", ...) here is belt-and-suspenders on top of RLS: even if
  // this check were removed, the education_update_own policy in the
  // migration would still block writes to another user's row.
  const { error } = await supabase
    .from("education")
    .update(payload)
    .eq("id", educationId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { success: true };
}
