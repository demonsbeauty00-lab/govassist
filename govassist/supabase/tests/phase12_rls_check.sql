-- Phase 12 manual RLS check for exam_eligibility_results / _cycle_state.
-- Run in the Supabase SQL editor AFTER migration 0018. Everything is rolled
-- back. Replace the ids with two real, different auth.users ids and one real
-- exam_cycles id. The vitest suite uses a fake database and cannot test RLS.
begin;
\set user_a '00000000-0000-0000-0000-00000000000a'
\set user_b '00000000-0000-0000-0000-00000000000b'
\set cycle  '00000000-0000-0000-0000-0000000000c1'

insert into public.exam_eligibility_results (user_id, exam_cycle_id, category, rules_fingerprint, profile_fingerprint)
values (:'user_a', :'cycle', 'potentially_eligible', 'x', 'y');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_a')::text, true);
select count(*) as a_sees_own from public.exam_eligibility_results;               -- EXPECT 1
-- EXPECT 0 rows changed (no UPDATE policy): a user can't promote their own result
update public.exam_eligibility_results set category = 'likely_not_eligible';
-- EXPECT ERROR (no INSERT policy):
-- insert into public.exam_eligibility_results (user_id, exam_cycle_id, category, rules_fingerprint, profile_fingerprint)
-- values (:'user_a', :'cycle', 'potentially_eligible', 'x', 'y');
select count(*) as a_sees_state from public.exam_eligibility_cycle_state;         -- EXPECT 0

select set_config('request.jwt.claims', json_build_object('sub', :'user_b')::text, true);
select count(*) as b_sees_a_results from public.exam_eligibility_results;         -- EXPECT 0
rollback;
