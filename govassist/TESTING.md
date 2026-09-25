# Manual test checklist — Phases 1–3

I could not run any of this end-to-end myself: the environment I built this in has no
network access, so nothing here has touched a real Supabase project. Everything below
is implemented against Supabase's documented APIs and I'm confident in the logic, but
please treat it as **untested until you run it**, not as a verified feature.

## Setup (once)

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run these migrations **in order**:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_documents_unique.sql`
   - `supabase/migrations/0003_storage_bucket.sql` (creates the private `documents`
     bucket — check Storage in the dashboard afterward to confirm it exists and is
     marked private)
3. Project Settings → API: copy the Project URL and `anon` `public` key.
4. `cp .env.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. `npm install && npm run check-env` — should print all green before you continue.
6. `npm run dev`.

By default, Supabase projects require email confirmation before a session is issued.
For fast local testing, you can turn this off under Authentication → Providers → Email
→ "Confirm email" — but leave it **on** before shipping to real users.

## Checklist

### 1. Signup
- [ ] Go to `/signup`, submit with an invalid email → inline field error, no request sent.
- [ ] Submit with a password under 8 characters → inline field error.
- [ ] Submit with valid details.
  - If email confirmation is **off**: should redirect straight to `/onboarding`.
  - If email confirmation is **on**: should show "check your email", and clicking the
    confirmation link should land on `/onboarding` (via `/auth/callback`).
- [ ] Check the Supabase dashboard → Authentication → Users: the new user should appear.
- [ ] Check Table Editor → `public.users`: a matching row should have been created by
      the `on_auth_user_created` trigger.
- [ ] Try signing up again with the same email → should surface Supabase's "already
      registered" error message, not a generic failure.

### 2. Onboarding → profile persistence
- [ ] Complete all 4 onboarding steps and submit.
- [ ] Table Editor → `profiles`: one row for your user, with `onboarding_completed_at` set.
- [ ] Table Editor → `education`: one row with your qualification.
- [ ] Confirm you land on `/home` and see your real first name in the greeting.

### 3. Login
- [ ] Log out, then log in with the account you just created → should land on `/home`.
- [ ] Log in with a wrong password → generic "didn't match" error (not "wrong password",
      which would leak whether the email exists).

### 4. Logout
- [ ] From Settings, tap "Log out" → should redirect to `/login`.
- [ ] Try to open `/home` directly afterward → middleware should redirect you back to
      `/login?redirectTo=/home`.

### 5. Refresh session
- [ ] Log in, then hard-refresh the browser on `/home` → should stay logged in (session
      cookie persists; no redirect to login).
- [ ] Close the tab entirely, reopen `/home` later → should still be logged in until the
      Supabase session actually expires.

### 6. Protected pages
- [ ] While logged out, try navigating directly to `/home`, `/jobs`, `/exams`,
      `/preparation`, `/documents`, `/profile`, `/notifications`, `/settings`,
      `/onboarding` → every one should redirect to `/login`.
- [ ] `/`, `/login`, `/signup`, `/forgot-password` should all stay accessible while
      logged out.

### 7. Profile save / edit
- [ ] On `/profile`, tap "Edit" on Full name, change it, save → row in `profiles`
      updates, UI reflects the new value without a full page reload.
- [ ] Toggle a preferred-category chip → `profiles.preferred_categories` updates.
- [ ] Toggle PwBD status → `profiles.is_pwbd` updates.
- [ ] Edit an education field (e.g. Subject) → `education` row updates.
- [ ] Try (via the Supabase SQL editor, logged in as a *different* test user) to
      `select * from profiles where user_id = '<the-first-user's-id>'` → should return
      zero rows, confirming RLS is actually blocking cross-user reads.

### 8. Password reset
- [ ] `/forgot-password`, submit a registered email → generic success message (same
      message regardless of whether the email exists, by design).
- [ ] Check the email, follow the link → should land on `/update-password` with a valid
      session.
- [ ] Submit a new password → redirects to `/home`, and the old password no longer works
      on `/login`.

### 9. Config error handling
- [ ] Temporarily rename `.env.local` (or clear the two required vars) and restart
      `npm run dev` → any page that touches Supabase should show the "Configuration
      needed" screen (`components/ConfigErrorScreen.tsx`), not a raw stack trace or a
      silent blank page.
- [ ] Restore `.env.local` and confirm the app works again.

### 10. Document vault (Phase 3)
- [ ] `/documents` shows all 8 fixed types, each "Not uploaded".
- [ ] Open "10th Marksheet" → upload a small PDF or JPG (under 10MB). Should show as
      "Processing" briefly, then "Needs review" with a set of extracted fields, each
      carrying a confidence badge (high/medium/low) — **none pre-confirmed**.
