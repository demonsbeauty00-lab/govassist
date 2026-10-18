# Phase 16 - repository audit and integration notes

Evidence level: code was READ and edited. Nothing here was run against a live Supabase
project, a deployed Vercel cron, Resend, or any official government website, and no npm
script (typecheck / test / lint / build) was executed by the assistant.

Status labels: VERIFIED (read in code and consistent) / IMPLEMENTED, NOT RUN / PARTIAL /
NOT IMPLEMENTED / EXTERNAL SETUP NEEDED.

## Feature checklist

| Area | Status | Notes |
|---|---|---|
| Auth, middleware, onboarding, profile | IMPLEMENTED, NOT RUN | `/answer-key` and `/updates` were missing from the middleware protected list (pages still need a session); added. `/api/*` is not gated by middleware - cron and webhook routes authenticate themselves. |
| Exam catalog / cycles / eligibility engine | VERIFIED in code | Pure engine; missing profile data or no published rules gives "needs review", never a pass. Catalog in `lib/mock-data.ts` (`demoExamCycles`) is still DEMO data and is never copied into real requests. |
| Source monitoring pipeline | IMPLEMENTED, NOT RUN | Only a template parser exists (`example-notice-list.parser.ts`). No real government site is verified as supported. Failure keeps the last published data and sets the maintenance flag. |
| Source automation - deadlines | FIXED | Deadline-change / application-start notices used the notice's PUBLICATION date as the cycle date. Now only an explicit date read from the notice is used; otherwise the notice goes to admin review. |
| Cron jobs | FIXED / EXTERNAL SETUP NEEDED | Bounded per run (10 sources, 5 paper sources, time budget), constant-time secret check, failed loops recorded as failed, a failed source-list read no longer looks like "nothing due". Needs `CRON_SECRET` on Vercel. Hobby plan = daily crons only. |
| Documents upload / vault | FIXED | File type is now checked by its real bytes; the old file is removed only after the new one is saved; blank/oversized values refused. Private bucket + per-user storage RLS (0001/0003). |
| OCR / extraction | NOT IMPLEMENTED (honest now) | It used to return a made-up person's details that users could confirm into their profile. It now returns blank fields for manual entry. |
| Manual assistance workflow | IMPLEMENTED, NOT RUN | Single workflow on `application_requests`; no browser automation code exists in the repo (searched). Duplicate protection (check + partial unique index). New: a request for a cycle whose verified window has closed is refused. The legacy `application_sessions` / `application_audit_log` tables (0015) still exist, unused by any workflow; left in place (no destructive change). |
| PYQ / mock attempts | FIXED | Options were read from the WHOLE options table (PostgREST caps at 1000 rows - silent truncation could mean wrong scoring). Now per paper, in batches. Submit is compare-and-set so overlapping submits cannot both write a score. Multiple-correct questions cannot be scored yet and now block with a clear message. |
| Answer-key calculator | IMPLEMENTED, NOT RUN | Dropped / bonus / disputed handled, versions kept. Recalculate no longer rewrites submission time / time taken and restores "submitted" on failure. Response-sheet upload only stores the file (no parser): answers must be entered manually. NOT supported: multiple-correct options, section-specific negative-marking overrides beyond the stored marking scheme. |
| Notification engine | IMPLEMENTED, NOT RUN | Email needs `RESEND_API_KEY` + `EMAIL_FROM`; "delivered" only via the signed Resend webhook; push NOT implemented. |
| Admin dashboard | IMPLEMENTED, NOT RUN | `/admin/automation`, `/admin/application-requests`, `/admin/reviews`, `/admin/answer-keys`, `/admin/pyq-reviews`. Five identical `requireAdmin` copies replaced by `lib/auth/require-admin.ts` (fails closed). |

## Security / RLS findings

1. FIXED - fabricated OCR data could reach profile and eligibility (above).
2. FIXED - upload accepted any bytes with a PDF/image MIME label.
3. FIXED - cron secret compared with `!==` (now constant time).
4. OPEN (low, own data only) - `paper_attempts` / `paper_attempt_answers` have an owner UPDATE policy,
   so a signed-in user can edit their OWN attempt's score columns with the public API key. It affects
   only that user's own practice analytics, but it means stored scores are not tamper-proof. Fixing it
   properly means moving attempt writes to the server-side admin client (or column-level grants) -
   a behaviour change, so it was NOT done in this phase.
5. OPEN (info) - the `Identity Document` field "ID number" is stored in `documents.extracted_fields`
   as typed by the user; consider masking guidance in the UI.
6. NOT VERIFIED - RLS policies were read in the migration files only. Nothing confirms they are applied
   in your Supabase project. Run `supabase/tests/phase14_rls_check.sql` and `phase15_rls_check.sql`.

## Migrations

No new migration in Phase 16. 0020 and 0021 (Phases 14-15) exist as files and have NOT been verified as applied.

## Environment variable names

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
Optional: `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`.
Not used yet: `OCR_PROVIDER_API_KEY`, `S3_*`, `DIGILOCKER_*`.

## Manual setup

- Supabase: apply migrations 0001-0021 in order; add admins by inserting into `public.admins` (SQL editor / service role); run the two RLS check scripts.
- Vercel: set the env vars above; confirm both crons in vercel.json appear under Settings -> Cron Jobs.
- Resend (optional): verify the sender domain, add webhook `https://<domain>/api/webhooks/resend`.

## Known limitations

- Disabled/unsupported: multi-select scoring, OCR, response-sheet parsing, push notifications.
- `demoNotifications` in `lib/mock-data.ts` is unused leftover demo data.
- No retention purge job for application requests exists yet.
- Silent parser drift (page changes, parser returns 0 updates) is not flagged.
