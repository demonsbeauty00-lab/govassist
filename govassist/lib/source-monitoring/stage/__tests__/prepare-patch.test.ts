import { describe, it, expect } from "vitest";
import { prepareDetectedUpdate } from "../prepare";
import { buildExamCycleUpdate } from "../cycle-patch";
import { buildNotificationBody, noticeTitle } from "../labels";
import { isOfficialLink } from "../validate";
import type { ParsedUpdate } from "../../types";

const exams = [{ id: "e1", name: "Staff Selection CGL", shortName: "SSC CGL" }];
const cycles = [{ id: "c1", examId: "e1", cycleLabel: "2027" }];
const source = { examId: "e1", officialUrl: "https://ssc.gov.in/notices" };
const parsed = (o: Partial<ParsedUpdate>): ParsedUpdate => ({
  updateType: "new_notification", title: "Admit Card for Tier I 2027", documentUrl: "https://ssc.gov.in/a.pdf", publicationDate: "2027-03-10",
  extractedFields: [{ label: "Organization", value: "SSC", confidence: "high" }], ...o,
});
const prep = (p: ParsedUpdate, existing: any[] = []) =>
  prepareDetectedUpdate({ parsed: p, source, exams, cycles, loadExisting: async () => existing });

describe("prepareDetectedUpdate", () => {
  it("links the cycle, refines the type and auto-publishes a clean dated admit card", async () => {
    const r = await prep(parsed({}));
    expect(r.update.updateType).toBe("admit_card");
    expect(r.examCycleId).toBe("c1");
    expect(r.classification).toBe("auto_publish");
    expect(r.reasons).toEqual([]);
  });
  it("sends an undated admit card to review", async () => {
    expect((await prep(parsed({ publicationDate: null }))).classification).toBe("needs_review");
  });
  it("sends an update with no identifiable cycle to review with a reason", async () => {
    const r = await prep(parsed({ title: "Admit Card for Tier I 2030" }));
    expect(r.examCycleId).toBeNull();
    expect(r.classification).toBe("needs_review");
    expect(r.reasons.join(" ")).toMatch(/cycle/);
  });
  it("sends an ambiguous title to review", async () => {
    const r = await prep(parsed({ title: "Answer Key and Result 2027" }));
    expect(r.classification).toBe("needs_review");
  });
  it("reads an explicit exam date; without one it needs review", async () => {
    const ok = await prep(parsed({ title: "Exam Date for Tier I 2027 on 12.06.2027" }));
    expect(ok.update.eventDate).toBe("2027-06-12");
    expect(ok.classification).toBe("auto_publish");
    const none = await prep(parsed({ title: "Exam Date announced for Tier I 2027" }));
    expect(none.update.eventDate ?? null).toBeNull();
    expect(none.classification).toBe("needs_review");
  });
  it("never auto-publishes a cut-off without a high-confidence value", async () => {
    expect((await prep(parsed({ title: "Cut-off marks Tier I 2027" }))).classification).toBe("needs_review");
  });
  it("flags a document already published for the cycle as a duplicate", async () => {
    const existing = [{ id: "s1", seriesKey: "admit card tier i", documentKey: "https://ssc.gov.in/a.pdf", publicationDate: "2027-03-10", isLatest: true, version: 1 }];
    expect((await prep(parsed({}), existing)).duplicate).toBe(true);
  });
  it("puts an unlabelled second document of the same series in review, a labelled revision auto-publishes", async () => {
    const existing = [{ id: "s1", seriesKey: "admit card tier i", documentKey: "https://ssc.gov.in/old.pdf", publicationDate: "2027-03-01", isLatest: true, version: 1 }];
    expect((await prep(parsed({}), existing)).classification).toBe("needs_review");
    const rev = await prep(parsed({ title: "Revised Admit Card for Tier I 2027", documentUrl: "https://ssc.gov.in/new.pdf" }), existing);
    expect(rev.versionPlan?.action).toBe("supersede");
    expect(rev.classification).toBe("auto_publish");
  });
  it("reviews a document linked from an unrelated domain", async () => {
    const r = await prep(parsed({ documentUrl: "https://random-site.com/a.pdf" }));
    expect(r.classification).toBe("needs_review");
  });
  it("treats an empty link as no link (rejects only when the title is useless too)", async () => {
    const r = await prep(parsed({ documentUrl: "", title: "abc" }));
    expect(r.classification).toBe("reject");
  });
});

