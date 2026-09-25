-- ============================================================================
-- Phase 5: save/bookmark support.
--
-- The `saved_exams` table (0001_init.sql) references exam_cycles(id) — a
-- real foreign key, correct for when the exam catalog is real. It isn't
-- yet (see lib/mock-data.ts): today's exams live in application code with
-- string ids like "ssc-cgl-2026", not rows with real UUIDs. Rather than
-- force a fake FK or fabricate catalog rows just to satisfy it, bookmarks
-- store the exam's stable slug directly on the profile — a real,
-- RLS-protected column, just not normalized into its own table yet.
--
-- saved_exams itself is untouched and unused for now; once the catalog is
-- real, saved_exam_slugs is a straightforward one-time migration into it
-- (a slug ↔ exam_cycles.id lookup, not a schema change).
-- ============================================================================

alter table public.profiles
  add column if not exists saved_exam_slugs text[] not null default '{}';
