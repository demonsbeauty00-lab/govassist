-- Phase 14 manual RLS check for notifications + notification_deliveries.
-- Run in the Supabase SQL editor AFTER migration 0020. Everything is rolled back.
-- Replace the two ids with REAL auth.users ids. The vitest suite uses an
-- in-memory store and cannot prove RLS.
begin;
\set user_a '00000000-0000-0000-0000-00000000000a'
\set user_b '00000000-0000-0000-0000-00000000000b'

insert into public.notifications (user_id, title, body, type, dedupe_key, event_type, link_url)
values (:'user_a', 'A note', 'for A', 'system', 'rls:a', 'OFFICIAL_UPDATE', '/updates'),
       (:'user_b', 'B note', 'for B', 'system', 'rls:b', 'OFFICIAL_UPDATE', '/updates');
insert into public.notification_deliveries (notification_id, user_id, channel, status)
select id, user_id, 'email', 'sent' from public.notifications where dedupe_key in ('rls:a', 'rls:b');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_a')::text, true);

select count(*) as sees_own_notifications from public.notifications where dedupe_key like 'rls:%';        -- EXPECT 1
select count(*) as sees_own_deliveries    from public.notification_deliveries;                              -- EXPECT 1 (only A's)

-- Marking read works for own rows only.
update public.notifications set is_read = true, read_at = now() where dedupe_key = 'rls:a';                -- EXPECT 1 row
update public.notifications set is_read = true, read_at = now() where dedupe_key = 'rls:b';                -- EXPECT 0 rows (B's row)

-- A user cannot rewrite the content of their own notification (column grant):
-- EXPECT ERROR "permission denied for table notifications"
-- update public.notifications set title = 'forged' where dedupe_key = 'rls:a';

-- A user cannot create notifications or deliveries (no INSERT policy):
-- EXPECT ERROR (row-level security) for each:
-- insert into public.notifications (user_id, title, body, type) values (:'user_a', 'x', 'y', 'system');
-- insert into public.notification_deliveries (notification_id, user_id, channel) select id, user_id, 'email' from public.notifications limit 1;

-- A user cannot change delivery state (no UPDATE policy): EXPECT 0 rows
update public.notification_deliveries set status = 'delivered';

-- link_url must be an internal path (CHECK, enforced for every role): EXPECT ERROR
-- insert into public.notifications (user_id, title, body, type, link_url) values (:'user_a', 'x', 'y', 'system', 'https://evil.example');
rollback;
