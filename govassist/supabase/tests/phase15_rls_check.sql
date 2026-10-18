-- Phase 15 manual RLS check for the control-center tables.
-- Run in the Supabase SQL editor AFTER migration 0021. Everything is rolled back.
-- Replace :admin_user with a REAL auth.users id that IS in public.admins, and
-- :normal_user with a REAL auth.users id that is NOT. vitest cannot prove RLS.
begin;
\set admin_user  '00000000-0000-0000-0000-0000000000ad'
\set normal_user '00000000-0000-0000-0000-00000000000b'

-- Seed (as the SQL editor's privileged role).
insert into public.admin_audit_log (admin_id, action, target_type, target_id, outcome, details)
values (:'admin_user', 'source_recheck', 'notification_source', 'x', 'success', '{}');
insert into public.automation_job_runs (job) values ('check_sources');
insert into public.notification_job_log (event_type, drafts, created) values ('RESULT_DECLARED', 1, 1);

-- 1. A normal signed-in user sees NOTHING from any of the three tables.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'normal_user')::text, true);
select count(*) as normal_sees_audit  from public.admin_audit_log;       -- EXPECT 0
select count(*) as normal_sees_runs   from public.automation_job_runs;   -- EXPECT 0
select count(*) as normal_sees_joblog from public.notification_job_log;  -- EXPECT 0
select count(*) as normal_sees_sources from public.notification_sources; -- EXPECT 0 (unchanged since 0007)

-- 2. An admin can READ the audit log through RLS, but still cannot write it.
select set_config('request.jwt.claims', json_build_object('sub', :'admin_user')::text, true);
select count(*) as admin_sees_audit from public.admin_audit_log;         -- EXPECT >= 1
-- EXPECT ERROR (no INSERT policy) - the log can only be written by the server:
-- insert into public.admin_audit_log (admin_id, action, target_type, outcome) values (:'admin_user', 'source_recheck', 'notification_source', 'success');
-- EXPECT 0 rows (no UPDATE / DELETE policy) - the log cannot be edited or erased:
update public.admin_audit_log set outcome = 'failed';
delete from public.admin_audit_log;
rollback;
