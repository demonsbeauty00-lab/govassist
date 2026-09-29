"use server";

import { requireUser } from "./session";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { isPreferenceKey, NotificationPreferences, PreferenceKey, resolvePreferences } from "@/lib/notifications/preferences";

/** Reads the signed-in user's saved preferences (own row only — profiles
 *  RLS). Keys they've never touched resolve to their documented default. */
export async function getNotificationPreferencesAction(): Promise<{ error?: string; preferences: Record<PreferenceKey, boolean> | null }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE, preferences: null };
  const { supabase, user } = result;

  const { data, error } = await supabase.from("profiles").select("notification_preferences").eq("user_id", user.id).maybeSingle();
  if (error) return { error: error.message, preferences: null };
  if (!data) return { error: "Complete your profile first — notification preferences are saved with it.", preferences: null };

  return { preferences: resolvePreferences(data.notification_preferences) };
}

/** Changes exactly one preference, merging into what's stored so the other
 *  keys are never clobbered. The key is validated against a fixed
 *  allow-list — an arbitrary client-supplied key never reaches the column. */
export async function updateNotificationPreferenceAction(key: string, value: boolean): Promise<{ error?: string; preferences?: Record<PreferenceKey, boolean> }> {
  if (!isPreferenceKey(key) || typeof value !== "boolean") return { error: "Unknown notification setting." };

  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: current, error: readError } = await supabase.from("profiles").select("notification_preferences").eq("user_id", user.id).maybeSingle();
  if (readError) return { error: readError.message };
  if (!current) return { error: "Complete your profile first — notification preferences are saved with it." };

  const merged: NotificationPreferences = { ...(current.notification_preferences ?? {}), [key]: value };
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ notification_preferences: merged, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("notification_preferences")
    .maybeSingle();

  if (updateError) return { error: updateError.message };
  if (!updated) return { error: "Couldn't save that change." };
  return { preferences: resolvePreferences(updated.notification_preferences) };
}
