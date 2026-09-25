-- ============================================================================
-- GovAssist — Phase 2 database schema
-- Target: Supabase Postgres (auth.users is managed by Supabase Auth)
--
-- Design principles:
-- 1. Every user-owned table has a `user_id uuid references auth.users(id)`
--    column and RLS enabled with a policy of `user_id = auth.uid()`. A user
--    can only ever see/edit their own rows — enforced by Postgres itself,
--    not by application code, so a bug in a route handler cannot leak
--    another user's data.
-- 2. Editorial/reference tables (exams, exam_cycles, job_notifications,
--    mock_tests, answer_keys) are public-readable but writable only by the
--    `service_role` key (never exposed to the browser) — content is curated
--    server-side / via an admin tool, not by end users.
-- 3. No secrets, passwords, or payment data live in this schema. Supabase
--    Auth owns password hashing; we never touch or store credentials here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. users — a thin public-schema mirror of auth.users for app-level
--    metadata. Supabase Auth owns credentials; this table never stores a
--    password or token, only fields the app itself needs to join against.
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.users enable row level security;

create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

create policy "users_update_own" on public.users
  for update using (auth.uid() = id);

-- Auto-create a public.users row whenever someone signs up via Supabase Auth.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, phone)
  values (new.id, new.email, new.phone);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- 2. profiles — one row per user, the fields collected during onboarding.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  dob date not null,
  gender text not null check (gender in ('Male', 'Female', 'Other')),
  state text not null,
  category text not null check (category in ('General', 'OBC', 'SC', 'ST', 'EWS')),
  is_pwbd boolean not null default false,
  preferred_categories text[] not null default '{}',
  onboarding_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. education — one row per qualification level (10th, 12th, graduation...)
--    so a user's full academic history can be modeled, not just the latest.
-- ----------------------------------------------------------------------------
create table if not exists public.education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  qualification_level text not null check (
    qualification_level in ('Below 10th', '10th pass', '12th pass', 'Diploma', 'Graduate', 'Post Graduate')
  ),
  institution_name text,
  board_or_university text,
  subject text,
  passing_year int check (passing_year between 1950 and 2100),
  percentage_or_cgpa text,
  source text not null default 'manual' check (source in ('manual', 'ocr', 'digilocker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.education enable row level security;

create policy "education_select_own" on public.education
  for select using (auth.uid() = user_id);
create policy "education_insert_own" on public.education
  for insert with check (auth.uid() = user_id);
create policy "education_update_own" on public.education
  for update using (auth.uid() = user_id);
create policy "education_delete_own" on public.education
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. documents — metadata only. The actual file bytes live in Supabase
--    Storage under a per-user path (see storage policy below); this table
--    tracks status and OCR-extracted fields with confidence scores.
-- ----------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (
    document_type in (
      '10th Marksheet', '12th Marksheet', 'Graduation Certificate',
      'Category Certificate', 'Domicile Certificate', 'Photo', 'Signature', 'Other'
    )
  ),
  status text not null default 'not_uploaded' check (
    status in ('not_uploaded', 'processing', 'needs_review', 'verified')
  ),
  storage_path text,              -- path within the private `documents` bucket
  file_name text,
  source text check (source in ('manual_upload', 'digilocker')),
  extracted_fields jsonb not null default '[]',  -- [{label, value, confidence}]
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "documents_select_own" on public.documents
  for select using (auth.uid() = user_id);
create policy "documents_insert_own" on public.documents
  for insert with check (auth.uid() = user_id);
create policy "documents_update_own" on public.documents
  for update using (auth.uid() = user_id);
create policy "documents_delete_own" on public.documents
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. exams — evergreen exam identity (does not change per recruitment cycle)
-- ----------------------------------------------------------------------------
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null,
  category text not null check (
    category in ('SSC', 'Railways', 'Banking', 'Police', 'Defence', 'Teaching', 'State Government', 'Other')
  ),
  state text,                      -- null = all-India exam
  recruiting_body text not null,
  official_website text not null,
  created_at timestamptz not null default now()
);

alter table public.exams enable row level security;

create policy "exams_public_read" on public.exams
  for select using (true);
-- No insert/update/delete policy for authenticated/anon roles: writes only
-- via the service_role key (used server-side by the content pipeline), which
-- bypasses RLS by design in Supabase.

-- ----------------------------------------------------------------------------
-- 6. exam_cycles — one row per recruitment cycle. All the "official record"
--    fields required by the product principle live here, each with its own
--    source URL and verification date.
-- ----------------------------------------------------------------------------
create table if not exists public.exam_cycles (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  cycle_label text not null,                     -- e.g. "2026", "72nd CCE"
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),

  official_notification_url text not null,
  notification_date date not null,
  last_verified_date date not null,
  last_verified_by text,

  qualification_summary text not null,
  age_min int,
  age_max int,
  age_relaxation_rules jsonb not null default '{}',   -- {category: years}
  qualification_rules jsonb not null default '{}',
  category_rules jsonb not null default '{}',
  domicile_required boolean not null default false,
  vacancies int,

  application_start_date date,
  application_end_date date,

  exam_pattern jsonb not null default '[]',   -- [{tierLabel, sections, duration, negativeMarking}]
  important_dates jsonb not null default '[]', -- [{label, date, isTentative}]

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (exam_id, cycle_label)
);

