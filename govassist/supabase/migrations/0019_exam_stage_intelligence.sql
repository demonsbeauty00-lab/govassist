-- ============================================================================
-- Phase 13: Automated exam stage intelligence.
--
-- Forward-only extension of 0007 (Phase 5.5 monitoring). Earlier migrations
-- are NOT edited.
--
--  1. detected_updates.update_type gains 'exam_city_intimation' and 'scorecard'.
--  2. detected_updates gains: event_date (the date the OFFICIAL notice states
--     for the stage itself, e.g. the exam date - distinct from
--     publication_date), cycle_match (how the exam cycle was identified),
--     series_key + is_revision (for version tracking).
--  3. exam_cycles gains exam_date/exam_date_end and three official links.
--  4. exam_stage_updates: the USER-FACING, published projection of verified
--     updates. One row per published detected update. History is preserved:
--     a revised document marks older rows is_latest=false and points them at
--     the newer row (superseded_by). Public-read only for published cycles;
--     no write policies (service role only).
--  5. notifications gains organization / source_url / published_on /
--     stage_update_id so every alert carries its official provenance.
--  6. source_audit_log.event_type gains 'superseded' and 'cycle_unmatched'.
-- ============================================================================

-- 1. Widen detected_updates.update_type (name looked up, as in 0012/0014/0017).
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.detected_updates'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%''new_notification''%';
  if c is not null then
    execute format('alter table public.detected_updates drop constraint %I', c);
  end if;
  alter table public.detected_updates add constraint detected_updates_update_type_check
    check (update_type in (
      'new_notification', 'corrigendum', 'application_start_date', 'application_end_date_change',
      'exam_date', 'admit_card', 'answer_key', 'response_sheet', 'objection_window',
      'result', 'cutoff', 'other', 'exam_city_intimation', 'scorecard'
    ));
end $$;

-- 2. detected_updates additions.
alter table public.detected_updates
  add column if not exists event_date date,
  add column if not exists cycle_match text
    check (cycle_match is null or cycle_match in ('cycle_label', 'exam_name', 'single_candidate', 'manual')),
  add column if not exists series_key text,
  add column if not exists is_revision boolean not null default false;

-- 3. exam_cycles additions (all nullable; null = not announced / not known).
alter table public.exam_cycles
  add column if not exists exam_date date,
  add column if not exists exam_date_end date,
  add column if not exists exam_city_intimation_url text,
  add column if not exists response_sheet_url text,
  add column if not exists scorecard_url text;

-- 4. exam_stage_updates.
create table if not exists public.exam_stage_updates (
  id uuid primary key default gen_random_uuid(),
  exam_cycle_id uuid not null references public.exam_cycles(id) on delete cascade,
  detected_update_id uuid references public.detected_updates(id) on delete set null,
  update_type text not null check (update_type in (
    'new_notification', 'corrigendum', 'application_start_date', 'application_end_date_change',
    'exam_date', 'admit_card', 'answer_key', 'response_sheet', 'objection_window',
    'result', 'cutoff', 'other', 'exam_city_intimation', 'scorecard'
  )),
  title text not null,
  organization text not null,
  publication_date date,          -- as stated on the official page/document; null if not determinable
  event_date date,                -- the stage's own date (e.g. exam date) if the notice states one
  source_url text not null,       -- the specific official document if known, else the official page
  official_page_url text not null,
  series_key text not null,       -- groups versions of "the same" document
  document_key text not null,     -- normalised document URL (duplicate guard)
  version int not null default 1 check (version >= 1),
  is_latest boolean not null default false,
  superseded_by uuid references public.exam_stage_updates(id) on delete set null,
  verification text not null check (verification in ('auto_verified', 'admin_verified')),
  published_at timestamptz not null default now()
);

-- One published row per detected update (makes publishing idempotent).
create unique index if not exists uq_exam_stage_updates_detected
  on public.exam_stage_updates (detected_update_id) where detected_update_id is not null;
-- The same document is never recorded twice for a cycle + stage.
create unique index if not exists uq_exam_stage_updates_document
  on public.exam_stage_updates (exam_cycle_id, update_type, document_key);
-- At most one "latest verified" version per cycle + stage + series.
create unique index if not exists uq_exam_stage_updates_latest
  on public.exam_stage_updates (exam_cycle_id, update_type, series_key) where is_latest;
create index if not exists idx_exam_stage_updates_cycle
  on public.exam_stage_updates (exam_cycle_id, published_at desc);

alter table public.exam_stage_updates enable row level security;

-- Readable only when its cycle is published (same visibility as exam_cycles).
drop policy if exists "exam_stage_updates_public_read" on public.exam_stage_updates;
create policy "exam_stage_updates_public_read" on public.exam_stage_updates
  for select using (
    exists (select 1 from public.exam_cycles c where c.id = exam_cycle_id and c.status = 'published')
  );
-- No insert/update/delete policies: only the service-role pipeline writes.

-- 5. notifications provenance.
alter table public.notifications
  add column if not exists organization text,
  add column if not exists source_url text,
  add column if not exists published_on date,
  add column if not exists stage_update_id uuid references public.exam_stage_updates(id) on delete set null;

-- 6. Audit event types.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.source_audit_log'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%''duplicate_skipped''%';
  if c is not null then
    execute format('alter table public.source_audit_log drop constraint %I', c);
  end if;
  alter table public.source_audit_log add constraint source_audit_log_event_type_check
    check (event_type in ('checked', 'check_succeeded', 'check_failed', 'change_detected',
                          'duplicate_skipped', 'published', 'reviewed', 'superseded', 'cycle_unmatched'));
end $$;
