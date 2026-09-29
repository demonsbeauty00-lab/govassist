// ---------------------------------------------------------------------------
// Who should hear about a verified official update?  Pure and deterministic
// — no I/O — so the targeting rules can be unit tested and audited without a
// database. The fetching of candidates lives in
// lib/source-monitoring/notify-relevant.ts; this file only decides.
//
// Principles (from the phase brief): never notify everyone, never notify
// someone irrelevant, never notify twice, always honor preferences.
//
//   applied  — the user recorded an application for this cycle. Hears about
//              every update type (deadline changes, admit card, results…).
//   saved    — the user added the exam to My Exams. Hears about every type
//              (this is the pre-existing Phase 5.5 behavior, unchanged).
//   eligible — the deterministic eligibility engine says "potentially
//              eligible", the user opted in (eligible_alerts), and the exam's
//              category matches their preferred categories (if they set any).
//              Only for DISCOVERY updates — a new notification or applications
//              opening. An eligible-but-uninterested user is never pinged
//              about a corrigendum or an answer key for an exam they never
//              followed.
// ---------------------------------------------------------------------------

import { Database } from "@/lib/supabase/database.types";
import { isEligibleAlertEnabled, isTypeEnabled, NotificationPreferences, NotificationType } from "./preferences";

export type UpdateType = Database["public"]["Tables"]["detected_updates"]["Row"]["update_type"];
export type RecipientReason = "applied" | "saved" | "eligible";

/** Which preference key governs an update. Deadline-related changes are
 *  'deadline' (so someone who turned off deadline reminders really stops
 *  getting them); answer keys ride with results; everything else is
 *  'system'. */
export function notificationTypeForUpdate(updateType: UpdateType): NotificationType {
  switch (updateType) {
    case "application_start_date":
    case "application_end_date_change":
      return "deadline";
    case "admit_card":
      return "admit_card";
    case "result":
    case "answer_key":
    case "response_sheet":
    case "cutoff":
      return "result";
    default:
      return "system";
  }
}

/** The only updates worth interrupting someone who hasn't followed the exam. */
export function isDiscoveryUpdate(updateType: UpdateType): boolean {
  return updateType === "new_notification" || updateType === "application_start_date";
}

export interface RecipientCandidate {
  userId: string;
  preferences: NotificationPreferences | null;
  preferredCategories: string[];
  applied: boolean;
  saved: boolean;
  /** Result of the deterministic engine for THIS exam cycle — only ever
   *  true for 'potentially_eligible'; needs_review never counts. */
  potentiallyEligible: boolean;
}

export interface Recipient {
  userId: string;
  reason: RecipientReason;
}

export function decideRecipients(params: {
  updateType: UpdateType;
  examCategory: string | null;
  candidates: RecipientCandidate[];
}): Recipient[] {
  const type = notificationTypeForUpdate(params.updateType);
  const discovery = isDiscoveryUpdate(params.updateType);
  const seen = new Set<string>();
  const recipients: Recipient[] = [];

  for (const c of params.candidates) {
    if (seen.has(c.userId)) continue; // never notify one user twice
    if (!isTypeEnabled(c.preferences, type)) continue;

    let reason: RecipientReason | null = null;
    if (c.applied) reason = "applied";
    else if (c.saved) reason = "saved";
    else if (discovery && c.potentiallyEligible && isEligibleAlertEnabled(c.preferences)) {
      const matchesInterests =
        c.preferredCategories.length === 0 || (params.examCategory !== null && c.preferredCategories.includes(params.examCategory));
      if (matchesInterests) reason = "eligible";
    }

    if (reason) {
      seen.add(c.userId);
      recipients.push({ userId: c.userId, reason });
    }
  }
  return recipients;
}

/** One honest line saying why this person got the notification — so it
 *  never reads as a claim of eligibility or as unexplained spam. */
export function reasonLine(reason: RecipientReason): string {
  switch (reason) {
    case "applied":
      return "You're getting this because you recorded an application for this exam.";
    case "saved":
      return "You're getting this because you saved this exam.";
    case "eligible":
      return "You're getting this because your profile appears to match this exam's published criteria. Check the official notification before applying.";
  }
}
