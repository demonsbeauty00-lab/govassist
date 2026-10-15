-- ============================================================================
-- Phase 12: automated personalized exam discovery.
--
-- The eligibility ENGINE is unchanged and pure (lib/eligibility/engine.ts).
-- These two tables only STORE its latest output so the app can
--   * re-evaluate automatically when a profile or an official cycle changes,
--     and skip work when nothing changed (fingerprints),
--   * show each user their own classified exams, and what changed.
--
--   exam_eligibility_results      one row per (user, published exam cycle).
--                                 The user may only SELECT their own rows.
--                                 No insert/update/delete policy exists: rows
--                                 are written only by server code using the
--                                 service-role client, so a user can never
--                                 write their own "Potentially Eligible".
--   exam_eligibility_cycle_state  per-cycle fingerprint of the rules that
--                                 were last evaluated. RLS on, NO policies:
--                                 service role only.
--
-- Depends on: auth.users, public.exam_cycles (0001). Independent of
-- 0015-0017. Forward-only; nothing existing is altered.
-- ============================================================================

create table if not exists public.exam_eligibility_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_cycle_id uuid not null references public.exam_cycles(id) on delete cascade,
  category text not null
    check (category in ('potentially_eligible', 'needs_review', 'likely_not_eligible')),
  -- [{label, status, reason?, explanation}] exactly as the engine produced it.
  checks jsonb not null default '[]'::jsonb,
  rules_fingerprint text not null,
  profile_fingerprint text not null,
  previous_category text
    check (previous_category is null or previous_category in ('potentially_eligible', 'needs_review', 'likely_not_eligible')),
  category_changed_at timestamptz not null default now(),
  evaluated_at timestamptz not null default now(),
  primary key (user_id, exam_cycle_id)
);

create index if not exists idx_exam_eligibility_results_cycle
  on public.exam_eligibility_results (exam_cycle_id);
create index if not exists idx_exam_eligibility_results_user_category
  on public.exam_eligibility_results (user_id, category);

alter table public.exam_eligibility_results enable row level security;

create policy "exam_eligibility_results_select_own" on public.exam_eligibility_results
  for select using (auth.uid() = user_id);

create table if not exists public.exam_eligibility_cycle_state (
  exam_cycle_id uuid primary key references public.exam_cycles(id) on delete cascade,
  rules_fingerprint text not null,
  users_evaluated integer not null default 0,
  evaluated_at timestamptz not null default now()
);

alter table public.exam_eligibility_cycle_state enable row level security;
