/**
 * scripts/seed-exams.example.ts
 * ============================================================================
 * ADMIN / CONTENT PIPELINE — HOW VERIFIED EXAM DATA GETS INTO GOVASSIST
 *
 * This is a TEMPLATE, not a ready-to-run seed. Every value below is a clearly
 * fake placeholder (see FAKE_EXAMPLE_DATA) — copy this file, replace the
 * placeholders with data sourced from an actual official notification, and
 * run it. It deliberately does NOT reuse the exams in lib/mock-data.ts: that
 * file is UI preview content with admittedly fictional dates, and mixing it
 * into a script that writes to the real database risks exactly what this
 * project's "do not invent government notifications" rule exists to
 * prevent.
 *
 * WORKFLOW
 * 1. An editor sources a real official notification (PDF/announcement) and
 *    fills in a copy of this file's ExamCycleSeed objects from it — every
 *    field should be traceable to something in that document.
 * 2. Run the script. It upserts into `exams` (idempotent on `slug`) and
 *    `exam_cycles` (idempotent on `exam_id` + `cycle_label`, per the unique
 *    constraint in 0001_init.sql) with status: "draft" — draft rows are
 *    written to the database but never returned by the app's normal reads
 *    (see the exam_cycles_public_read RLS policy: `status = 'published'`),
 *    so nothing goes live automatically.
 * 3. A second person reviews the draft row against the source notification
 *    (an "admin architecture" is only as trustworthy as its review step —
 *    this script intentionally does not skip it) and flips it to
 *    "published" — either directly in the Supabase dashboard's table editor,
 *    or via a small follow-up script using the same admin client.
 * 4. `last_verified_date` should be updated (same mechanism) whenever
 *    someone re-checks the row against the live official source — this
 *    project treats "last verified" as a real editorial fact, not a
 *    set-once timestamp.
 *
 * RUNNING THIS
 *   Requires SUPABASE_SERVICE_ROLE_KEY (server-only — see .env.example) and
 *   a TypeScript runner, e.g.:
 *     npx tsx scripts/seed-exams.example.ts
 *
 * This script uses the service-role client (lib/supabase/admin.ts), which
 * bypasses RLS — that's exactly why it's a standalone script an editor runs
 * deliberately, never code reachable from a user request.
 * ============================================================================
 */

import { createAdminClient } from "../lib/supabase/admin";

interface ExamSeed {
  slug: string;
  name: string;
  shortName: string;
  category: "SSC" | "Railways" | "Banking" | "Police" | "Defence" | "Teaching" | "State Government" | "Other";
  state: string | null;
  recruitingBody: string;
  officialWebsite: string;
}

interface ExamCycleSeed {
  examSlug: string;
  cycleLabel: string;
  officialNotificationUrl: string;
  officialApplicationUrl: string | null;
  notificationDate: string;
  lastVerifiedDate: string;
  qualificationSummary: string;
  post: string | null;
  ageMin: number | null;
  ageMax: number | null;
  ageCutoffDate: string | null;
  vacancies: number | null;
  applicationStartDate: string | null;
  applicationEndDate: string | null;
  admitCardDate: string | null;
  answerKeyDate: string | null;
  resultDate: string | null;
  syllabusSummary: string | null;
  markingSchemeSummary: string | null;
  examPattern: { tierLabel: string; sections: string[]; duration: string; negativeMarking: string }[];
  importantDates: { label: string; date: string; isTentative?: boolean }[];
}

// ⚠️ FAKE PLACEHOLDER DATA — replace every field from a real official
// notification before running this for anything other than a dry run.
// "FAKE-EXAMPLE-ORG" and the .example.gov.in domain are deliberately
// unreal so an accidental run can never be mistaken for real content.
const FAKE_EXAMPLE_EXAM: ExamSeed = {
  slug: "example-recruitment-exam",
  name: "REPLACE WITH THE EXAM'S FULL OFFICIAL NAME",
  shortName: "REPLACE (e.g. Example Exam 2027)",
  category: "Other",
  state: null,
  recruitingBody: "FAKE-EXAMPLE-ORG (replace with the real recruiting body)",
  officialWebsite: "https://example.gov.in",
};

const FAKE_EXAMPLE_CYCLE: ExamCycleSeed = {
  examSlug: FAKE_EXAMPLE_EXAM.slug,
  cycleLabel: "REPLACE (e.g. 2027)",
  officialNotificationUrl: "https://example.gov.in/notification.pdf",
  officialApplicationUrl: "https://example.gov.in/apply",
  notificationDate: "1970-01-01",
  lastVerifiedDate: "1970-01-01",
  qualificationSummary: "REPLACE — copy the exact wording from the notification",
  post: null,
  ageMin: null,
  ageMax: null,
  ageCutoffDate: null,
  vacancies: null,
  applicationStartDate: null,
  applicationEndDate: null,
  admitCardDate: null,
  answerKeyDate: null,
  resultDate: null,
  syllabusSummary: null,
  markingSchemeSummary: null,
  examPattern: [],
  importantDates: [],
};

async function seedExam(exam: ExamSeed) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("exams")
    .upsert(
      {
        slug: exam.slug,
        name: exam.name,
        short_name: exam.shortName,
        category: exam.category,
        state: exam.state,
        recruiting_body: exam.recruitingBody,
        official_website: exam.officialWebsite,
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert exam "${exam.slug}": ${error?.message}`);
  }
  return data.id;
}

async function seedExamCycle(examId: string, cycle: ExamCycleSeed) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("exam_cycles").upsert(
    {
      exam_id: examId,
      cycle_label: cycle.cycleLabel,
      status: "draft", // never "published" from this script — see step 3 above
      official_notification_url: cycle.officialNotificationUrl,
      official_application_url: cycle.officialApplicationUrl,
      notification_date: cycle.notificationDate,
      last_verified_date: cycle.lastVerifiedDate,
      qualification_summary: cycle.qualificationSummary,
      post: cycle.post,
      age_min: cycle.ageMin,
      age_max: cycle.ageMax,
      age_cutoff_date: cycle.ageCutoffDate,
      vacancies: cycle.vacancies,
      application_start_date: cycle.applicationStartDate,
      application_end_date: cycle.applicationEndDate,
      admit_card_date: cycle.admitCardDate,
      answer_key_date: cycle.answerKeyDate,
      result_date: cycle.resultDate,
      syllabus_summary: cycle.syllabusSummary,
      marking_scheme_summary: cycle.markingSchemeSummary,
      exam_pattern: cycle.examPattern,
      important_dates: cycle.importantDates,
    },
    { onConflict: "exam_id,cycle_label" }
  );

  if (error) {
    throw new Error(`Failed to upsert exam_cycle "${cycle.examSlug} ${cycle.cycleLabel}": ${error.message}`);
  }
}

async function main() {
  console.log("Seeding (as draft — not publicly visible until reviewed and published)...");
  const examId = await seedExam(FAKE_EXAMPLE_EXAM);
  await seedExamCycle(examId, FAKE_EXAMPLE_CYCLE);
  console.log(`Done. "${FAKE_EXAMPLE_EXAM.slug}" is now in exam_cycles with status "draft".`);
  console.log("Review it against the source notification, then flip status to \"published\" once verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
