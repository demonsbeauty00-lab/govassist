-- ============================================================================
-- Phase 14: central notification engine.
--
-- Reuses the existing `notifications` table (0001) and its (user_id,
-- dedupe_key) unique index (0013). No second notification table.
--
--  1. notifications gains event_type, link_url (internal path only, enforced
--     by a CHECK) and read_at.
--  2. Users may only change is_read / read_at on their own rows (column-level
--     grant + a WITH CHECK on the policy). They could previously rewrite any
--     column of their own rows, including title/body.
--  3. notification_deliveries: per-channel delivery tracking for channels
--     OTHER than in-app (the notification row itself is the in-app delivery).
--     States: pending -> sent (provider ACCEPTED it) -> delivered (provider
--     CONFIRMED it, via webhook) | failed | skipped. Written only by the
--     service role; a user may read their own rows.
--  4. Indexes for the inbox list, the unread count and the retry sweep.
-- ============================================================================

-- 1. notifications additions.
alter table public.notifications
  add column if not exists event_type text,
  add column if not exists link_url text,
  add column if not exists read_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.notifications'::regclass and conname = 'notifications_link_url_internal'
  ) then
    alter table public.notifications add constraint notifications_link_url_internal
      check (link_url is null or (link_url like '/%' and link_url not like '//%' and char_length(link_url) <= 300));
  end if;
end $$;

-- Rows that were already read keep a read_at so the two fields agree.
update public.notifications set read_at = created_at where is_read and read_at is null;

-- 2. Users may update only the read markers of their own rows.
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke update on public.notifications from anon, authenticated;
grant update (is_read, read_at) on public.notifications to authenticated;

-- 3. Delivery tracking for non-in-app channels.
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  attempts int not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);

alter table public.notification_deliveries enable row level security;

drop policy if exists "notification_deliveries_select_own" on public.notification_deliveries;
create policy "notification_deliveries_select_own" on public.notification_deliveries
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: only the service-role engine writes.

-- 4. Indexes.
create index if not exists idx_notifications_user_created on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_unread on public.notifications (user_id) where not is_read;
create index if not exists idx_notification_deliveries_retry
  on public.notification_deliveries (next_attempt_at) where status in ('failed', 'pending');
create unique index if not exists uq_notification_deliveries_provider_msg
  on public.notification_deliveries (provider_message_id) where provider_message_id is not null;