- [ ] Try editing a field's value → saves, badge changes to "Confirmed".
- [ ] Try "Looks right" on a field without editing it → badge changes to "Confirmed".
- [ ] "Confirm all reviewed" should be disabled until every field is confirmed; if you
      try to bypass it (e.g. by calling the server action directly with fields still
      unconfirmed), it should return an error naming which fields are outstanding —
      this is enforced server-side, not just by disabling the button.
- [ ] Once confirmed, status becomes "Verified" and an "Apply to profile" button
      appears. Tap it → should show *exactly* "Your profile has been updated from your
      documents." plus a line telling you to still review it. Check `/profile` — the
      mapped fields (e.g. Name → full name) should actually have updated.
- [ ] Tap "View file" → opens the actual uploaded file in a new tab via a signed URL.
      Copy that URL and open it in a private/incognito window with no session — it
      should still work until it expires (5 minutes), then fail. It should **never**
      be a plain public Storage URL (check it doesn't work indefinitely or from another
      account).
- [ ] Upload a second file for the same type (Replace) → the old file should be gone
      from Storage, not just replaced in the database (check the bucket in the
      Supabase dashboard — only one file per type per user should exist).
- [ ] Delete a document → row and file both gone; the type reverts to "Not uploaded" on
      `/documents`.
- [ ] As a second test user, confirm you cannot see or fetch the first user's documents
      or signed URLs (RLS + the storage policies in `0001_init.sql` should block this
      even if you had a document's storage path).
- [ ] Try uploading a >10MB file, and a file type other than PDF/JPG/PNG (e.g. a .docx)
      → both should be rejected with a clear message, not a silent failure or a crash.

## 10. Eligibility engine (Phase 4)

- [ ] On `/jobs`, note your computed category (top badge on each card) for a few exams
      that have different rules — e.g. UPPSC PCS (domicile-restricted to Uttar Pradesh)
      and SSC GD Constable (age 18–23, with a physical-standards note).
- [ ] Edit your profile's **state** to match/not match UPPSC PCS's Uttar Pradesh
      requirement (`/profile`) → reload `/jobs` → the UPPSC PCS card's category should
      flip between "Eligible"/"Not Eligible" accordingly (domicile mismatch is a hard
      fail, not a review).
- [ ] Edit your profile's **date of birth** so you're outside SSC GD's 18–23 window →
      that card should become "Not Eligible", with the age check explaining you're
      above/below the cutoff by name.
- [ ] Clear your date of birth entirely (if possible) or use a fresh account with no
      profile → exams should show "Eligibility Needs Review", not "Eligible" — the
      engine must never default to eligible just because nothing failed.
- [ ] Open an exam's detail page (`/jobs/[id]`) → confirm you see a "Why am I
      eligible?" section (only the checks that passed), a "What is missing?" section
      (failed + review checks), and the exact disclaimer sentence — never anything
      resembling "you are 100% eligible".
- [ ] On `/jobs`, use the new eligibility filter chips (All / Eligible / Needs Review /
      Not Eligible) together with the existing category chips (SSC / Railways / ...)
      → both filters should narrow the list independently.
- [ ] On `/exams`, check the "Potentially eligible" tab count matches what `/jobs`
      shows as "Eligible" for the same profile.
- [ ] SSC GD Constable's physical-standards note and BPSC's domicile note should always
      surface as "review" items (in "What is missing?"), never silently dropped and
      never counted as a pass — confirm this stays true regardless of profile changes.

## 11. Notification system (Phase 5)

- [ ] On `/jobs`, each card shows a status badge — confirm it's plausible against the
      exam's dates (e.g. IBPS PO, whose application window is closing soon in the
      sample data, should show "Closing Soon"; SSC GD Constable, freshly notified,
      should show "New").
- [ ] Use the sort control (Newest / Last date / Exam date) → confirm the list order
      actually changes and matches the selected field.
- [ ] Tap the bookmark icon on an exam card → it should fill in immediately
      (optimistic), and stay filled after a page refresh.
- [ ] Table Editor → `profiles`: confirm `saved_exam_slugs` now contains that exam's
      id (e.g. `"ssc-cgl-2026"`) as a plain array — no `saved_exams` table row is
      created (that table is intentionally unused this phase — see README).
