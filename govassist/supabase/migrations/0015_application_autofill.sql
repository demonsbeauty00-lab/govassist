-- ============================================================================
-- Phase 10: Application Autofill Engine.
--
-- Three new tables, all user-owned and protected by RLS:
--
--   application_sessions       one row per "I'm applying to exam X" attempt.
--                              Pause/resume is just a status change.
--   application_session_fields one row per detected form field, with the
--                              classification (auto_fill / needs_review /
--                              user_action_required / unsupported), the
--                              confidence, the suggestion, and what the user
--                              finally confirmed.
--   application_audit_log      APPEND-ONLY history of important actions
--                              (select + insert policies only — no update or
--                              delete policy exists, so even the owner cannot
--                              rewrite history).
--
-- The existing `applications` table (0001) is reused and only written once
-- the user confirms they submitted on the real portal themselves.
--
-- exam_slug is the reliable key (the exam catalog is still partly sample
-- data in code); exam_cycle_id is an optional link to a real exam_cycles row.
--
-- No passwords, OTPs, CAPTCHA answers or payment details are ever stored:
-- those field types are always user_action_required and never get a value.
-- ============================================================================

create table if not exists public.application_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_slug text not null,
  exam_cycle_id uuid references public.exam_cycles(id) on delete set null,
  portal_adapter_id text not null,
  official_application_url text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress','paused','awaiting_user_action','ready_for_review','user_submitted','abandoned')),
  declaration_acknowledged_at timestamptz,
  started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_application_sessions_user
  on public.application_sessions (user_id, last_active_at desc);

alter table public.application_sessions enable row level security;

create policy "application_sessions_select_own" on public.application_sessions
  for select using (auth.uid() = user_id);
create policy "application_sessions_insert_own" on public.application_sessions
  for insert with check (auth.uid() = user_id);
create policy "application_sessions_update_own" on public.application_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.application_session_fields (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.application_sessions(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null
    check (field_type in ('text','date','select','radio','checkbox','file','captcha','otp','payment','declaration','other')),
  classification text not null
    check (classification in ('auto_fill','needs_review','user_action_required','unsupported')),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  source text check (source in ('profile','document','derived')),
  source_field text,
  suggested_value text,
  final_value text,
  status text not null default 'pending'
    check (status in ('pending','auto_filled','user_confirmed','user_edited','skipped','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, field_key)
);

create index if not exists idx_application_session_fields_session
  on public.application_session_fields (session_id);

alter table public.application_session_fields enable row level security;

create policy "application_session_fields_select_own" on public.application_session_fields
  for select using (exists (
    select 1 from public.application_sessions s
    where s.id = session_id and s.user_id = auth.uid()));
create policy "application_session_fields_insert_own" on public.application_session_fields
  for insert with check (exists (
    select 1 from public.application_sessions s
    where s.id = session_id and s.user_id = auth.uid()));
create policy "application_session_fields_update_own" on public.application_session_fields
  for update using (exists (
    select 1 from public.application_sessions s
    where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (
    select 1 from public.application_sessions s
    where s.id = session_id and s.user_id = auth.uid()));

create table if not exists public.application_audit_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.application_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'session_started','field_detected','field_autofilled','field_confirmed','field_edited',
    'field_skipped','user_action_required','declaration_acknowledged','session_paused',
    'session_resumed','submission_blocked','user_confirmed_submission','session_abandoned')),
  actor text not null check (actor in ('system','user')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_application_audit_log_session
  on public.application_audit_log (session_id, created_at);

alter table public.application_audit_log enable row level security;

-- Append-only: select + insert only. No update/delete policy on purpose.
create policy "application_audit_log_select_own" on public.application_audit_log
  for select using (auth.uid() = user_id);
create policy "application_audit_log_insert_own" on public.application_audit_log
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.application_sessions s
                where s.id = session_id and s.user_id = auth.uid()));
