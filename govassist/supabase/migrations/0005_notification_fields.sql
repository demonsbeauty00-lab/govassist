-- ============================================================================
-- Phase 5: the remaining structured fields a government exam/job notification
-- needs, per the product spec. age_min/age_max/qualification_summary/
-- vacancies/application dates/exam_pattern/official_notification_url/
-- notification_date/last_verified_date already exist (0001, 0004).
-- ============================================================================

alter table public.exam_cycles
  add column if not exists post text,
  add column if not exists official_application_url text,
  add column if not exists admit_card_date date,
  add column if not exists answer_key_date date,
  add column if not exists result_date date,
  add column if not exists syllabus_summary text,
  add column if not exists marking_scheme_summary text;

comment on column public.exam_cycles.post is
  'The post(s) this cycle recruits for, as published — e.g. "Assistant Section Officer, Inspector, and other Group B/C posts". A summary, not a normalized posts table (most cycles publish one qualification/age band across posts; where they genuinely differ per post, that becomes its own future table rather than overloading this column).';
comment on column public.exam_cycles.official_application_url is
  'Where a candidate actually submits the application — distinct from official_notification_url (the PDF/announcement) and exams.official_website (the organization''s site).';
comment on column public.exam_cycles.admit_card_date is 'Date the admit card is/was released, if published. Null until known.';
comment on column public.exam_cycles.answer_key_date is 'Date the official answer key is/was released, if published. Null until known.';
comment on column public.exam_cycles.result_date is 'Date the result is/was declared, if published. Null until known.';
