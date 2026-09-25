-- ============================================================================
-- Phase 4: structured eligibility fields on exam_cycles.
--
-- age_min/age_max/age_relaxation_rules/qualification_rules/category_rules/
-- domicile_required already exist from 0001_init.sql. This migration adds
-- the remaining fields the eligibility engine (lib/eligibility/engine.ts)
-- needs to check a cycle's rules *as that cycle actually published them* —
-- never a generic, shared rule. Every column here is nullable: most exams
-- only set a handful of these, and a field being null means "this cycle
-- doesn't impose that condition," which the engine treats as "not
-- applicable" rather than fabricating a check that isn't real.
-- ============================================================================

alter table public.exam_cycles
  add column if not exists age_cutoff_date date,
  add column if not exists required_degree text,
  add column if not exists required_subject text,
  add column if not exists min_percentage numeric,
  add column if not exists gender_requirement text
    check (gender_requirement is null or gender_requirement in ('Male', 'Female', 'Other')),
  add column if not exists physical_requirements text,
  add column if not exists experience_requirements text,
  add column if not exists other_conditions text;

comment on column public.exam_cycles.age_cutoff_date is
  'The date age is computed as of (per the official notification) — not "today". Falls back to notification_date in the engine if null.';
comment on column public.exam_cycles.required_degree is
  'e.g. "Bachelor''s Degree", "10th Pass" — null means this cycle does not restrict by degree.';
comment on column public.exam_cycles.required_subject is
  'A specific subject/stream requirement, if any — null or "Any" means unrestricted.';
comment on column public.exam_cycles.min_percentage is
  'Minimum aggregate percentage/CGPA-equivalent required, if published.';
comment on column public.exam_cycles.physical_requirements is
  'Freeform (height/chest/endurance etc.) — never machine-checkable against a profile, always surfaces as "needs review".';
comment on column public.exam_cycles.experience_requirements is
  'Freeform prior-experience requirement — never machine-checkable, always surfaces as "needs review".';
comment on column public.exam_cycles.other_conditions is
  'Any other published condition not covered by a structured field above — always surfaces as "needs review".';
