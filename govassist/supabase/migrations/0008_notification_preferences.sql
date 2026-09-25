-- ============================================================================
-- Phase 5.5: real notification preferences.
--
-- The Settings screen has had toggles for these since Phase 1 (deadline
-- reminders, admit card alerts, result alerts, SMS alerts) — they were
-- always local component state, never persisted. Now that the update
-- pipeline actually sends notifications, "allow notification preferences"
-- needs to be real: a user who turns off admit-card alerts should actually
-- stop receiving them, not just see the toggle flip in their own browser.
-- ============================================================================

alter table public.profiles
  add column if not exists notification_preferences jsonb not null default
    '{"deadline": true, "admit_card": true, "result": true, "system": true}';

comment on column public.profiles.notification_preferences is
  'Keys match notifications.type (deadline/admit_card/result/system). A missing key defaults to enabled — see lib/source-monitoring/notify.ts.';
