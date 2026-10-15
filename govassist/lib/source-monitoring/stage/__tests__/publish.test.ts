import { describe, it, expect } from "vitest";
import { publishStageUpdate, StageStore, NewStageRow } from "../publish";
import type { ExistingStageRow } from "../versioning";

interface Row extends NewStageRow { id: string; isLatest: boolean; supersededBy: string | null }

function memoryStore(opts: { failDemote?: boolean; failPromote?: boolean } = {}) {
  // `opts` is read at call time, so a test can flip a failure on after seeding.
  const rows: Row[] = [];
  let n = 0;
  const store: StageStore = {
    async findByDetectedUpdate(id) {
      const r = rows.find((x) => x.detected_update_id === id);
      return r ? { id: r.id, isLatest: r.isLatest, version: r.version } : null;
    },
    async listForCycleType(cycleId, type) {
      return rows.filter((r) => r.exam_cycle_id === cycleId && r.update_type === type).map<ExistingStageRow>((r) => ({
        id: r.id, seriesKey: r.series_key, documentKey: r.document_key, publicationDate: r.publication_date, isLatest: r.isLatest, version: r.version,
      }));
    },
    async insert(row) {
      if (rows.some((r) => r.exam_cycle_id === row.exam_cycle_id && r.update_type === row.update_type && r.document_key === row.document_key)) return { duplicate: true };
      const id = `s${++n}`;
      rows.push({ ...row, id, isLatest: false, supersededBy: row.superseded_by });
      return { id };
    },
    async demote(ids, newId) {
      if (opts.failDemote) return { error: "demote failed" };
      for (const r of rows) if (ids.includes(r.id)) { r.isLatest = false; r.supersededBy = newId; }
      return {};
    },
    async restore(ids) { for (const r of rows) if (ids.includes(r.id)) { r.isLatest = true; r.supersededBy = null; } },
    async promote(id) {
      if (opts.failPromote) return { error: "promote failed" };
      const r = rows.find((x) => x.id === id); if (r) r.isLatest = true; return {};
    },
    async remove(id) { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); },
  };
  return { store, rows };
}

let seq = 0;
const upd = (o: Record<string, unknown> = {}) => ({
  id: `d${++seq}`, source_id: "src", exam_cycle_id: "c1", update_type: "answer_key", title: "Provisional Answer Key - Tier I",
  official_url: "https://ssc.gov.in/n", document_url: "https://ssc.gov.in/a.pdf", publication_date: "2027-03-10", event_date: null,
  cycle_match: null, series_key: null, is_revision: false, content_hash: "h", extracted_fields: [], classification: "auto_publish",
  status: "pending", detected_at: "", processed_at: null, reviewed_by: null, reviewed_at: null, review_notes: null, ...o,
}) as any;

const run = (store: StageStore, update: any) => publishStageUpdate({ store, update, organization: "SSC", verification: "auto_verified" });

describe("publishStageUpdate", () => {
  it("publishes the first document as the latest, version 1, with organization and link", async () => {
    const { store, rows } = memoryStore();
    const r = await run(store, upd());
    expect(r).toMatchObject({ ok: true, action: "new", version: 1, isLatest: true });
    expect(rows[0]).toMatchObject({ organization: "SSC", source_url: "https://ssc.gov.in/a.pdf", isLatest: true });
  });

  it("is idempotent for the same detected update", async () => {
    const { store, rows } = memoryStore();
    const u = upd();
    await run(store, u);
    const again = await run(store, u);
    expect(again.action).toBe("already");
    expect(rows).toHaveLength(1);
  });

  it("does not create a second row for the same document from another detection", async () => {
    const { store, rows } = memoryStore();
    await run(store, upd());
    const dup = await run(store, upd());
    expect(dup).toMatchObject({ ok: true, action: "duplicate", stageUpdateId: null });
    expect(rows).toHaveLength(1);
  });

  it("a revised document replaces the old one but keeps it in history", async () => {
    const { store, rows } = memoryStore();
    await run(store, upd());
    const rev = await run(store, upd({
      title: "Revised Answer Key - Tier I", document_url: "https://ssc.gov.in/b.pdf", publication_date: "2027-03-20", is_revision: true,
    }));
    expect(rev).toMatchObject({ action: "supersede", version: 2, isLatest: true });
    expect(rows).toHaveLength(2);
    const [oldRow, newRow] = rows as [Row, Row];
    expect(oldRow).toMatchObject({ isLatest: false, supersededBy: newRow.id });
    expect(newRow.isLatest).toBe(true);
    expect(rows.filter((r) => r.isLatest)).toHaveLength(1);
  });

  it("an approved ambiguous document replaces the latest", async () => {
    const { store, rows } = memoryStore();
    await run(store, upd());
    const second = await run(store, upd({ document_url: "https://ssc.gov.in/c.pdf", publication_date: "2027-03-12" }));
    expect(second.action).toBe("supersede");
    expect(rows.filter((r) => r.isLatest)).toHaveLength(1);
  });

  it("an older document arriving late never displaces the newer verified one", async () => {
    const { store, rows } = memoryStore();
    const newer = await run(store, upd({ publication_date: "2027-04-01", document_url: "https://ssc.gov.in/new.pdf" }));
    const late = await run(store, upd({ publication_date: "2027-03-01", document_url: "https://ssc.gov.in/old.pdf", is_revision: true }));
    expect(late).toMatchObject({ action: "historical", isLatest: false });
    expect(rows.find((r) => r.id === newer.stageUpdateId)?.isLatest).toBe(true);
    expect(rows.find((r) => r.id === late.stageUpdateId)).toMatchObject({ isLatest: false, supersededBy: newer.stageUpdateId });
  });

  it("rolls back completely if demoting the old version fails", async () => {
    const opts = { failDemote: false, failPromote: false };
    const { store, rows } = memoryStore(opts);
    await run(store, upd());
    const before = rows.map((r) => ({ ...r }));
    opts.failDemote = true;
    const r = await run(store, upd({ is_revision: true, document_url: "https://ssc.gov.in/b.pdf", publication_date: "2027-03-20" }));
    expect(r.ok).toBe(false);
    expect(rows).toEqual(before);
    expect(rows[0]?.isLatest).toBe(true);
  });

  it("rolls back and restores the old latest if promoting fails", async () => {
    const opts = { failDemote: false, failPromote: false };
    const { store, rows } = memoryStore(opts);
    await run(store, upd());
    opts.failPromote = true;
    const r = await run(store, upd({ is_revision: true, document_url: "https://ssc.gov.in/b.pdf", publication_date: "2027-03-20" }));
    expect(r.ok).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isLatest).toBe(true);
  });

  it("refuses an update with no exam cycle", async () => {
    const { store } = memoryStore();
    expect((await run(store, upd({ exam_cycle_id: null }))).ok).toBe(false);
  });
});
