// Pure presentation logic for the user-facing official updates feed: groups
// published stage updates per exam cycle, newest first, with the latest
// verified version separated from superseded history. No I/O.

import { STAGE_LABEL } from "@/lib/source-monitoring/stage/labels";
import { Database } from "@/lib/supabase/database.types";

type StageRow = Database["public"]["Tables"]["exam_stage_updates"]["Row"];

export interface CycleInfo {
  examName: string;
  cycleLabel: string;
}

export interface StageUpdateView {
  id: string;
  typeLabel: string;
  title: string;
  /** Always present: who published it. */
  organization: string;
  /** Null when the official page/document does not state one — never a guess. */
  publicationDate: string | null;
  eventDate: string | null;
  /** Always present: the official document or page. */
  sourceUrl: string;
  version: number;
  isLatest: boolean;
}

export interface CycleUpdateGroup {
  cycleId: string;
  examName: string;
  cycleLabel: string;
  latest: StageUpdateView[];
  /** Older versions kept for the record, newest first. */
  history: StageUpdateView[];
}

function toView(r: StageRow): StageUpdateView {
  return {
    id: r.id,
    typeLabel: STAGE_LABEL[r.update_type],
    title: r.title,
    organization: r.organization,
    publicationDate: r.publication_date,
    eventDate: r.event_date,
    sourceUrl: r.source_url,
    version: r.version,
    isLatest: r.is_latest,
  };
}

function newestFirst(a: StageRow, b: StageRow): number {
  const da = a.publication_date ?? "";
  const db = b.publication_date ?? "";
  if (da !== db) return da < db ? 1 : -1; // undated sort last
  return a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0;
}

export function buildOfficialUpdateGroups(rows: StageRow[], cycles: Map<string, CycleInfo>): CycleUpdateGroup[] {
  const byCycle = new Map<string, StageRow[]>();
  for (const r of rows) {
    const list = byCycle.get(r.exam_cycle_id) ?? [];
    list.push(r);
    byCycle.set(r.exam_cycle_id, list);
  }

  const groups: CycleUpdateGroup[] = [];
  for (const [cycleId, list] of Array.from(byCycle.entries())) {
    const info = cycles.get(cycleId);
    if (!info) continue; // cycle not visible (unpublished) -> nothing to show
    const sorted = [...list].sort(newestFirst);
    groups.push({
      cycleId,
      examName: info.examName,
      cycleLabel: info.cycleLabel,
      latest: sorted.filter((r) => r.is_latest).map(toView),
      history: sorted.filter((r) => !r.is_latest).map(toView),
    });
  }

  // Cycles with the most recent activity first.
  const newest = (g: CycleUpdateGroup) => g.latest[0]?.publicationDate ?? g.history[0]?.publicationDate ?? "";
  return groups.sort((a, b) => (newest(a) < newest(b) ? 1 : newest(a) > newest(b) ? -1 : a.examName.localeCompare(b.examName)));
}
