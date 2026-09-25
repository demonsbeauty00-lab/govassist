-- ============================================================================
-- Phase 6: Automated Previous Year Papers & Mock Test system.
--
-- Naming note (deviation from the phase brief, documented here on purpose):
-- the brief asked for tables named `sections`, `options`, `mock_attempts`
-- and `mock_attempt_answers`. Two of those names already exist in this
-- schema from 0001_init.sql (`mock_tests` / `mock_attempts`) as a flat,
-- jsonb-blob demo scaffold that is NOT referenced anywhere in app code
-- (grep confirms it — only lib/mock-questions.ts client-side demo data is
-- actually used today). Rather than drop/alter a live table without an
-- explicit go-ahead, this migration leaves 0001's mock_tests/mock_attempts
-- completely untouched and introduces the real, normalized Phase 6 schema
-- under distinct names: `papers` (the exam/year/stage/shift unit — this IS
-- the brief's implicit "paper" concept), `paper_sections` (not `sections`,
-- to avoid an overly generic global name), `questions`, `question_options`
-- (not bare `options`, same reasoning), `marking_schemes`, and
-- `paper_attempts` / `paper_attempt_answers` (not `mock_attempts` /
-- `mock_attempt_answers`, to avoid colliding with the existing unused
-- tables). The old mock_tests/mock_attempts tables can be dropped later in
-- a dedicated cleanup migration once that's explicitly confirmed.
--
-- Security note: `questions` and `question_options` carry the correct
-- answer for each question. They intentionally get NO RLS policy for the
-- anon/authenticated roles — not even "published only" — because RLS
-- controls row visibility, not column visibility: a policy that let a
-- signed-in user SELECT a published question's options would also let
-- them SELECT is_correct directly from the browser console before
-- attempting it. Every read of question content therefore goes through a
-- server action (lib/actions/pyq.ts) using the service-role client, which
-- explicitly strips correct-answer fields while an attempt is in progress
-- and only reveals them once that attempt has been submitted.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. papers — one row per exam/year/stage/shift paper.
-- ----------------------------------------------------------------------------
create table if not exists public.papers (
  id uuid primary key default gen_random_uuid(),

  -- Links to the real `exams` table when a matching row exists there, but
  -- kept nullable + paired with exam_slug — same reasoning as 0006's
  -- saved_exam_slugs: the real exam catalog (exams/exam_cycles) isn't
  -- fully populated yet (lib/mock-data.ts is still the demo catalog), so a
  -- paper must be able to exist and link back to a demo-catalog slug like
  -- "ssc-cgl-2026" today, and pick up a real exam_id later without a
  -- schema change.
  exam_id uuid references public.exams(id) on delete set null,
  exam_slug text not null,
  exam_short_name text not null,
  exam_category text not null check (
    exam_category in ('SSC', 'Railways', 'Banking', 'Police', 'Defence', 'Teaching', 'State Government', 'Other')
  ),

  year int not null check (year between 1990 and 2100),
  stage text not null,             -- e.g. "Tier I", "Prelims", "Mains"
  shift text,                      -- e.g. "Shift 1" — null when the exam had a single shift that day

  title text not null,             -- e.g. "SSC CGL 2023 Tier I — 14 Jul 2023, Shift 1"
  duration_minutes int not null check (duration_minutes > 0),
  total_marks numeric,
  total_questions int not null default 0,   -- denormalized, kept in sync by the ingestion pipeline

  -- Provenance — required for every paper, per the "never invent PYQs"
  -- product principle. A paper with no official/verified source should
  -- never reach `published`.
  official_source_url text not null,
  source_document_url text,
  source_type text not null default 'admin_manual' check (
    source_type in ('official_pdf_index', 'official_page', 'verified_reupload', 'admin_manual')
  ),

  status text not null default 'needs_review' check (
    status in ('draft', 'needs_review', 'published', 'rejected')
  ),
  extraction_confidence numeric check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1)),
  content_hash text,               -- hash of the source document this paper was ingested from — duplicate detection

  ingestion_run_id uuid,           -- fk added below, after paper_ingestion_runs exists
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.papers enable row level security;

