import { SourceParser } from "../types";
import { exampleNoticeListParser } from "./example-notice-list.parser";

/**
 * Add a source's real, tested parser here once one exists, keyed by the
 * version string that source's notification_sources.parser_version will
 * be set to. A source configured with a version not present here gets
 * flagged needs_parser_maintenance by the checker rather than silently
 * doing nothing — see lib/source-monitoring/checker.ts.
 */
const PARSERS: Record<string, SourceParser> = {
  [exampleNoticeListParser.version]: exampleNoticeListParser,
};

export function getParser(version: string): SourceParser | null {
  return PARSERS[version] ?? null;
}
