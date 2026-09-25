# GovAssist — Phase 1 + 2 + 3 + 4 + 5 + 5.5 (Frontend + Auth/Database + Document Vault + Eligibility Engine + Notification System + Automatic Official Update Pipeline)

A personal government exam assistant for Indian students.

- **Phase 1** built the complete frontend UI on mock data.
- **Phase 2** added real authentication and a database: Supabase Auth
  (email/password, session persistence, password reset) and a Postgres
  schema with row-level security so a user can never read or write another
  user's data.
- **Phase 3** added the secure document vault: private Supabase Storage
  uploads, per-field OCR review (currently **simulated** — see
  `lib/ocr/extract.ts`), edit/confirm before anything is trusted, and an
  explicit "apply to profile" step.
- **Phase 4** added the eligibility engine (`lib/eligibility/`): a pure,
  deterministic rules evaluator that compares the real signed-in user's
  profile against each exam cycle's own structured rules and produces one
  of three results — Potentially Eligible / Eligibility Needs Review /
  Likely Not Eligible — with a per-criterion explanation.
- **Phase 5** (this update) rounds out the notification record itself
  (post, admit card/answer key/result dates, syllabus, marking scheme,
  application link — see `supabase/migrations/0005_notification_fields.sql`),
  adds sorting and a real notification-status engine (New / Applications
  Open / Closing Soon / Closed / Exam Upcoming / Result Released — see
  `lib/notifications/status.ts`), makes save/bookmark genuinely real
  (`lib/actions/saved-exams.ts`), adds real deadline reminders
  (`lib/actions/reminders.ts`), and adds the admin/content pipeline
  (`scripts/seed-exams.example.ts`) verified exam data will eventually be
  added through. See "The notification system" section below for details.
- **Phase 5.5** adds the automatic official-update pipeline: a source
  registry, Vercel Cron-scheduled checking, content-hash change detection,
  a pluggable parser architecture, confidence-based
  AUTO_PUBLISH/NEEDS_REVIEW/REJECT classification, an admin review UI at
  `/admin/reviews`, a full audit log, and real notification fan-out to
  users who've saved an affected exam. **Important honesty note**: I have
  no network access in this environment, so there is no tested, working
  scraper for any specific government site in here — see "The official
  update pipeline" section below for exactly what's real infrastructure
  versus a clearly-labeled template.
  As with every phase, see `TESTING.md` for a manual checklist — **I have
  not run these flows against a live Supabase project myself** (no network
  access in the environment I built this in); the checklist is there for
  you to verify before trusting it.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project's URL + anon key
