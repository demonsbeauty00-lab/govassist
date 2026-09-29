-- ============================================================================
-- Phase 7: Automated scoring and performance analytics.
--
-- Purely additive — three new nullable columns on the existing
-- paper_attempts table (already RLS-protected per-user since 0010). No new
-- table, no RLS change, no existing column touched. Existing rows (if any)
-- simply have null here until they're recomputed; nothing reads these
-- columns as non-null without checking.
--
-- Why these three and not more:
-- - marks_earned / negative_marks_deducted: the phase brief asks for
--   "marks" and "negative marks" as attempt-level numbers distinct from
--   the net `score` already stored. Both are derivable from per-question
--   scoring at submission time (lib/pyq/analytics.ts) — stored here so a
--   past attempt's breakdown doesn't need re-deriving from
--   paper_attempt_answers + questions every time the result page loads.
-- - section_breakdown: a JSON snapshot of per-section performance at
--   submission time (see lib/pyq/analytics.ts for the exact shape). It's a
--   *snapshot*, not a live join, on purpose — if a paper's sections are
--   later edited by an ingestion re-run, a past attempt's section
--   breakdown should keep describing what was true when the attempt was
--   taken, not silently change underneath it.
--
-- attempt_percentage and average time per question are NOT stored here —
-- both are trivially derivable from already-stored columns
-- (score/max_score, time_taken_seconds/total_questions) and storing a
-- derived value that can drift from its source is worse than computing it
-- on read.
-- ============================================================================

alter table public.paper_attempts
  add column if not exists marks_earned numeric,
  add column if not exists negative_marks_deducted numeric,
  add column if not exists section_breakdown jsonb;
