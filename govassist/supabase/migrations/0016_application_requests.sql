-- ============================================================================
-- Phase 10 (revised): Manual Application Assistance.
--
-- Replaces the automatic-autofill product direction. Users submit an
-- assistance REQUEST; an authorized GovAssist admin processes it manually,
-- outside GovAssist. Nothing here automates any official portal, and no
-- portal passwords, OTPs, CAPTCHA answers or payment details are stored.
--
-- Forward-only: migration 0015 (application_sessions / _fields / audit_log)
-- may already be applied somewhere, so it is NOT edited. Those three tables
-- are simply no longer used by the app. They stay in place (RLS-protected);
-- dropping them is a separate, deliberate decision.
--
-- Three tables, all RLS-enabled:
--   application_requests           the request itself + current status
--   application_request_documents  metadata for files in the PRIVATE
--                                  `documents` bucket (no new bucket, no new
--                                  storage policy: the existing owner-only
--                                  policies key off the first path segment =
--                                  user id, and these files live under
--                                  <user_id>/application-requests/<id>/...)
--   application_request_events     append-only history + messages + audit.
--                                  visibility 'internal' rows (admin notes)
--                                  are never readable by the applicant.
--
-- Write model:
--   * Users may SELECT their own rows and INSERT a new request / their own
--     reply events / their own document rows (all checked by policy).
--   * Users have NO update/delete policy. Cancelling, replying (status flip)
--     and deleting uploaded files go through server actions that verify
--     ownership first.
--   * Admin reads/writes use the service-role client in server actions after
--     requireAdmin() — no admin RLS policies exist, so nothing is opened up.
--
-- Retention: `purge_after` is set (+90 days) when a request reaches a
-- terminal state. Applicants can delete their uploaded files themselves once
-- the request is closed. There is no automatic purge job yet — see the
-- phase report.
-- ============================================================================

create table if not exists public.application_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique
    default ('AR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_slug text,
  exam_title text not null check (char_length(exam_title) between 1 and 200),
  exam_key text not null,
  notification_url text check (notification_url is null or char_length(notification_url) <= 500),
  application_deadline date,
  post_applied text check (post_applied is null or char_length(post_applied) <= 200),
  assistance_type text not null
    check (assistance_type in ('full_application', 'form_review', 'document_check')),
  applicant_name text not null check (char_length(applicant_name) between 1 and 120),
  applicant_phone text not null check (applicant_phone ~ '^[6-9][0-9]{9}$'),
  details text check (details is null or char_length(details) <= 2000),
  consent_accepted_at timestamptz not null,
  consent_version text not null,
  status text not null default 'submitted'
    check (status in ('submitted','under_review','waiting_for_user','in_progress','completed','rejected','cancelled')),
  latest_update text,
  admin_message text,
  official_reference_number text check (official_reference_number is null or char_length(official_reference_number) <= 100),
  completed_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Database-level guard against accidental double submission: one ACTIVE
-- request per user + exam + assistance type.
create unique index if not exists uq_application_requests_active
  on public.application_requests (user_id, exam_key, assistance_type)
  where status in ('submitted','under_review','waiting_for_user','in_progress');

create index if not exists idx_application_requests_user
  on public.application_requests (user_id, created_at desc);
create index if not exists idx_application_requests_status
  on public.application_requests (status, created_at desc);

alter table public.application_requests enable row level security;

create policy "application_requests_select_own" on public.application_requests
  for select using (auth.uid() = user_id);
create policy "application_requests_insert_own" on public.application_requests
  for insert with check (
    auth.uid() = user_id
    and status = 'submitted'
    and official_reference_number is null
    and admin_message is null
    and completed_at is null
  );

create table if not exists public.application_request_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.application_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'supporting' check (kind in ('supporting', 'confirmation')),
  uploaded_by text not null default 'user' check (uploaded_by in ('user', 'admin')),
  purpose text check (purpose is null or char_length(purpose) <= 200),
  storage_path text not null,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create index if not exists idx_application_request_documents_request
  on public.application_request_documents (request_id);

alter table public.application_request_documents enable row level security;

create policy "application_request_documents_select_own" on public.application_request_documents
  for select using (auth.uid() = user_id);
create policy "application_request_documents_insert_own" on public.application_request_documents
  for insert with check (
    auth.uid() = user_id
    and uploaded_by = 'user'
    and kind = 'supporting'
    and exists (select 1 from public.application_requests r
                where r.id = request_id and r.user_id = auth.uid()));

create table if not exists public.application_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.application_requests(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('user', 'admin', 'system')),
  event_type text not null check (event_type in (
    'submitted','status_changed','admin_message','info_requested','user_reply',
    'internal_note','reference_added','confirmation_uploaded','document_added',
    'documents_deleted','cancelled_by_user','document_viewed')),
  from_status text,
  to_status text,
  message text check (message is null or char_length(message) <= 2000),
  visibility text not null default 'user' check (visibility in ('user', 'internal')),
  created_at timestamptz not null default now()
);

create index if not exists idx_application_request_events_request
  on public.application_request_events (request_id, created_at);

alter table public.application_request_events enable row level security;

-- Applicants only ever see rows marked visible to them.
create policy "application_request_events_select_own_visible" on public.application_request_events
  for select using (
    visibility = 'user'
    and exists (select 1 from public.application_requests r
                where r.id = request_id and r.user_id = auth.uid()));
create policy "application_request_events_insert_own" on public.application_request_events
  for insert with check (
    actor_id = auth.uid()
    and actor_role = 'user'
    and visibility = 'user'
    and event_type in ('submitted', 'user_reply', 'document_added')
    and exists (select 1 from public.application_requests r
                where r.id = request_id and r.user_id = auth.uid()));
