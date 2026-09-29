// ---------------------------------------------------------------------------
// Notification preferences — pure helpers over profiles.notification_preferences
// (a jsonb column since 0008). Keys mirror notifications.type, plus
// `eligible_alerts` (Phase 8).
//
// Defaults differ on purpose:
//   - deadline / admit_card / result / system: a MISSING key means enabled.
//     These only ever reach people who saved or applied to an exam, i.e.
//     who already asked to hear about it.
//   - eligible_alerts: a missing key means DISABLED. It's the one category
//     that reaches people about exams they never touched, so it must be an
//     explicit opt-in — never something a user is subscribed to by default.
// ---------------------------------------------------------------------------

import { Database } from "@/lib/supabase/database.types";

export type NotificationPreferences = Database["public"]["Tables"]["profiles"]["Row"]["notification_preferences"];
export type NotificationType = Database["public"]["Tables"]["notifications"]["Row"]["type"];

export const PREFERENCE_KEYS = ["deadline", "admit_card", "result", "system", "eligible_alerts"] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

export function isTypeEnabled(prefs: NotificationPreferences | null | undefined, type: NotificationType): boolean {
  return (prefs ?? {})[type] !== false;
}

export function isEligibleAlertEnabled(prefs: NotificationPreferences | null | undefined): boolean {
  return (prefs ?? {}).eligible_alerts === true;
}

/** Resolves every key to a concrete boolean, for rendering the Settings
 *  toggles — the same defaulting rules as the two functions above. */
export function resolvePreferences(prefs: NotificationPreferences | null | undefined): Record<PreferenceKey, boolean> {
  return {
    deadline: isTypeEnabled(prefs, "deadline"),
    admit_card: isTypeEnabled(prefs, "admit_card"),
    result: isTypeEnabled(prefs, "result"),
    system: isTypeEnabled(prefs, "system"),
    eligible_alerts: isEligibleAlertEnabled(prefs),
  };
}

export function isPreferenceKey(value: string): value is PreferenceKey {
  return (PREFERENCE_KEYS as readonly string[]).includes(value);
}