npm run check-env            # confirms the required env vars are set
npm run dev
```

See `TESTING.md` for full Supabase project setup (running the migrations, the
storage bucket, and the manual test checklist).

Open http://localhost:3000. The app is mobile-first — use your browser's device toolbar
(iPhone/Android width) for the intended experience, or open it on your phone.

## What's real vs. sample

**Real (Supabase-backed):** signup, login, logout, password reset, session persistence,
route protection, your profile and education data, profile editing, the full
document vault — private upload, viewing (signed URLs, 5-minute expiry), per-field
review/edit/confirm, deletion, and applying confirmed fields to your profile — and
save/bookmark + deadline reminders (see "The notification system" below).

**Real (computed live, not stored):** eligibility and notification status. Jobs, My
Exams, the exam detail screen, and the Home dashboard's "Potentially eligible" count
all run `evaluateEligibility()` against your actual profile every time the page
renders; every exam's New/Applications Open/Closing Soon/Closed/Exam Upcoming/Result
Released badge is computed the same way, from dates, via `computeNotificationStatus()`.
Nothing about either *result* is mock data — only the exam catalog they're computed
against (see below). See "The eligibility engine" and "The notification system"
sections for how each works.

**Simulated, not silently pretended:** OCR extraction. There's no provider key wired
in — `lib/ocr/extract.ts` returns plausible sample values with deliberately mixed
confidence so the review UI is genuinely exercised, and the file at the top of that
function documents exactly what to change to wire a real provider. Every other part of
the vault (storage security, the review gate, status lifecycle) is real and doesn't
change when OCR does.

**Still mock data** (`lib/mock-data.ts`, flagged in-app with a "Sample data" banner):
the exam catalog itself — which exams exist, their published rules, dates, and
patterns. The database schema for this already exists
(`supabase/migrations/0001_init.sql`, `0004_eligibility_rules.sql`,
`0005_notification_fields.sql`) — exams just aren't sourced from it yet. Every mock
exam's `rules` field is the same shape the engine expects from a real exam_cycles row
(see `lib/eligibility/from-db-row.ts`), so switching the catalog's source later
doesn't touch the engine or any page. See `scripts/seed-exams.example.ts` for the
intended path real, verified data eventually takes into this same schema.

`DEMO_MODE` in `lib/mock-data.ts` is the single switch that turns off the sample-data
banners once everything is migrated to real data.

## The eligibility engine

`lib/eligibility/engine.ts` exports one pure function, `evaluateEligibility(profile,
rules) → EligibilityResult`. Pure means: no network call, no LLM, no I/O — same inputs,
same output, every time. That's deliberate: an eligibility decision needs to be
something a person can read and verify line by line, which a model call can't
guarantee.

**Result shape:**
```ts
{
  category: "potentially_eligible" | "needs_review" | "likely_not_eligible",
  checks: [{ label, status: "pass" | "fail" | "review", explanation }],
  disclaimer: string, // varies by category — never "you are 100% eligible"
}
```

**How the category is decided:** any `fail` → `likely_not_eligible` (a confirmed
disqualifier outranks an unknown, even if other fields are fine). No `fail` but at
least one `review` (or no rules published at all) → `needs_review`. All checks pass →
`potentially_eligible`. A cycle that publishes nothing checkable is treated as
"can't confirm", never as a free pass.

**Why it's modular — adding a new exam never touches this file.** Each check
(age, degree, subject, percentage, category, domicile, gender) only runs when the
*specific exam cycle* actually publishes that field — a null field means "not
applicable" to the engine, not "assume yes". Physical standards, experience, and any
other freeform condition always come back as `review`, because they're never
verifiable against profile data. Adding an exam with a totally different combination
of rules (say, a defence exam with a physical standard and no percentage requirement)
is purely a data change — a new row shaped like `EligibilityRules`
(`lib/eligibility/types.ts`) — never a code change to the engine, `ExamCard`, or any
page.

**Two mappers, one engine:** `lib/eligibility/from-profile.ts` converts a real
Supabase profile+education into the engine's `ApplicantProfile` input (this is live
today). `lib/eligibility/from-db-row.ts` converts a real `exam_cycles` row into
`EligibilityRules` (not called anywhere yet, since the exam catalog is still mock data
— see above) — swapping the catalog's source is a one-line change to which mapper
feeds the engine, not a rewrite.

## The notification system

**Status.** `lib/notifications/status.ts` exports `computeNotificationStatus(exam)` —
pure, like the eligibility engine, and for the same reason: a status a person can
verify against the dates shown next to it. It picks the single most relevant thing
happening with a cycle right now, in priority order: a declared result outranks
everything else, then an upcoming exam sitting (applications closed, exam not yet
happened) outranks a plain "closed", then closing-soon, then "new" (notified within
the last 7 days), falling back to "applications open". `deriveExamDate()` in the same
file picks the exam-sitting date out of `importantDates` by label — a heuristic,
documented as such, since the catalog doesn't (yet) carry a single dedicated exam-date
field the way it does for admit card/answer key/result dates.

**Save/bookmark — real, but deliberately not via the `saved_exams` table.** That table
(from `0001_init.sql`) foreign-keys to `exam_cycles(id)` — correct for a real catalog,
but today's exams are mock objects with string ids like `"ssc-cgl-2026"`, not rows with
real UUIDs. Rather than force a fake FK, `0006_saved_exam_slugs.sql` adds a real,
RLS-protected `profiles.saved_exam_slugs text[]` column; `lib/actions/saved-exams.ts`
toggles it. `saved_exams` itself is untouched, ready for when the catalog is real —
migrating existing bookmarks then is a slug → `exam_cycles.id` lookup, not a schema
change.

**Deadline reminders — real, on-demand.** There's no cron/scheduled-function
infrastructure here, so `lib/actions/reminders.ts`'s `ensureDeadlineReminders()` runs
on every Jobs page load instead: for each saved exam that's closing soon, it writes a
real row to the `notifications` table, unless one was already written for that exam in
the last 24 hours (checked by querying, not assumed) — safe to call repeatedly without
spamming.

**The admin/content pipeline.** `scripts/seed-exams.example.ts` is a real, runnable
script against the service-role client (`lib/supabase/admin.ts`) — but every value in
it is a clearly fake placeholder (`FAKE-EXAMPLE-ORG`, `example.gov.in`), and it
deliberately does not reuse `lib/mock-data.ts`'s exams, since those have admittedly
fictional dates and mixing UI-preview content into a script that writes to the real
database is exactly the kind of thing "do not invent government notifications" rules
out. It writes with `status: "draft"` — draft rows exist in the database but are
invisible through the app's normal read path (`exam_cycles_public_read` requires
`status = 'published'`) until a second person reviews the draft against the source
notification and flips it. The file's header spells out the full workflow.

## The official update pipeline (Phase 5.5)

**What's real:** the entire architecture around fetching, hashing, classifying,
reviewing, applying, and notifying. `lib/source-monitoring/checker.ts` fetches a
source, hashes its content, compares against the last known hash (skipping
unchanged pages entirely — no duplicate rows), runs the configured parser, and
classifies each parsed update via `classify.ts` (pure, no exam-specific
special-casing: a brand-new notification always requires review; everything else
needs a confidently-extracted date plus all-high-confidence fields to auto-publish).
`AUTO_PUBLISH` updates are applied immediately via `apply.ts`; `NEEDS_REVIEW` ones
wait at `/admin/reviews`, gated by a real server-side admin check
(`lib/actions/admin-review.ts`) against a dedicated `admins` table — deliberately
separate from `profiles`, so admin status can never be self-granted through a
crafted API call the way a column on a user-editable row could be.

**What's a template, not tested production code:**
`lib/source-monitoring/parsers/example-notice-list.parser.ts`. I have no network
access in this environment — I cannot load ssc.nic.in or any other official site to
see its real HTML and write selectors that actually match it. This parser
demonstrates the `SourceParser` contract with a generic "list of dated links"
pattern and is explicitly documented, in its own header, as unverified. Same
principle as `scripts/seed-exams.example.ts` from Phase 5: a real, runnable shape,
deliberately not claiming to be more than that.

**Scheduling:** one Vercel Cron entry (`vercel.json`) hits
`/api/cron/check-sources` every 6 hours by default — adjust the schedule for your
plan (Hobby allows once/day; Pro allows finer granularity). A single trigger serves
every source regardless of its own `check_frequency_minutes`, since
`getDueSources()` only returns sources actually due. The route requires
`CRON_SECRET` and refuses every request without it — no unauthenticated fallback.

**Source of truth, always shown:** every notification the pipeline sends links back
to `official_url`, and every field it writes to `exam_cycles` keeps that cycle's
existing `official_notification_url` — nothing in this pipeline ever hides or
replaces the official link with anything else.

## Folder structure

```
app/
  page.tsx                    Landing page (public)
  (auth)/login, signup, forgot-password, update-password
  auth/callback/route.ts      Exchanges Supabase email-link codes for a session
  onboarding/                 Multi-step profile setup (persists to Supabase)
  (app)/                      Authenticated shell (bottom nav + top bar), force-dynamic
    home/                     Dashboard (real name/completion/eligibility/saved, mock exam catalog)
    jobs/, jobs/[id]/         Exam listing (filter+sort) + eligibility/notification detail screen
    exams/                    My Exams (live eligibility + real saved bucket, mock exam catalog)
    preparation/, .../mock-test/[examId]/  (mock data)
    documents/, documents/[type]/          Real — document vault (see below)
    profile/                  Real Supabase data, editable
    notifications/, settings/ (settings: real logout; notifications: mock data + real deadline reminders)
