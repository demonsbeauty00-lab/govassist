// ---------------------------------------------------------------------------
// Notification preferences — pure helpers over profiles.notification_preferences
// (a jsonb column since 0008). Keys are the user-facing categories, plus
// `eligible_alerts` (Phase 8) and `channel_email` (Phase 14).
//
// Defaults differ on purpose:
//   - category keys: a MISSING key means enabled. These only reach people who
//     saved/applied to an exam or own the request, i.e. who already asked.
//   - eligible_alerts and channel_email: a missing key means DISABLED. They are
//     the two that reach people beyond what they asked for (exams they never
//     touched; their email inbox), so they are explicit opt-ins.
//
// Categories added after Phase 8 fall back to the key that used to govern
// them, so nobody who switched an alert off silently starts getting it again:
//   answer_key -> result, new_notification / exam_date / eligibility /
//   application_requests -> system.
// ---------------------------------------------------------------------------

import { Database } from "@/lib/supabase/database.types";
import type { NotificationCategory } from "./events";

export type NotificationPreferences = Database["public"]["Tables"]["profiles"]["Row"]["notification_preferences"];
export type NotificationType = Database["public"]["Tables"]["notifications"]["Row"]["type"];

export const PREFERENCE_KEYS = [
  "new_notification", "deadline", "exam_date", "admit_card", "answer_key", "result",
  "eligibility", "application_requests", "system", "eligible_alerts", "channel_email",
] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

const FALLBACK: Partial<Record<NotificationCategory, NotificationCategory>> = {
  answer_key: "result",
  new_notification: "system",
  exam_date: "system",
  eligibility: "system",
  application_requests: "system",
};

function stored(prefs: NotificationPreferences | null | undefined, key: string): boolean | undefined {
  const value = ((prefs ?? {}) as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

/** Is this category enabled? An explicit value wins; otherwise the legacy
 *  fallback key; otherwise enabled. */
export function isCategoryEnabled(prefs: NotificationPreferences | null | undefined, category: NotificationCategory): boolean {
  const own = stored(prefs, category);
  if (own !== undefined) return own;
  const fallback = FALLBACK[category];
  if (fallback) {
    const inherited = stored(prefs, fallback);
    if (inherited !== undefined) return inherited;
  }
  return true;
}

/** Back-compat for callers that pass a legacy notifications.type. */
export function isTypeEnabled(prefs: NotificationPreferences | null | undefined, type: NotificationType): boolean {
  return isCategoryEnabled(prefs, type);
}

export function isEligibleAlertEnabled(prefs: NotificationPreferences | null | undefined): boolean {
  return stored(prefs, "eligible_alerts") === true;
}

/** Email is an opt-in channel: off unless the user turned it on. */
export function isEmailChannelEnabled(prefs: NotificationPreferences | null | undefined): boolean {
  return stored(prefs, "channel_email") === true;
}

/** Resolves every key to a concrete boolean, for rendering the Settings
 *  toggles — the same defaulting rules as the functions above. */
export function resolvePreferences(prefs: NotificationPreferences | null | undefined): Record<PreferenceKey, boolean> {
  return {
    new_notification: isCategoryEnabled(prefs, "new_notification"),
    deadline: isCategoryEnabled(prefs, "deadline"),
    exam_date: isCategoryEnabled(prefs, "exam_date"),
    admit_card: isCategoryEnabled(prefs, "admit_card"),
    answer_key: isCategoryEnabled(prefs, "answer_key"),
    result: isCategoryEnabled(prefs, "result"),
    eligibility: isCategoryEnabled(prefs, "eligibility"),
    application_requests: isCategoryEnabled(prefs, "application_requests"),
    system: isCategoryEnabled(prefs, "system"),
    eligible_alerts: isEligibleAlertEnabled(prefs),
    channel_email: isEmailChannelEnabled(prefs),
  };
}

export function isPreferenceKey(value: string): value is PreferenceKey {
  return (PREFERENCE_KEYS as readonly string[]).includes(value);
}

/** Labels for the Settings screen (client-safe). */
export const PREFERENCE_LABELS: { key: PreferenceKey; label: string; description: string }[] = [
  { key: "new_notification", label: "New recruitment notifications", description: "A new official notification for an exam you follow" },
  { key: "deadline", label: "Deadlines", description: "Last-date changes and 7 / 3 / 1-day reminders" },
  { key: "exam_date", label: "Exam dates", description: "When an official exam date is announced or changed" },
  { key: "admit_card", label: "Admit cards & city intimation", description: "Admit card and exam city releases" },
  { key: "answer_key", label: "Answer keys & objection windows", description: "Answer keys, response sheets and objection windows" },
  { key: "result", label: "Results & cut-offs", description: "Results, scorecards and official cut-offs" },
  { key: "eligibility", label: "Eligibility changes", description: "When your eligibility result for an exam you follow changes" },
  { key: "application_requests", label: "Application assistance updates", description: "Status changes and messages on your assistance requests" },
  { key: "system", label: "Other official updates", description: "Corrigenda and other official notices" },
  { key: "eligible_alerts", label: "Exams that match my profile", description: "Alert me about new exams I'm potentially eligible for, even if I haven't saved them. Off by default." },
  { key: "channel_email", label: "Also email me", description: "Send these alerts to your email as well, once email delivery is set up. Off by default." },
];
