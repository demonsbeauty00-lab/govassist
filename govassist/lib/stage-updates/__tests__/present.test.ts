import { describe, it, expect } from "vitest";
import { buildOfficialUpdateGroups } from "../present";

const row = (o: Record<string, unknown>) => ({
  id: "x", exam_cycle_id: "c1", detected_update_id: null, update_type: "answer_key", title: "Answer Key", organization: "SSC",
  publication_date: "2027-03-10", event_date: null, source_url: "https://ssc.gov.in/a.pdf", official_page_url: "https://ssc.gov.in",
  series_key: "k", document_key: "d", version: 1, is_latest: true, superseded_by: null, verification: "auto_verified",
  published_at: "2027-03-10T00:00:00Z", ...o,
}) as any;

const cycles = new Map([["c1", { examName: "SSC CGL", cycleLabel: "2027" }]]);

describe("buildOfficialUpdateGroups", () => {
  it("separates the latest verified version from history, newest first", () => {
    const g = buildOfficialUpdateGroups([
      row({ id: "old", is_latest: false, version: 1, publication_date: "2027-03-01" }),
      row({ id: "new", version: 2, publication_date: "2027-03-20" }),
      row({ id: "res", update_type: "result", publication_date: "2027-04-01" }),
    ], cycles);
    expect(g).toHaveLength(1);
    expect(g[0]?.latest.map((u) => u.id)).toEqual(["res", "new"]);
    expect(g[0]?.history.map((u) => u.id)).toEqual(["old"]);
  });
  it("every item carries organization and source link; missing date stays null", () => {
    const g = buildOfficialUpdateGroups([row({ publication_date: null })], cycles);
    const u = g[0]?.latest[0];
    expect(u?.organization).toBe("SSC");
    expect(u?.sourceUrl).toBe("https://ssc.gov.in/a.pdf");
    expect(u?.publicationDate).toBeNull();
    expect(u?.typeLabel).toBe("Answer key");
  });
  it("drops cycles that are not visible", () => {
    expect(buildOfficialUpdateGroups([row({ exam_cycle_id: "hidden" })], cycles)).toEqual([]);
  });
});