components/
  ui/, layout/, documents/, profile/, onboarding/, home/
  exams/
    ExamCard, CategoryFilterBar, EligibilityFilterBar, SortControl
    NotificationStatusBadge, SaveExamButton, JobsListClient, MyExamsClient
lib/
  types.ts, mock-data.ts, mock-questions.ts, constants.ts, utils.ts
  useDemoLoadState.ts         Shared loading/ready/error simulation hook (Preparation/Notifications only)
  env.ts                      Env var validation → null-safe config, never crashes the build
  validation.ts               Zod schemas for auth/profile forms
  profile-completion.ts       Computed (not stored) completion percentage
  document-types.ts           The 8 document types, slugs, and OCR field templates
  ocr/extract.ts               ⚠️ Simulated extraction — see file header to wire a real provider
  eligibility/
    types.ts                  EligibilityRules / ApplicantProfile / EligibilityResult
    engine.ts                 evaluateEligibility() — pure, deterministic, no I/O
    from-profile.ts           Real Supabase profile+education → ApplicantProfile (live)
    from-db-row.ts            Real exam_cycles row → EligibilityRules (ready, not wired yet)
  notifications/
    status.ts                 computeNotificationStatus() — pure, deterministic, no I/O
  supabase/
    client.ts                 Browser Supabase client (returns null if unconfigured)
    server.ts                 Server Component / Server Action client (same)
    admin.ts                  Service-role client — server-only, never bundled to the browser
    database.types.ts         Hand-written types mirroring the schema
  actions/
    session.ts                Shared requireUser() helper
    auth.ts                   signUp / signIn / signOut / password reset server actions
    profile.ts                Onboarding persistence + profile/education editing
    documents.ts              Upload, view, edit, confirm, delete, apply-to-profile
    saved-exams.ts            Real bookmark toggle (profiles.saved_exam_slugs)
    reminders.ts               Real, on-demand deadline reminder notifications
