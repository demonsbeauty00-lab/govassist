-- ============================================================================
-- Phase 15: automation control center.
--
-- Forward-only. Earlier migrations are NOT edited. Everything here is
-- admin/internal: normal users have no access to any of these tables.
--
--  1. notification_sources.consecutive_failures - how many checks in a row have
--     failed (fetch errors), reset on success. Lets the dashboard tell "one
--     blip" from "this source has been down for days" without inventing data.
--  2. admin_audit_log - append-only record of every admin ACTION taken from the
--     control center (re-check a source, disable it, clear a maintenance flag,
--     retry a publish or deliveries). Request-level admin actions keep using
--     application_request_events; source review decisions keep using
--     source_audit_log. Admins may READ it (policy); only the service role writes.
--  3. automation_job_runs - one row per scheduled run (cron), so the dashboard
--     can show when each job last ran and whether it finished.
--  4. notification_job_log - one row per notification batch with the outcome
--     counts (created / duplicate prevented / disabled by preference / failed),
--     so "duplicate prevented" is a recorded fact rather than a guess.
-- ============================================================================

-- 1.
alter table public.notification_sources
  add column if not exists consecutive_failures int not null default 0 check (consecutive_failures >= 0);

-- 2.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'source_recheck', 'source_enabled', 'source_disabled', 'source_maintenance_cleared',
    'update_publish_retried', 'deliveries_requeued')),
  target_type text not null check (target_type in ('notification_source', 'detected_update', 'notification_delivery')),
  target_id text,
  outcome text not null check (outcome in ('success', 'failed', 'refused')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_created on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_log_target on public.admin_audit_log (target_type, target_id);

alter table public.admin_audit_log enable row level security;

drop policy if exists "admin_audit_log_select_admin" on public.admin_audit_log;
create policy "admin_audit_log_select_admin" on public.admin_audit_log
  for select using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
-- No insert/update/delete policy: the log cannot be written or edited from a user session.

-- 3.
create table if not exists public.automation_job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in ('check_sources', 'check_pyq_sources')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb not null default '{}'::jsonb
);
create index if not exists idx_automation_job_runs_job on public.automation_job_runs (job, started_at desc);
alter table public.automation_job_runs enable row level security;
-- No policies: service role only (the dashboard reads it after an admin check).

-- 4.
create table if not exists public.notification_job_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text,
  drafts int not null default 0 check (drafts >= 0),
  created int not null default 0 check (created >= 0),
  duplicates int not null default 0 check (duplicates >= 0),
  disabled int not null default 0 check (disabled >= 0),
  failed int not null default 0 check (failed >= 0)
);
create index if not exists idx_notification_job_log_created on public.notification_job_log (created_at desc);
alter table public.notification_job_log enable row level security;
-- No policies: service role only.
