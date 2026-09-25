/**
 * scripts/seed-sources.example.ts
 * ============================================================================
 * Registers notification_sources rows for the organizations named in the
 * brief: SSC, RRB, IBPS, SBI, UPSC, and the UP/Bihar recruitment bodies
 * already used in this project's exam catalog (lib/mock-data.ts and the
 * Phase 1 architecture research).
 *
 * What's real here: every `official_url` below is that organization's
 * actual public website — not invented. What's NOT verified: the exact
 * sub-page each one publishes new notices on, and whether the bundled
 * example parser (lib/source-monitoring/parsers/example-notice-list.parser.ts)
 * can actually read that page's real markup — I have no network access to
 * check either. That's why every row below is inserted with `enabled:
 * false`. Flipping one to enabled is a deliberate action for whoever runs
 * this against their own Supabase project:
 *   1. Visit the organization's site yourself and find its actual notices
 *      page (often not the homepage — e.g. a dedicated "Latest
 *      Notifications" or "What's New" page).
 *   2. Update official_url to that exact page.
 *   3. Write and test a real parser against it (see the template's header
 *      for how), or confirm the bundled example parser's generic
 *      link-list pattern happens to work — don't assume it does.
 *   4. Only then set enabled: true.
 *
 * Run with: npx tsx scripts/seed-sources.example.ts
 * Requires SUPABASE_SERVICE_ROLE_KEY — see .env.example.
 * ============================================================================
 */

import { createAdminClient } from "../lib/supabase/admin";

interface SourceSeed {
  organization: string;
  officialUrl: string;
  sourceType: "notification_page" | "pdf_index" | "admit_card_page" | "answer_key_page" | "result_page" | "other";
  note: string;
}

const SOURCES: SourceSeed[] = [
  {
    organization: "Staff Selection Commission (SSC)",
    officialUrl: "https://ssc.nic.in",
    sourceType: "notification_page",
    note: "Verify the exact notices sub-page — SSC publishes per-exam notice pages, not one central list.",
  },
  {
    organization: "Railway Recruitment Board (RRB)",
    officialUrl: "https://indianrailways.gov.in",
    sourceType: "notification_page",
    note: "RRB recruitment is coordinated across zonal RRB sites (e.g. rrbcdg.gov.in) — confirm which one(s) you actually need before enabling.",
  },
  {
    organization: "Institute of Banking Personnel Selection (IBPS)",
    officialUrl: "https://ibps.in",
    sourceType: "notification_page",
    note: "Verify the exact notices/careers sub-page.",
  },
  {
    organization: "State Bank of India (SBI) Careers",
    officialUrl: "https://sbi.co.in/web/careers",
    sourceType: "notification_page",
    note: "Verify this URL still resolves to the current careers/notices page — bank career pages restructure often.",
  },
  {
    organization: "Union Public Service Commission (UPSC)",
    officialUrl: "https://upsc.gov.in",
    sourceType: "notification_page",
    note: "UPSC publishes both exam notifications and results separately — you likely want two source rows, not one.",
  },
  {
    organization: "Uttar Pradesh Public Service Commission (UPPSC)",
    officialUrl: "https://uppsc.up.nic.in",
    sourceType: "notification_page",
    note: "Verify the exact notices sub-page.",
  },
  {
    organization: "Bihar Public Service Commission (BPSC)",
    officialUrl: "https://bpsc.bihar.gov.in",
    sourceType: "notification_page",
    note: "Verify the exact notices sub-page.",
  },
];

async function main() {
  const supabase = createAdminClient();

  for (const source of SOURCES) {
    const { error } = await supabase.from("notification_sources").upsert(
      {
        organization: source.organization,
        official_url: source.officialUrl,
        source_type: source.sourceType,
        enabled: false, // deliberate — see file header
        parser_version: "example-v1",
        last_error: `Not yet verified. ${source.note}`,
      },
      { onConflict: "official_url" }
    );

    if (error) {
      console.error(`Failed to seed source "${source.organization}":`, error.message);
    } else {
      console.log(`Registered (disabled): ${source.organization} — ${source.officialUrl}`);
    }
  }

  console.log("\nAll sources inserted with enabled: false. Verify each one's real notices page and parser before enabling — see this file's header.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