describe("isOfficialLink", () => {
  it("accepts same host, subdomain and gov.in; rejects other domains", () => {
    expect(isOfficialLink("https://ssc.gov.in/x", "https://ssc.gov.in/n")).toBe(true);
    expect(isOfficialLink("https://cdn.ssc.gov.in/x", "https://ssc.gov.in/n")).toBe(true);
    expect(isOfficialLink("https://other.gov.in/x", "https://ssc.gov.in/n")).toBe(true);
    expect(isOfficialLink("https://evil.com/x", "https://ssc.gov.in/n")).toBe(false);
  });
});

const du = (o: any) => ({
  id: "u1", source_id: "s", exam_cycle_id: "c1", update_type: "admit_card", title: "t", official_url: "https://x", document_url: "https://x/a.pdf",
  publication_date: "2027-03-10", event_date: null, cycle_match: null, series_key: null, is_revision: false, content_hash: "h",
  extracted_fields: [], classification: "auto_publish", status: "pending", detected_at: "", processed_at: null, reviewed_by: null, reviewed_at: null, review_notes: null, ...o,
});

describe("buildExamCycleUpdate", () => {
  it("never writes null over existing values", () => {
    const p = buildExamCycleUpdate(du({ publication_date: null, document_url: null }), null);
    expect(p.admit_card_date).toBeUndefined();
    expect(p.admit_card_url).toBeUndefined();
  });
  it("does not move the stage backwards", () => {
    expect(buildExamCycleUpdate(du({}), "result_declared").current_status).toBeUndefined();
    expect(buildExamCycleUpdate(du({}), "upcoming").current_status).toBe("admit_card_available");
  });
  it("sets exam dates only from an explicit event date", () => {
    expect(buildExamCycleUpdate(du({ update_type: "exam_date" }), null)).toEqual({});
    const p = buildExamCycleUpdate(du({ update_type: "exam_date", event_date: "2027-06-12", extracted_fields: [{ label: "Event end date", value: "2027-06-15", confidence: "high" }] }), null);
    expect(p).toMatchObject({ exam_date: "2027-06-12", exam_date_end: "2027-06-15", current_status: "exam_date_announced" });
  });
  it("stores links for city intimation, response sheet and scorecard", () => {
    expect(buildExamCycleUpdate(du({ update_type: "exam_city_intimation" }), null).exam_city_intimation_url).toBe("https://x/a.pdf");
    expect(buildExamCycleUpdate(du({ update_type: "response_sheet" }), null).response_sheet_url).toBe("https://x/a.pdf");
    expect(buildExamCycleUpdate(du({ update_type: "scorecard" }), null).scorecard_url).toBe("https://x/a.pdf");
  });
  it("never invents a cut-off from the title", () => {
    expect(buildExamCycleUpdate(du({ update_type: "cutoff", title: "Cut-off marks" }), null)).toEqual({});
    const p = buildExamCycleUpdate(du({ update_type: "cutoff", extracted_fields: [{ label: "Cutoff", value: "General 140.5", confidence: "high" }] }), null);
    expect(p.cutoff_summary).toBe("General 140.5");
  });
  it("leaves the cycle alone for a corrigendum", () => {
    expect(buildExamCycleUpdate(du({ update_type: "corrigendum" }), null)).toEqual({});
  });
});

describe("notification text", () => {
  it("always carries organization and link, and a date only when known", () => {
    const withDate = buildNotificationBody({ organization: "SSC", publicationDate: "2027-03-10", sourceUrl: "https://ssc.gov.in/a.pdf", title: "T" });
    expect(withDate).toContain("SSC");
    expect(withDate).toContain("Published 2027-03-10");
    expect(withDate).toContain("https://ssc.gov.in/a.pdf");
    const noDate = buildNotificationBody({ organization: "SSC", publicationDate: null, sourceUrl: "https://ssc.gov.in/a.pdf", title: "T" });
    expect(noDate).not.toContain("Published");
  });
  it("labels a revised document as revised", () => {
    expect(noticeTitle("answer_key", "SSC CGL", true)).toContain("revised");
    expect(noticeTitle("scorecard", "SSC CGL", false)).toContain("scorecard");
  });
});
