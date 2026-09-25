// ---------------------------------------------------------------------------
// ⚠️ TEMPLATE PARSER — not verified against any real government website.
//
// I have no network access in the environment this was built in, so I
// cannot load ssc.nic.in, indianrailways.gov.in, or any other official
// site to see its actual HTML and write selectors that really match it.
// Anything that looked like a working SSC/RRB/IBPS scraper here would be
// guesswork dressed up as code — exactly what this project's "verify
// before trusting" principle exists to prevent.
//
// What this file DOES demonstrate honestly: the SourceParser contract
// (lib/source-monitoring/types.ts) and a reasonable general pattern for a
// "notices list" page — most official recruitment sites publish new
// notices as dated links in some kind of list/table. To make this real for
// an actual source:
//   1. Fetch the real page (fetchAndHash in ../fetch.ts already does this
//      part correctly and generically).
//   2. Inspect its actual HTML/DOM structure.
//   3. Replace the regex-based extraction below with something that
//      actually matches that structure — a proper HTML parser (e.g.
//      `cheerio`, not yet a dependency here) is strongly preferable to
//      regex once you're looking at real markup; regex is used below only
//      because it needs no new dependency for a template nobody should
//      run against production traffic as-is.
//   4. Test it against saved copies of real fetched pages (see
//      lib/source-monitoring/__tests__ for the fixture-based pattern to
//      follow) before ever pointing it at a live source with
//      classification enabled.
// ---------------------------------------------------------------------------

import { ParsedUpdate, SourceParser, UpdateType } from "../types";

const KEYWORD_TO_UPDATE_TYPE: { pattern: RegExp; type: UpdateType }[] = [
  { pattern: /corrigendum|amendment/i, type: "corrigendum" },
  { pattern: /admit card|hall ticket/i, type: "admit_card" },
  { pattern: /answer key/i, type: "answer_key" },
  { pattern: /response sheet|candidate response/i, type: "response_sheet" },
  { pattern: /objection/i, type: "objection_window" },
  { pattern: /result/i, type: "result" },
  { pattern: /cut.?off/i, type: "cutoff" },
  { pattern: /extend|revised date|last date/i, type: "application_end_date_change" },
];

function classifyTitleAsUpdateType(title: string): UpdateType {
  for (const { pattern, type } of KEYWORD_TO_UPDATE_TYPE) {
    if (pattern.test(title)) return type;
  }
  return "new_notification";
}

/** Matches `<a href="...">Some Notice Title</a>` style list items — a
 *  common but by no means universal shape. Real official pages vary
 *  enormously (some are pure PDF indexes, some render notices via
 *  JavaScript this fetch-based approach can't see at all — see the
 *  "Do NOT promise..." limitation in the project's brief). */
const LINK_PATTERN = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{10,200})<\/a>/gi;

export const exampleNoticeListParser: SourceParser = {
  version: "example-v1",
  parse(content, context): ParsedUpdate[] {
    const updates: ParsedUpdate[] = [];
    let match: RegExpExecArray | null;

    // Regenerate the regex's lastIndex-tracking state per call — a module
    // level `exec` loop on a shared regex is a classic source of subtle
    // bugs if parse() is ever called concurrently.
    const pattern = new RegExp(LINK_PATTERN.source, LINK_PATTERN.flags);

    while ((match = pattern.exec(content)) !== null) {
      const [, href, rawTitle] = match;
     const title = (rawTitle ?? "").replace(/\s+/g, " ").trim();
      if (title.length < 10) continue;

     const documentUrl = href ? (href.startsWith("http") ? href : new URL(href, context.sourceUrl).toString()) : "";

      updates.push({
        updateType: classifyTitleAsUpdateType(title),
        title,
        documentUrl,
        // A template can't confidently claim a publication date without
        // real markup to parse it from — leaving this null (rather than
        // guessing "today") is what correctly routes every match from
        // this template through NEEDS_REVIEW instead of AUTO_PUBLISH,
        // until a real, tested parser replaces it.
        publicationDate: null,
        extractedFields: [{ label: "Organization", value: context.organization, confidence: "high" }],
      });
    }

    return updates;
  },
};
