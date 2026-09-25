import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { Database } from "@/lib/supabase/database.types";

type NotificationType = Database["public"]["Tables"]["notifications"]["Row"]["type"];
type NotificationPreferences = Database["public"]["Tables"]["profiles"]["Row"]["notification_preferences"];

interface SavedProfileRow {
  user_id: string;
  notification_preferences: NotificationPreferences;
}

/**
 * Notifies every user who has saved the given exam (by slug — see
 * lib/actions/saved-exams.ts for why bookmarks are slug-based) about a
 * real, published update. Deliberately factual, never a claim of
 * eligibility — "do not claim eligibility solely because a notification
 * was detected" (requirement 9). This uses the admin client because
 * finding "every user who saved X" is a cross-user query no RLS policy
 * should ever allow a normal request to make.
 */
export async function notifySavedUsers(params: {
  examSlug: string;
  title: string;
  body: string;
  type: NotificationType;
  jobNotificationId?: string;
}): Promise<{ notified: number }> {
  const supabase = createAdminClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, notification_preferences")
    .contains("saved_exam_slugs", [params.examSlug]);

  if (error || !profiles || profiles.length === 0) {
    return { notified: 0 };
  }

  const recipients = profiles.filter((p: SavedProfileRow) => {
    const prefs = p.notification_preferences ?? {};
    // A missing key defaults to enabled — see the migration's column comment.
    return prefs[params.type as keyof typeof prefs] !== false;
  });

  if (recipients.length === 0) return { notified: 0 };

  const { error: insertError } = await supabase.from("notifications").insert(
    recipients.map((p: SavedProfileRow) => ({
      user_id: p.user_id,
      job_notification_id: params.jobNotificationId ?? null,
      title: params.title,
      body: params.body,
      type: params.type,
    }))
  );

  if (insertError) return { notified: 0 };
  return { notified: recipients.length };
}