scripts/
  seed-exams.example.ts       Admin content pipeline template (fake placeholders — see header)
supabase/
  migrations/
    0001_init.sql              Full schema + RLS policies for all 14 tables
    0002_documents_unique.sql  One active document per type per user
    0003_storage_bucket.sql    Creates the private `documents` bucket
    0004_eligibility_rules.sql Structured per-cycle eligibility fields on exam_cycles
    0005_notification_fields.sql  Post, admit/answer/result dates, syllabus, marking scheme, application link
    0006_saved_exam_slugs.sql  Real bookmark storage (profiles.saved_exam_slugs)
    0007_source_monitoring.sql  notification_sources, detected_updates, source_audit_log + exam_cycles stage fields
    0008_notification_preferences.sql  Real, persisted notification prefs (profiles.notification_preferences)
    0009_admin_roles.sql       Separate admin table — never self-grantable via profiles
lib/source-monitoring/
  types.ts, classify.ts, fetch.ts, checker.ts, apply.ts, notify.ts, deadline-reminders.ts
  parsers/                     registry.ts + example-notice-list.parser.ts (template, unverified)
  __tests__/                   Unit tests for the pure layers (classify/hash/parser)
app/
  api/cron/check-sources/route.ts   Vercel Cron endpoint (CRON_SECRET-protected)
  admin/reviews/page.tsx            Admin review UI (real admin-only gate)
components/admin/AdminReviewClient.tsx
vercel.json                    Cron schedule
middleware.ts                 Session refresh + protected-route redirect
```

## Design system

Tokens live in `tailwind.config.ts` (colors, radius, shadows) and `app/layout.tsx` (fonts). Summary:
- **Paper** (`#F7F6F2`) background, **ink** (`#14181F`) text — not pure black/white.
- **Brand** navy (`#1F3A5F`) is the dominant color: headers, primary actions, active nav.
- **Accent** marigold (`#C97D2C`) is used sparingly — deadlines, highlights, the demo-data banner.
- Status colors (`eligible` / `caution` / `ineligible`) are deliberately desaturated.
- `font-display` (Fraunces) for headings and big numbers; `font-body` (Manrope) for everything else.
- Cards use hairline borders + a colored left-edge strip for status, not heavy shadows.

## What's NOT in this build yet

- Jobs/Exams/Preparation/Notifications screens still read a mock exam **catalog** —
  the schema exists (`exam_cycles` now has all Phase 4/5 columns, `mock_tests`, etc.)
  but nothing seeds or reads real exams from it yet. Eligibility and notification
  status *results* are real (see the two engine sections above); the exams they're
  computed against are not. `scripts/seed-exams.example.ts` is the real, documented
  path for when verified data is ready — it just isn't pre-loaded with any.
- Save/bookmark and deadline reminders are fully real and functional today —
  `profiles.saved_exam_slugs` has no foreign key to the exam catalog (that was the
  point of the slug design), so saving a mock exam persists correctly right now. What's
  not real yet is the catalog those saved slugs point at.
- **OCR is simulated, not real** — see `lib/ocr/extract.ts`. Everything around it
  (storage security, the field-by-field review gate, status lifecycle) is real.
- The eligibility engine doesn't model PwBD-specific age relaxation (only
  category-based) — it simply doesn't check it, rather than fake a number.
- Push notifications (device-level) aren't implemented — deadline reminders write
  real rows to the in-app `notifications` table/screen, not a push/SMS alert.
- No DigiLocker OAuth.
- No PWA icons (manifest references them; add real PNGs before shipping installability).
- No rate limiting on auth endpoints beyond what Supabase Auth provides by default.
- **No tested, working parser for any real government site** — see "The official
  update pipeline" above. `example-notice-list.parser.ts` is a template.
- The source-monitoring pipeline (Phase 5.5) writes to the real `exam_cycles` table,
  which is correct and ready — but since Jobs/Exams/Home still read the mock catalog
  (see the first bullet above), a real detected update won't visibly change those
  screens until that catalog migration happens. It will already show up correctly in
  `notifications` and the audit log, though.
- Deadline-reminder dedup (both the mock-catalog and real-exam versions) is a
  batch-level check, not per-recipient — see the comment in
  `lib/source-monitoring/deadline-reminders.ts` for the honest limitation.
- Unit tests exist for the pure logic (`lib/source-monitoring/__tests__/`) — `npm
  test` (vitest). The DB-coupled parts (checker's dedup, apply's writes, notify's
  fan-out) aren't covered by these and would need a real Supabase test project to
  exercise; see `TESTING.md` for how to test those manually instead.

See the architecture doc from the planning phase for how each of these plugs in
without restructuring the frontend or database.
