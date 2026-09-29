-- ============================================================================
-- Phase 8: automatic, relevance-targeted notifications.
--
-- One genuinely missing structure: a database-level guard against sending
-- the same notification to the same user twice. Until now nothing stopped
-- a re-approved update (or two overlapping recipient groups — e.g. someone
-- who both saved an exam AND matches its eligibility) from producing
-- duplicate rows; the fan-out code in lib/source-monitoring/ can be written
-- to avoid it, but "can be written to avoid it" isn't a guarantee — a
-- unique index is.
--
-- `dedupe_key` is a short caller-chosen string that identifies the EVENT
-- being notified about (e.g. `update:<detected_update_id>` or
-- `answerkey:<paper_id>:v<version>`). Uniqueness is per (user_id,
-- dedupe_key). Existing rows and any future notification that doesn't need
-- this guarantee simply leave it null — Postgres treats NULLs as distinct
-- in a unique index, so those are unaffected. This is deliberately a plain
-- (non-partial) unique index: PostgREST's `on_conflict` can only infer a
-- plain unique index, which is what lets callers use
-- `.upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })`.
--
-- No RLS change: `notifications` keeps its existing per-user policies, and
-- fan-out inserts still go through the service-role client.
--
-- Note on notification_preferences: the `eligible_alerts` key (alerts about
-- exams matching your profile that you haven't saved) needs NO schema
-- change — notification_preferences is already a jsonb column (0008). The
-- key simply defaults to OFF when absent (see
-- lib/notifications/preferences.ts), the opposite of the other four keys,
-- because it's the one category that reaches users who never asked about
-- a specific exam.
-- ============================================================================

alter table public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists idx_notifications_user_dedupe_key
  on public.notifications (user_id, dedupe_key);