alter table public.exam_cycles enable row level security;

create policy "exam_cycles_public_read" on public.exam_cycles
  for select using (status = 'published');

create index if not exists idx_exam_cycles_exam_id on public.exam_cycles(exam_id);
create index if not exists idx_exam_cycles_status on public.exam_cycles(status);

-- ----------------------------------------------------------------------------
-- 7. job_notifications — the editorial feed of notification-worthy events
--    tied to a cycle (new notification published, corrigendum, admit card
--    released, result declared). This is the source that personal
--    `notifications` rows are generated from.
-- ----------------------------------------------------------------------------
create table if not exists public.job_notifications (
  id uuid primary key default gen_random_uuid(),
  exam_cycle_id uuid not null references public.exam_cycles(id) on delete cascade,
  event_type text not null check (
    event_type in ('notification_published', 'corrigendum', 'admit_card_released', 'result_declared', 'deadline_extended')
  ),
  headline text not null,
  detail text,
  source_url text,
  event_date date not null,
  created_at timestamptz not null default now()
);

alter table public.job_notifications enable row level security;

create policy "job_notifications_public_read" on public.job_notifications
  for select using (true);

create index if not exists idx_job_notifications_cycle on public.job_notifications(exam_cycle_id);

-- ----------------------------------------------------------------------------
-- 8. saved_exams — user bookmarks
-- ----------------------------------------------------------------------------
create table if not exists public.saved_exams (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_cycle_id uuid not null references public.exam_cycles(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, exam_cycle_id)
);

alter table public.saved_exams enable row level security;

create policy "saved_exams_select_own" on public.saved_exams
  for select using (auth.uid() = user_id);
create policy "saved_exams_insert_own" on public.saved_exams
  for insert with check (auth.uid() = user_id);
create policy "saved_exams_delete_own" on public.saved_exams
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 9. applications — tracks that a user has applied (never automates the
--    actual submission — see product principle on CAPTCHA/OTP/payment).
-- ----------------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_cycle_id uuid not null references public.exam_cycles(id) on delete cascade,
  status text not null default 'applied' check (status in ('applied', 'withdrawn')),
  application_reference_number text,
  applied_at timestamptz not null default now(),
  notes text,
  unique (user_id, exam_cycle_id)
);

alter table public.applications enable row level security;

create policy "applications_select_own" on public.applications
  for select using (auth.uid() = user_id);
create policy "applications_insert_own" on public.applications
  for insert with check (auth.uid() = user_id);
