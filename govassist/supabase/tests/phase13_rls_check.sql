-- Phase 13 manual RLS check for exam_stage_updates and the new notifications columns.
-- Run in the Supabase SQL editor AFTER migration 0019. Everything is rolled back.
-- Replace :cycle_pub with a real PUBLISHED exam_cycles id and :cycle_draft with a
-- real NON-published (draft/archived) one, and :user_a with a real auth.users id.
-- The vitest suite uses an in-memory store and cannot test RLS.
begin;
\set user_a      '00000000-0000-0000-0000-00000000000a'
\set cycle_pub   '00000000-0000-0000-0000-0000000000c1'
\set cycle_draft '00000000-0000-0000-0000-0000000000c2'

insert into public.exam_stage_updates (exam_cycle_id, update_type, title, organization, source_url, official_page_url, series_key, document_key, verification, is_latest)
values (:'cycle_pub',   'answer_key', 'Answer Key', 'Org', 'https://x.gov.in/a.pdf', 'https://x.gov.in', 'k', 'd1', 'auto_verified', true),
       (:'cycle_draft', 'answer_key', 'Answer Key', 'Org', 'https://x.gov.in/b.pdf', 'https://x.gov.in', 'k', 'd2', 'auto_verified', true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_a')::text, true);
select count(*) as sees_published_cycle_updates from public.exam_stage_updates;   -- EXPECT 1 (draft-cycle row hidden)
-- EXPECT 0 rows changed (no UPDATE policy): a user cannot edit or demote history
update public.exam_stage_updates set is_latest = false;
-- EXPECT ERROR (no INSERT policy):
-- insert into public.exam_stage_updates (exam_cycle_id, update_type, title, organization, source_url, official_page_url, series_key, document_key, verification)
-- values (:'cycle_pub', 'result', 'Fake', 'Org', 'https://evil', 'https://evil', 'k2', 'd3', 'auto_verified');
rollback;