create policy "papers_public_read" on public.papers
  for select using (status = 'published');
-- No insert/update/delete policy for anon/authenticated — written only by
-- the ingestion pipeline / admin review actions, both service-role.

create index if not exists idx_papers_exam_slug on public.papers(exam_slug);
create index if not exists idx_papers_status on public.papers(status);
create unique index if not exists idx_papers_content_hash on public.papers(content_hash) where content_hash is not null;

-- ----------------------------------------------------------------------------
-- 2. paper_sections — subject/section breakdown within a paper.
-- ----------------------------------------------------------------------------
create table if not exists public.paper_sections (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  name text not null,              -- e.g. "Quantitative Aptitude"
  order_index int not null default 0,
  question_count int not null default 0,   -- denormalized, kept in sync by the ingestion pipeline
  duration_minutes int,            -- set only for sectionally-timed papers; null = whole-paper timer applies
  created_at timestamptz not null default now(),
  unique (paper_id, name)
);

alter table public.paper_sections enable row level security;

create policy "paper_sections_public_read" on public.paper_sections
  for select using (
    exists (select 1 from public.papers p where p.id = paper_id and p.status = 'published')
  );

create index if not exists idx_paper_sections_paper on public.paper_sections(paper_id);

-- ----------------------------------------------------------------------------
-- 3. marking_schemes — correct/incorrect/unattempted marks, per paper or
--    per section. A row with section_id null is the paper-wide default;
--    a row with section_id set overrides it for that section only.
-- ----------------------------------------------------------------------------
create table if not exists public.marking_schemes (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  section_id uuid references public.paper_sections(id) on delete cascade,
  correct_marks numeric not null default 1,
  incorrect_marks numeric not null default 0,   -- stored positive, subtracted at scoring time
  unattempted_marks numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.marking_schemes enable row level security;

create policy "marking_schemes_public_read" on public.marking_schemes
  for select using (
    exists (select 1 from public.papers p where p.id = paper_id and p.status = 'published')
  );

create unique index if not exists idx_marking_schemes_paper_default on public.marking_schemes(paper_id) where section_id is null;
create unique index if not exists idx_marking_schemes_paper_section on public.marking_schemes(paper_id, section_id) where section_id is not null;

-- ----------------------------------------------------------------------------
-- 4. questions — see the file header for why this table has no
--    anon/authenticated RLS policy at all.
-- ----------------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  section_id uuid references public.paper_sections(id) on delete set null,

  question_number int not null,
  question_type text not null default 'mcq_single' check (
    question_type in ('mcq_single', 'mcq_multiple', 'numerical')
  ),
  prompt text not null,
  prompt_image_url text,
  -- Only used when question_type = 'numerical' (no options table rows).
  -- A verified official answer key value, never an AI guess — see
  -- classify.ts: a numerical question with no confidently-extracted
  -- answer can never reach 'published'.
  correct_numeric_value text,

  explanation text,
  topic text,
  difficulty text check (difficulty is null or difficulty in ('easy', 'medium', 'hard')),

  marks numeric,             -- overrides the paper/section marking_scheme when set; null = use marking_scheme
  negative_marks numeric,    -- overrides the paper/section marking_scheme when set; null = use marking_scheme

  status text not null default 'needs_review' check (
    status in ('draft', 'needs_review', 'published', 'rejected')
  ),
  extraction_confidence numeric check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1)),
  source_reference text,     -- e.g. "page 4, Q23" — where in the source document this came from

  -- Duplicate detection (per the brief's flow: extraction → validation →
  -- duplicate detection → Supabase). content_hash is a normalized hash of
  -- prompt + option text, computed by the ingestion pipeline
  -- (lib/pyq/ingestion/hash.ts). Not a unique DB constraint — a question
  -- can legitimately recur verbatim across a paper's re-conducted shifts —
  -- the pipeline checks it against existing rows before inserting and
  -- links duplicate_of_question_id instead of inserting a second copy.
  content_hash text not null,
  duplicate_of_question_id uuid references public.questions(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, question_number)
);

