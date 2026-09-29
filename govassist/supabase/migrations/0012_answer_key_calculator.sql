-- ============================================================================
-- Phase 7.5: Official Answer Key + Response Sheet Marks Calculator.
--
-- Deliberately reuses existing structures wherever the brief allows it:
--   - `papers` / `questions` / `question_options` already ARE an answer
--     key once published — this migration just adds the metadata needed
--     to version and track them (status, version number, publication
--     date, source), rather than a parallel "answer key" table.
--   - `paper_ingestion_runs` already tracks exactly the kind of event an
--     answer-key revision is (a source document was fetched and applied)
--     — `run_type` distinguishes the two without a new table.
--   - `paper_ingestion_audit_log` already has previous_value/new_value
--     jsonb columns built for exactly this kind of "what changed" record
--     — only its event_type allow-list needs extending.
--   - `paper_attempts` / `paper_attempt_answers` already ARE the scoring
--     storage — `attempt_source` distinguishes a GovAssist mock attempt
--     from a manually-entered real-exam response, and
--     `answer_key_version_at_submission` is the snapshot that lets a
--     later revision be detected as making an old attempt stale, without
--     a separate "calculations" table.
--
-- One genuinely new table: `response_sheet_uploads`. The existing
-- `documents` table was considered and rejected for this — it has a
-- `unique (user_id, document_type)` constraint (0002) meant for "one
-- Aadhaar, one 10th marksheet" identity documents, which would wrongly
-- cap a user at a single response sheet across every paper they ever
-- take. Storage itself IS reused, though: the existing `documents`
-- bucket's RLS policies key only on the path's first segment being the
-- uploader's own auth.uid() (see 0001_init.sql), so response sheets are
-- stored under `{user_id}/response-sheets/{paper_id}/...` in that same
-- bucket with no new bucket or storage policy required.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. papers — answer-key lifecycle metadata.
-- ----------------------------------------------------------------------------
alter table public.papers
  add column if not exists answer_key_status text check (answer_key_status is null or answer_key_status in ('provisional', 'revised', 'final')),
  add column if not exists answer_key_version int not null default 0,
  add column if not exists answer_key_published_at timestamptz,
  add column if not exists answer_key_source_url text;

-- ----------------------------------------------------------------------------
-- 2. questions — dropped/bonus/disputed handling (brief section 15).
--    'dropped' questions are excluded from scoring entirely (and from
--    maximum_marks); 'bonus_awarded' questions award full marks to every
--    candidate regardless of their answer; 'disputed' is purely
--    informational (shown to the user, doesn't change scoring by itself)
--    until an admin resolves it one way or the other. See
--    lib/scoring/answer-key-calculator.ts for where these are applied.
-- ----------------------------------------------------------------------------
alter table public.questions
  add column if not exists question_status_flag text not null default 'normal'
    check (question_status_flag in ('normal', 'dropped', 'bonus_awarded', 'disputed'));

-- ----------------------------------------------------------------------------
-- 3. paper_ingestion_runs — distinguish an answer-key revision run from
--    the paper's original ingestion run, so the existing table/audit
--    trail can be reused for both instead of building a parallel one.
-- ----------------------------------------------------------------------------
alter table public.paper_ingestion_runs
  add column if not exists run_type text not null default 'initial_ingestion'
    check (run_type in ('initial_ingestion', 'answer_key_update'));

-- ----------------------------------------------------------------------------
-- 4. paper_ingestion_audit_log — allow the new event type. Rather than
--    assuming Postgres's standard auto-generated name for 0010's unnamed
--    inline check (`paper_ingestion_audit_log_event_type_check`), this
--    looks up whatever check constraint actually exists on this table
--    whose definition mentions `event_type` and drops it by its real
--    name — safe regardless of how the live schema named it, including
--    if it was never created, was renamed, or the migration is re-run.
-- ----------------------------------------------------------------------------
do $$
declare
  existing_constraint_name text;
begin
  select con.conname into existing_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'paper_ingestion_audit_log'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%event_type%'
  limit 1;

  if existing_constraint_name is not null then
    execute format('alter table public.paper_ingestion_audit_log drop constraint %I', existing_constraint_name);
  end if;
end $$;

alter table public.paper_ingestion_audit_log
  add constraint paper_ingestion_audit_log_event_type_check check (
    event_type in (
      'fetched', 'fetch_failed', 'duplicate_skipped', 'extracted', 'classified',
      'auto_published', 'needs_review', 'rejected', 'reviewed', 'question_flagged_duplicate',
      'answer_key_revised'
    )
  );

-- ----------------------------------------------------------------------------
-- 5. paper_attempts — provenance + the answer-key version an attempt was
--    scored against, so a later revision can be detected as making it
--    stale (papers.answer_key_version > paper_attempts.answer_key_version_at_submission)
--    without storing a separate boolean that could drift out of sync.
-- ----------------------------------------------------------------------------
alter table public.paper_attempts
  add column if not exists attempt_source text not null default 'mock_attempt'
    check (attempt_source in ('mock_attempt', 'manual_entry', 'response_sheet_upload')),
  add column if not exists answer_key_version_at_submission int not null default 0;

-- ----------------------------------------------------------------------------
-- 6. response_sheet_uploads — see file header for why this is a new
--    table and why it reuses the `documents` Storage bucket rather than
--    a new one. Mirrors `documents`'s own status lifecycle
--    ('pending'/'processing'/'needs_review'/'processed'/'failed') and its
--    extracted-fields-with-confidence shape, applied here to per-question
--    answers instead of profile fields.
-- ----------------------------------------------------------------------------
create table if not exists public.response_sheet_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,

  storage_path text not null,   -- {user_id}/response-sheets/{paper_id}/... within the existing `documents` bucket
  file_name text,

  status text not null default 'pending' check (
    status in ('pending', 'processing', 'needs_review', 'processed', 'failed')
  ),
  -- [{ questionNumber, value, confidence: 'high'|'medium'|'low', confirmed }] —
  -- same shape as documents.extracted_fields, applied to answers instead
  -- of profile fields. Never populated with a fabricated confidence: a
  -- row with no real extraction capability stays status='needs_review'
  -- with this left as '[]' (see lib/actions/answer-key.ts).
  extracted_answers jsonb not null default '[]',
  overall_confidence numeric check (overall_confidence is null or (overall_confidence >= 0 and overall_confidence <= 1)),
  error_message text,

  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.response_sheet_uploads enable row level security;

create policy "response_sheet_uploads_select_own" on public.response_sheet_uploads
  for select using (auth.uid() = user_id);
create policy "response_sheet_uploads_insert_own" on public.response_sheet_uploads
  for insert with check (auth.uid() = user_id);
create policy "response_sheet_uploads_update_own" on public.response_sheet_uploads
  for update using (auth.uid() = user_id);
create policy "response_sheet_uploads_delete_own" on public.response_sheet_uploads
  for delete using (auth.uid() = user_id);

create index if not exists idx_response_sheet_uploads_user on public.response_sheet_uploads(user_id);
create index if not exists idx_response_sheet_uploads_paper on public.response_sheet_uploads(paper_id);
