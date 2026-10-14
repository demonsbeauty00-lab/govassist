-- ============================================================================
-- Phase 11 — MANUAL RLS / access-isolation check. Run in the Supabase SQL
-- editor AFTER applying migrations 0016 + 0017. It changes nothing: every
-- statement runs inside a transaction that is rolled back.
--
-- Replace the two UUIDs below with two REAL, different user ids from
-- auth.users (user A owns a request, user B is a stranger). Nothing here is
-- automated — the vitest suite uses a fake database and cannot test RLS.
-- ============================================================================
begin;

-- >>> EDIT THESE <<<
\set user_a '00000000-0000-0000-0000-00000000000a'
\set user_b '00000000-0000-0000-0000-00000000000b'

-- Seed (as the table owner, bypassing RLS): one request for A with one
-- user-visible and one internal event.
insert into public.application_requests (id, user_id, exam_title, exam_key, assistance_type, applicant_name,
  applicant_phone, consent_accepted_at, consent_version)
values ('11111111-1111-1111-1111-111111111111', :'user_a', 'RLS check exam', 'title:rls check exam',
  'full_application', 'RLS Check', '9876543210', now(), 'test');
insert into public.application_request_events (request_id, actor_role, event_type, visibility, message)
values ('11111111-1111-1111-1111-111111111111', 'admin', 'admin_message', 'user', 'visible'),
       ('11111111-1111-1111-1111-111111111111', 'admin', 'internal_note', 'internal', 'SECRET');
insert into public.application_request_assignments (request_id, admin_id)
values ('11111111-1111-1111-1111-111111111111', :'user_b');

-- ---- As user A (the owner) -------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_a')::text, true);

-- EXPECT 1 row
select count(*) as a_sees_own_request from public.application_requests where id = '11111111-1111-1111-1111-111111111111';
-- EXPECT 1 (the user-visible event only — never the internal note)
select count(*) as a_sees_events from public.application_request_events where request_id = '11111111-1111-1111-1111-111111111111';
-- EXPECT 0 (no policy at all on assignments)
select count(*) as a_sees_assignments from public.application_request_assignments;
-- EXPECT ERROR (users can't claim an official stage on insert)
-- insert into public.application_requests (user_id, exam_title, exam_key, assistance_type, applicant_name, applicant_phone,
--   consent_accepted_at, consent_version, official_stage)
-- values (:'user_a', 'x', 'k', 'full_application', 'n', '9876543210', now(), 't', 'result');
-- EXPECT 0 rows updated (no UPDATE policy)
update public.application_requests set status = 'completed' where id = '11111111-1111-1111-1111-111111111111';

-- ---- As user B (a stranger) ------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'user_b')::text, true);

-- EXPECT 0 for all three
select count(*) as b_sees_request from public.application_requests where id = '11111111-1111-1111-1111-111111111111';
select count(*) as b_sees_events from public.application_request_events where request_id = '11111111-1111-1111-1111-111111111111';
select count(*) as b_sees_assignments from public.application_request_assignments;

rollback;
