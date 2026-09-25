import { PaperParser } from "../types";
import { jsonPaperParser } from "./json-paper.parser";

const PARSERS: Record<string, PaperParser> = {
  [jsonPaperParser.version]: jsonPaperParser,
};

/** Mirrors lib/source-monitoring/parsers/registry.ts's getParser() — a
 *  paper_ingestion_sources.parser_version with no matching implementation
 *  here is a config error (see run.ts), not "nothing to do". */
export function getPaperParser(version: string): PaperParser | null {
  return PARSERS[version] ?? null;
}
