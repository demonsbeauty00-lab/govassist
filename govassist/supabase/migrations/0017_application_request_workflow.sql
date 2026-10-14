-- ============================================================================
-- Phase 11: Manual Application Assistance workflow + official-stage tracking.
--
-- Forward-only extension of 0016 (which is NOT edited). No new request/status
-- tables: the same three tables gain what the workflow needs.
--
--  1. application_requests.status gains three values:
--       form_filled            admin filled the form; applicant must review
--       awaiting_user_action   applicant must do a step only they can do
--                              (declaration / payment / OTP / CAPTCHA / final submit)
--       submitted_on_portal    official submission CONFIRMED (reference number
--                              or confirmation document) — never inferred
--  2. A SEPARATE official_stage column tracks the official exam application
--     (not_submitted -> submitted -> admit_card -> exam_completed ->
--     answer_key -> result). "form_filled" never sets it.
--  3. exam_cycle_id / cycle_label / official_application_url: link a request
--     to a real exam_cycles row so verified official updates reach its users.
--  4. application_request_assignments: which admin claimed a request. RLS is
--     enabled with NO policies, so only the service role (admin server
--     actions) can read it — applicants never see who/what is assigned.
--  5. New event types + events.official_stage + events.dedupe_key (unique per
--     request) so an official update is recorded at most once per request.
--
-- RLS is not weakened. The applicant insert policy is tightened so a user
-- cannot create a request that claims an official stage.
-- ============================================================================

-- 1. Widen the status check (name looked up, as in 0012/0014).
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.application_requests'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%''under_review''%';
  if c is not null then
    execute format('alter table public.application_requests drop constraint %I', c);
  end if;
  alter table public.application_requests add constraint application_requests_status_check
    check (status in ('submitted','under_review','waiting_for_user','in_progress',
                      'form_filled','awaiting_user_action','submitted_on_portal',
                      'completed','rejected','cancelled'));
end $$;

-- 2/3. New columns.
alter table public.application_requests
  add column if not exists exam_cycle_id uuid references public.exam_cycles(id) on delete set null,
  add column if not exists cycle_label text check (cycle_label is null or char_length(cycle_label) <= 120),
  add column if not exists official_application_url text
    check (official_application_url is null or char_length(official_application_url) <= 500),
  add column if not exists official_stage text not null default 'not_submitted'
    check (official_stage in ('not_submitted','submitted','admit_card','exam_completed','answer_key','result')),
  add column if not exists submitted_on_portal_at timestamptz,
  add column if not exists user_action_note text check (user_action_note is null or char_length(user_action_note) <= 2000);

create index if not exists idx_application_requests_cycle
  on public.application_requests (exam_cycle_id) where exam_cycle_id is not null;
create index if not exists idx_application_requests_slug
  on public.application_requests (exam_slug) where exam_slug is not null;

-- Every non-terminal status is "active" for duplicate protection.
drop index if exists public.uq_application_requests_active;
create unique index uq_application_requests_active
  on public.application_requests (user_id, exam_key, assistance_type)
  where status in ('submitted','under_review','waiting_for_user','in_progress',
                   'form_filled','awaiting_user_action','submitted_on_portal');

-- Tighten the applicant insert policy (same name, stricter check).
drop policy if exists "application_requests_insert_own" on public.application_requests;
create policy "application_requests_insert_own" on public.application_requests
  for insert with check (
    auth.uid() = user_id
    and status = 'submitted'
    and official_stage = 'not_submitted'
    and official_reference_number is null
    and admin_message is null
    and completed_at is null
    and submitted_on_portal_at is null
    and user_action_note is null
  );

-- 4. Assignments (admin-only by construction: RLS on, zero policies).
create table if not exists public.application_request_assignments (
  request_id uuid primary key references public.application_requests(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now()
);
alter table public.application_request_assignments enable row level security;

-- 5. Events.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.application_request_events'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%''document_viewed''%';
  if c is not null then
    execute format('alter table public.application_request_events drop constraint %I', c);
  end if;
  alter table public.application_request_events add constraint application_request_events_event_type_check
    check (event_type in (
      'submitted','status_changed','admin_message','info_requested','user_reply',
      'internal_note','reference_added','confirmation_uploaded','document_added',
      'documents_deleted','cancelled_by_user','document_viewed',
      'admin_claimed','form_filling_started','user_review_approved','user_changes_requested',
      'user_action_completed','official_update','cycle_linked','notification_failed'));
end $$;

alter table public.application_request_events
  add column if not exists official_stage text
    check (official_stage is null or official_stage in ('submitted','admit_card','exam_completed','answer_key','result','deadline','notice')),
  add column if not exists dedupe_key text;

create unique index if not exists uq_application_request_events_dedupe
  on public.application_request_events (request_id, dedupe_key) where dedupe_key is not null;
