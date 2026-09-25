-- ============================================================================
-- Phase 5.5: admin roles.
--
-- The review workflow (requirement 6) needs a way to tell an admin from a
-- regular signed-in user. This is deliberately its OWN table rather than
-- an is_admin column on profiles: profiles' existing RLS policy
-- (profiles_update_own) allows a user to update their own row, and
-- Postgres RLS is row-level, not column-level — a boolean flag sitting on
-- that row would be one crafted API call away from a user granting
-- themselves admin. A separate table with no authenticated-role write
-- policy at all closes that off entirely: only the service-role client
-- (never exposed to the browser) can ever insert into this table.
-- ============================================================================

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

alter table public.admins enable row level security;

-- A user may check their OWN admin status (used to decide whether to show
-- review UI at all) — this is read-only and scoped to their own row, so it
-- grants no ability to see or affect anyone else's status.
create policy "admins_select_own" on public.admins
  for select using (auth.uid() = user_id);

-- No insert/update/delete policy for anon or authenticated roles, on
-- purpose: granting admin access is a service-role-only operation, done
-- via the Supabase dashboard's table editor or an admin script — never
-- reachable from a user request.
