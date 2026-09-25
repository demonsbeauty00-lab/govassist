/**
 * scripts/seed-pyq-sources.example.ts
 * ============================================================================
 * Registers paper_ingestion_sources rows — the registry the PYQ cron
 * (app/api/cron/check-pyq-sources/route.ts) checks for verified paper
 * documents to import.
 *
 * Honesty note, same as scripts/seed-sources.example.ts: the bundled
 * "json-v1" parser (lib/pyq/ingestion/parsers/json-paper.parser.ts) reads a
 * STRUCTURED JSON transcript of a paper, not an arbitrary PDF on an
 * official site directly. Pointing a source row at a raw PDF URL today
 * would fetch real bytes but fail to parse them — there is no bundled
 * PDF/OCR-backed parser yet (see that file's header for why, and for what
 * building one for real would take). Every row below is inserted with
 * `enabled: false` for that reason. What DOES work end-to-end right now is
 * the admin manual-import form at /admin/pyq-reviews, which accepts a
 * pasted JSON transcript directly — use that until a real document parser
 * is registered here.
 *
 * Run with: npx tsx scripts/seed-pyq-sources.example.ts
 * Requires SUPABASE_SERVICE_ROLE_KEY — see .env.example.
 * ============================================================================
 */

import { createAdminClient } from "../lib/supabase/admin";

interface SourceSeed {
  organization: string;
  officialUrl: string;
  examSlug: string;
  note: string;
}

const SOURCES: SourceSeed[] = [
  {
    organization: "Staff Selection Commission (SSC)",
    officialUrl: "https://ssc.nic.in",
    examSlug: "ssc-cgl-2026",
    note: "SSC does not publish a single structured PYQ index — question papers are typically compiled by third-party coaching sites, not SSC itself. Verify a genuinely official source before enabling.",
  },
  {
    organization: "Institute of Banking Personnel Selection (IBPS)",
    officialUrl: "https://ibps.in",
    examSlug: "ibps-po-2026",
    note: "Verify whether IBPS publishes an official question-paper archive before enabling — many banking PYQ sources are unofficial compilations.",
  },
];

async function main() {
  const supabase = createAdminClient();

  for (const source of SOURCES) {
    const { error } = await supabase.from("paper_ingestion_sources").upsert(
      {
        organization: source.organization,
        official_url: source.officialUrl,
        exam_slug: source.examSlug,
        source_type: "official_pdf_index",
        enabled: false, // deliberate — see file header
        parser_version: "json-v1",
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

  console.log(
    "\nAll sources inserted with enabled: false. Until a real PDF/OCR-backed parser is registered in " +
      "lib/pyq/ingestion/parsers/registry.ts, use the manual import form at /admin/pyq-reviews instead."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