create policy "applications_update_own" on public.applications
  for update using (auth.uid() = user_id);
create policy "applications_delete_own" on public.applications
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 10. mock_tests — test definitions (editorial content, public read)
-- ----------------------------------------------------------------------------
create table if not exists public.mock_tests (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete set null,
  title text not null,
  duration_seconds int not null,
  questions jsonb not null default '[]', -- [{id, section, prompt, options, correctIndex}]
  source text not null default 'pyq' check (source in ('pyq', 'practice')),
  year int,
  created_at timestamptz not null default now()
);

alter table public.mock_tests enable row level security;

create policy "mock_tests_public_read" on public.mock_tests
  for select using (true);

-- ----------------------------------------------------------------------------
-- 11. mock_attempts — a user's attempt at a mock test
-- ----------------------------------------------------------------------------
create table if not exists public.mock_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mock_test_id uuid not null references public.mock_tests(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb not null default '{}',   -- {questionId: selectedIndex}
  correct_count int,
  incorrect_count int,
  unattempted_count int,
  time_taken_seconds int
);

alter table public.mock_attempts enable row level security;

create policy "mock_attempts_select_own" on public.mock_attempts
  for select using (auth.uid() = user_id);
create policy "mock_attempts_insert_own" on public.mock_attempts
  for insert with check (auth.uid() = user_id);
create policy "mock_attempts_update_own" on public.mock_attempts
  for update using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 12. answer_keys — official answer keys per exam cycle/tier, used by the
--     marks calculator. Editorial content, public read.
-- ----------------------------------------------------------------------------
create table if not exists public.answer_keys (
  id uuid primary key default gen_random_uuid(),
  exam_cycle_id uuid not null references public.exam_cycles(id) on delete cascade,
  tier_label text not null,
  is_final boolean not null default false,
  official_source_url text not null,
  published_date date not null,
  answers jsonb not null default '[]',  -- [{questionNumber, correctOption, marks, negativeMarks}]
  created_at timestamptz not null default now()
);

alter table public.answer_keys enable row level security;

create policy "answer_keys_public_read" on public.answer_keys
  for select using (true);

-- ----------------------------------------------------------------------------
-- 13. results — official results a user is tracking / has received
-- ----------------------------------------------------------------------------
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_cycle_id uuid not null references public.exam_cycles(id) on delete cascade,
  result_status text not null check (result_status in ('declared', 'awaited')),
  score numeric,
  rank int,
  selected boolean,
  official_source_url text,
  declared_at date,
  created_at timestamptz not null default now(),
  unique (user_id, exam_cycle_id)
);

alter table public.results enable row level security;

create policy "results_select_own" on public.results
  for select using (auth.uid() = user_id);
create policy "results_insert_own" on public.results
  for insert with check (auth.uid() = user_id);
create policy "results_update_own" on public.results
  for update using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 14. notifications — personal, user-facing alerts (deadline reminders,
--     admit card / result alerts, system messages)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_notification_id uuid references public.job_notifications(id) on delete set null,
  title text not null,
  body text not null,
  type text not null check (type in ('deadline', 'admit_card', 'result', 'system')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id);
create policy "notifications_delete_own" on public.notifications
  for delete using (auth.uid() = user_id);

create index if not exists idx_notifications_user on public.notifications(user_id, is_read);

-- ============================================================================
-- Storage: private per-user document bucket
-- The bucket itself is created by supabase/migrations/0003_storage_bucket.sql
-- (a real migration statement, not a manual step) — these policies just need
-- to exist ahead of it and reference the bucket by id, which works fine
-- regardless of statement order across separate migration files.
-- Path convention enforced by policy: documents/{user_id}/{document_id}/{filename}
-- ============================================================================
create policy "documents_storage_select_own"
  on storage.objects for select
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "documents_storage_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "documents_storage_delete_own"
  on storage.objects for delete
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