alter table public.questions enable row level security;
-- Deliberately no select/insert/update/delete policy for anon or
-- authenticated roles — see file header. Only the service-role client
-- (lib/actions/pyq.ts, lib/pyq/ingestion/*) ever reads or writes this
-- table.

create index if not exists idx_questions_paper on public.questions(paper_id);
create index if not exists idx_questions_section on public.questions(section_id);
create index if not exists idx_questions_content_hash on public.questions(content_hash);
create index if not exists idx_questions_status on public.questions(status);

-- ----------------------------------------------------------------------------
-- 5. question_options — same access rules as `questions` (see file header).
-- ----------------------------------------------------------------------------
create table if not exists public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_label text not null,      -- "A" / "B" / "C" / "D"
  option_text text not null,
  is_correct boolean not null default false,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  unique (question_id, option_label)
);

alter table public.question_options enable row level security;
-- No anon/authenticated policy — see file header on `questions`.

create index if not exists idx_question_options_question on public.question_options(question_id);

-- ----------------------------------------------------------------------------
-- 6. paper_ingestion_sources — the registry a paper can be automatically
--    imported through, mirroring notification_sources (0007) for the same
--    reasons: one row per verified official document/index being watched.
-- ----------------------------------------------------------------------------
create table if not exists public.paper_ingestion_sources (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  exam_id uuid references public.exams(id) on delete set null,
  exam_slug text,
  official_url text not null,
  source_type text not null check (
    source_type in ('official_pdf_index', 'official_page', 'verified_reupload', 'admin_manual')
  ),
  enabled boolean not null default true,
  check_frequency_minutes int not null default 10080, -- weekly default — PYQ indices change far less often than notice pages
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  needs_parser_maintenance boolean not null default false,
  parser_version text not null default 'v1',
  last_content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (official_url)
);

alter table public.paper_ingestion_sources enable row level security;
-- No anon/authenticated policies — internal registry, service-role only.

create index if not exists idx_paper_ingestion_sources_enabled on public.paper_ingestion_sources(enabled) where enabled = true;

-- ----------------------------------------------------------------------------
-- 7. paper_ingestion_runs — one row per ingestion attempt (scheduled or
--    admin-triggered manual import). The staging/audit record between "a
--    document was fetched" and "a papers row exists" — same role as
--    detected_updates in the notification pipeline.
-- ----------------------------------------------------------------------------
create table if not exists public.paper_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.paper_ingestion_sources(id) on delete set null,  -- null = manual admin-triggered run
  paper_id uuid references public.papers(id) on delete set null,                    -- set once the papers row is created

  document_url text not null,
  content_hash text not null,

  status text not null default 'pending' check (
    status in ('pending', 'processing', 'needs_review', 'auto_published', 'rejected', 'failed')
  ),
  classification text check (classification in ('auto_publish', 'needs_review', 'reject')),
  extracted_question_count int not null default 0,
  extraction_confidence numeric,
  error_message text,

  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.paper_ingestion_runs enable row level security;
-- No anon/authenticated policies — internal, service-role only.

create index if not exists idx_paper_ingestion_runs_source on public.paper_ingestion_runs(source_id);
create index if not exists idx_paper_ingestion_runs_status on public.paper_ingestion_runs(status);
-- Duplicate detection at the whole-document level (only meaningful for
-- scheduled runs tied to a source — a manual admin re-paste of the same
-- content is caught separately, against papers.content_hash, before a run
-- row is even created).
create unique index if not exists idx_paper_ingestion_runs_source_hash
  on public.paper_ingestion_runs(source_id, content_hash) where source_id is not null;

alter table public.papers
  add constraint papers_ingestion_run_id_fkey foreign key (ingestion_run_id)
  references public.paper_ingestion_runs(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 8. paper_ingestion_audit_log — append-only, mirrors source_audit_log.
-- ----------------------------------------------------------------------------
create table if not exists public.paper_ingestion_audit_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.paper_ingestion_runs(id) on delete set null,
  paper_id uuid references public.papers(id) on delete set null,
  event_type text not null check (
    event_type in (
      'fetched', 'fetch_failed', 'duplicate_skipped', 'extracted', 'classified',
      'auto_published', 'needs_review', 'rejected', 'reviewed', 'question_flagged_duplicate'
    )
  ),
  previous_value jsonb,
  new_value jsonb,
  reviewer uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.paper_ingestion_audit_log enable row level security;
-- No anon/authenticated policies — internal, service-role only.

create index if not exists idx_paper_ingestion_audit_log_run on public.paper_ingestion_audit_log(run_id);
create index if not exists idx_paper_ingestion_audit_log_paper on public.paper_ingestion_audit_log(paper_id);

-- ----------------------------------------------------------------------------
-- 9. paper_attempts — a user's attempt at a paper (the brief's
--    "mock_attempts" — renamed, see file header).
-- ----------------------------------------------------------------------------
create table if not exists public.paper_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,

  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'abandoned')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,

  duration_seconds int not null,       -- snapshot of the paper's duration at attempt time
  time_taken_seconds int,

  total_questions int not null,
  attempted_count int not null default 0,
  marked_for_review_count int not null default 0,
  correct_count int not null default 0,
  incorrect_count int not null default 0,
  unattempted_count int not null default 0,

  score numeric not null default 0,
  max_score numeric not null,
  accuracy numeric,                    -- correct / (correct + incorrect), null when nothing attempted

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paper_attempts enable row level security;

create policy "paper_attempts_select_own" on public.paper_attempts
  for select using (auth.uid() = user_id);
create policy "paper_attempts_insert_own" on public.paper_attempts
  for insert with check (auth.uid() = user_id);
create policy "paper_attempts_update_own" on public.paper_attempts
  for update using (auth.uid() = user_id);

create index if not exists idx_paper_attempts_user on public.paper_attempts(user_id);
create index if not exists idx_paper_attempts_paper on public.paper_attempts(paper_id);

-- ----------------------------------------------------------------------------
-- 10. paper_attempt_answers — per-question answer state within an attempt
--     (the brief's "mock_attempt_answers" — renamed, see file header).
-- ----------------------------------------------------------------------------
create table if not exists public.paper_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.paper_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,

  selected_option_id uuid references public.question_options(id) on delete set null,
  numeric_answer text,             -- for question_type = 'numerical'
  is_marked_for_review boolean not null default false,

  is_correct boolean,              -- null until graded at submission
  marks_awarded numeric,

  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

alter table public.paper_attempt_answers enable row level security;

create policy "paper_attempt_answers_select_own" on public.paper_attempt_answers
  for select using (
    exists (select 1 from public.paper_attempts pa where pa.id = attempt_id and pa.user_id = auth.uid())
  );
create policy "paper_attempt_answers_insert_own" on public.paper_attempt_answers
  for insert with check (
    exists (select 1 from public.paper_attempts pa where pa.id = attempt_id and pa.user_id = auth.uid())
  );
create policy "paper_attempt_answers_update_own" on public.paper_attempt_answers
  for update using (
    exists (select 1 from public.paper_attempts pa where pa.id = attempt_id and pa.user_id = auth.uid())
  );

create index if not exists idx_paper_attempt_answers_attempt on public.paper_attempt_answers(attempt_id);
create index if not exists idx_paper_attempt_answers_question on public.paper_attempt_answers(question_id);
