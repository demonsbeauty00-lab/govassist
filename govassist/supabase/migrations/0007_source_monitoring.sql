-- ============================================================================
-- Phase 5.5: automatic official update monitoring pipeline.
--
-- Three new tables, all internal to the pipeline — none are readable by
-- anon/authenticated users. The only user-facing effects of this pipeline
-- are (a) updates to exam_cycles (already public-read when published, per
-- 0001_init.sql) and (b) real rows in the existing `notifications` table.
-- That split is deliberate: "GovAssist must never hide the official
-- source" is satisfied by exam_cycles always carrying
-- official_notification_url, not by exposing the raw pipeline internals.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. notification_sources — the registry of official pages/endpoints being
--    watched. One row per URL being monitored, not per exam — a single
--    organization's notices page might cover several exams.
-- ----------------------------------------------------------------------------
create table if not exists public.notification_sources (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  exam_id uuid references public.exams(id) on delete set null,
  official_url text not null,
  source_type text not null check (
    source_type in ('notification_page', 'pdf_index', 'admit_card_page', 'answer_key_page', 'result_page', 'other')
  ),
  enabled boolean not null default true,
  check_frequency_minutes int not null default 1440, -- default: once/day; the cron trigger's own
                                                        -- interval is a separate, coarser concern —
                                                        -- see app/api/cron/check-sources/route.ts
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  -- Set once a source's HTML/PDF structure changes enough that its parser
  -- stops working reliably — see requirement 16 ("mark the source as
  -- requiring parser maintenance"). A source in this state is skipped by
  -- the checker (not disabled outright, so its history/config is kept)
  -- until a person updates parser_version to match a fixed parser.
  needs_parser_maintenance boolean not null default false,
  parser_version text not null default 'v1',
  last_content_hash text, -- for change detection — see requirement 3
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (official_url)
);

alter table public.notification_sources enable row level security;
-- No policies for anon/authenticated: this table is never read by the app
-- directly. Only the service-role client (cron route, admin actions) and
-- direct Supabase-dashboard access can reach it.

create index if not exists idx_notification_sources_enabled on public.notification_sources(enabled) where enabled = true;
create index if not exists idx_notification_sources_exam on public.notification_sources(exam_id);

-- ----------------------------------------------------------------------------
-- 2. detected_updates — the staging area between "something changed on an
--    official page" and "this is now part of an exam's real record". This
--    is the pipeline's equivalent of documents.extracted_fields in Phase 3:
--    machine-extracted, never trusted at face value, always reviewed before
--    it becomes authoritative data — same shape, same principle, applied to
--    government notices instead of user documents.
-- ----------------------------------------------------------------------------
create table if not exists public.detected_updates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.notification_sources(id) on delete cascade,
  exam_cycle_id uuid references public.exam_cycles(id) on delete set null, -- linked once matched; null if this looks like a brand-new cycle

  update_type text not null check (
    update_type in (
      'new_notification', 'corrigendum', 'application_start_date', 'application_end_date_change',
      'exam_date', 'admit_card', 'answer_key', 'response_sheet', 'objection_window',
      'result', 'cutoff', 'other'
    )
  ),

  title text not null,
  official_url text not null,       -- the source page this was detected on
  document_url text,                -- the specific PDF/notice, if distinct from official_url
  publication_date date,            -- as stated on the official page/document, if determinable
  content_hash text not null,       -- hash of the fetched content this update was detected from

  -- Extracted fields, shaped exactly like documents.extracted_fields
  -- (label/value/confidence) — see lib/ocr/extract.ts's ExtractedField.
  -- Never applied to exam_cycles until classification + (if required)
  -- human review — see requirement 5 and 6.
  extracted_fields jsonb not null default '[]',

  classification text not null check (classification in ('auto_publish', 'needs_review', 'reject')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'published')),

  detected_at timestamptz not null default now(),
  processed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text
);

alter table public.detected_updates enable row level security;
-- No anon/authenticated policies — same reasoning as notification_sources.

create index if not exists idx_detected_updates_source on public.detected_updates(source_id);
create index if not exists idx_detected_updates_status on public.detected_updates(status);
create index if not exists idx_detected_updates_exam_cycle on public.detected_updates(exam_cycle_id);
-- Duplicate detection (requirement 3) leans on this: same source + same
-- content hash should never produce a second row.
create unique index if not exists idx_detected_updates_source_hash on public.detected_updates(source_id, content_hash);

-- ----------------------------------------------------------------------------
-- 3. source_audit_log — an append-only record of every check, change, and
--    review decision. Government notices get revised; this is what lets
--    someone reconstruct "what did we show, and when did it change" later.
-- ----------------------------------------------------------------------------
create table if not exists public.source_audit_log (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.notification_sources(id) on delete set null,
  detected_update_id uuid references public.detected_updates(id) on delete set null,
  event_type text not null check (
    event_type in ('checked', 'check_succeeded', 'check_failed', 'change_detected', 'duplicate_skipped', 'published', 'reviewed')
  ),
  previous_value jsonb,
  new_value jsonb,
  processing_status text,
  validation_status text,
  reviewer uuid references auth.users(id) on delete set null,
  notes text,
  detected_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.source_audit_log enable row level security;
-- No anon/authenticated policies — internal/admin-only, same as the two tables above.

create index if not exists idx_source_audit_log_source on public.source_audit_log(source_id);
create index if not exists idx_source_audit_log_detected_update on public.source_audit_log(detected_update_id);

-- ----------------------------------------------------------------------------
-- 4. exam_cycles additions — fields an official update can set that didn't
--    already exist, plus a stage-status column distinct from the derived,
--    dates-only status in lib/notifications/status.ts. `current_status` is
--    set explicitly by the pipeline when an official notice *confirms* a
--    stage (e.g. an objection-window notice) that can't be inferred from
--    dates alone; when null, the app's existing derived status still
--    applies — this column augments that logic, it doesn't replace it.
-- ----------------------------------------------------------------------------
alter table public.exam_cycles
  add column if not exists current_status text check (
    current_status is null or current_status in (
      'upcoming', 'applications_open', 'applications_closed', 'exam_date_announced',
      'admit_card_available', 'exam_completed', 'answer_key_available',
      'objection_window_open', 'result_declared', 'completed'
    )
  ),
  add column if not exists objection_window_start date,
  add column if not exists objection_window_end date,
  add column if not exists cutoff_summary text,
  add column if not exists admit_card_url text,
  add column if not exists answer_key_url text,
  add column if not exists result_url text;

comment on column public.exam_cycles.current_status is
  'Explicitly set by the update pipeline when an official notice confirms a stage. Null means: fall back to computeNotificationStatus() in lib/notifications/status.ts, which derives a status from dates alone.';
comment on column public.exam_cycles.cutoff_summary is
  'Freeform — official cutoffs vary too much in structure (per-category, per-post, per-region) to normalize into columns here.';