- [ ] Un-save it → the array entry should be removed.
- [ ] On `/exams`, the "Saved" tab should match whatever you've bookmarked on `/jobs`.
- [ ] Save an exam whose application window is "Closing Soon" (e.g. IBPS PO in the
      sample data), then reload `/jobs` → Table Editor → `notifications`: a new row
      with `type = 'deadline'` mentioning that exam should appear.
- [ ] Reload `/jobs` again immediately → confirm a **second** reminder row is NOT
      created (the 24-hour dedupe check).
- [ ] On an exam where you're "Potentially Eligible", confirm the card and detail page
      both show "You may be eligible for this exam." — and confirm this line does
      NOT appear for "Needs Review" or "Not Eligible" exams.
- [ ] Every exam card and detail page should show "Verify details in official
      notification." and at least one real (if fake-sample) official link.
- [ ] Open `scripts/seed-exams.example.ts` and confirm you understand the workflow
      before ever running it for real — it's a template, not seed data to run as-is.

## 12. Automatic official update pipeline (Phase 5.5)

Run `npm install && npm test` first (unit tests for the pure layers — classification,
hashing, the example parser). These don't need Supabase or network access.

Everything below needs a real Supabase project with migrations 0001–0009 applied, and
`CRON_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` set.

**Testing without waiting for a real government notification** — the point of this
setup is that you don't need one:

1. Grant yourself admin (SQL Editor):
   `insert into admins (user_id) values ('<your auth.users id>');`
2. Register a harmless test source instead of a real one — e.g. a page you control,
   or even a public page with a stable `<a>` link list (the bundled example parser
   just needs *some* `<a href="...">Some Title (10+ chars)</a>` pattern to match):
   ```sql
   insert into notification_sources (organization, official_url, source_type, enabled, parser_version)
   values ('Test Org', 'https://example.com', 'notification_page', true, 'example-v1');
   ```
3. Trigger the checker manually rather than waiting for the cron schedule:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-deploy>/api/cron/check-sources`
   (or `http://localhost:3000/...` in dev — the route works the same either way).
4. Check the response JSON (`checked`, `changed`, `updatesDetected`) and Table Editor →
   `detected_updates` — you should see rows classified `needs_review` (the bundled
   example parser never determines a publication date, so nothing from it ever
   auto-publishes — see `classify.ts`).
5. Visit `/admin/reviews` (as the user you granted admin) → approve or reject one →
   confirm `detected_updates.status` changes and a `source_audit_log` row appears.
6. To test AUTO_PUBLISH specifically, insert a `detected_updates` row directly with
   `classification: 'auto_publish'` and a real `exam_cycle_id`, then call
   `applyDetectedUpdate` — easiest via a one-off script using
   `lib/supabase/admin.ts`, since this path is meant to run unattended and has no UI
   of its own.
7. Run the checker against the *same* source URL again → confirm `updatesDetected: 0`
   and the source's `last_content_hash` is unchanged (nothing new was actually
   published) — this is the duplicate-detection check.
8. Edit the test page (or point `official_url` at a different page) and re-run →
   confirm a *new* `detected_updates` row appears this time.
9. Table Editor → `notification_sources`: temporarily set `official_url` to something
   that will 404, re-run → confirm `last_error` is set, `last_success_at` stays
   unchanged (not cleared), and no `detected_updates` rows were created — this is the
   "keep previous verified information on failure" behavior (requirement 16).
10. If you saved (bookmarked) a real exam whose slug matches one you've seeded via
    `seed-exams.example.ts`, and a `detected_updates` row for that exam's linked cycle
    gets published, confirm a real row appears in your `notifications` table/screen —
    and confirm it does **not** appear if you first turn off that notification type in
    Settings (`profiles.notification_preferences`).

## Known gaps (by design, this phase)

- Jobs, Exams, Preparation, and Notifications screens still read their **exam catalog**
  from `lib/mock-data.ts` — auth, profile, the document vault, save/bookmark, deadline
  reminders, and both the eligibility and notification-status *computations* are all
  real; only which exams exist is still sample data.
- OCR extraction is simulated (`lib/ocr/extract.ts`) — no real provider is called.
  The review/confirm mechanics around it are real and don't change when it is.
- **No tested parser for any real government website** — see README's "The official
  update pipeline" section. The bundled parser is an explicitly-unverified template.
- The engine doesn't model PwBD age relaxation (category-based relaxation only).
- No rate limiting on auth actions yet (Supabase Auth has some built-in, but nothing
  app-level).
- Unit tests cover the pure source-monitoring logic only (`npm test`) — the
  DB-coupled parts need the manual checklist above, not automated tests, since they'd
  otherwise require a real Supabase test project this environment can't provide.
