import { describe, it, expect } from "vitest";
import { exampleNoticeListParser } from "../parsers/example-notice-list.parser";

const context = { sourceUrl: "https://example.gov.in/notices", organization: "Example Recruitment Board" };

/** Asserts there's at least one update and returns it, so every line below
 *  works with a narrowed, definitely-defined value instead of an unsafe
 *  assertion — a genuinely empty result still fails the test, just with
 *  this message instead of a raw TypeError. */
function firstOf<T>(updates: T[]): T {
  expect(updates.length).toBeGreaterThan(0);
  const [first] = updates;
  if (!first) throw new Error("Expected at least one parsed update, got none.");
  return first;
}

describe("exampleNoticeListParser", () => {
  it("extracts a plain new notification from a notice list", () => {
    const html = `<ul><li><a href="/notice/123.pdf">Recruitment Notification 2027 for Assistant Posts</a></li></ul>`;
    const updates = exampleNoticeListParser.parse(html, context);

    expect(updates).toHaveLength(1);
    const first = firstOf(updates);
    expect(first.updateType).toBe("new_notification");
    expect(first.title).toContain("Recruitment Notification 2027");
    expect(first.documentUrl).toBe("https://example.gov.in/notice/123.pdf");
  });

  it("classifies an admit card notice by keyword", () => {
    const html = `<a href="/admit-card-2027.pdf">Admit Card for Tier I Examination 2027</a>`;
    const updates = exampleNoticeListParser.parse(html, context);
    expect(firstOf(updates).updateType).toBe("admit_card");
  });

  it("classifies an answer key notice by keyword", () => {
    const html = `<a href="/answer-key-2027.pdf">Provisional Answer Key for Tier I Examination</a>`;
    const updates = exampleNoticeListParser.parse(html, context);
    expect(firstOf(updates).updateType).toBe("answer_key");
  });

  it("classifies a result notice by keyword", () => {
    const html = `<a href="/result-2027.pdf">Final Result of Tier I Examination 2027</a>`;
    const updates = exampleNoticeListParser.parse(html, context);
    expect(firstOf(updates).updateType).toBe("result");
  });

  it("classifies a corrigendum by keyword", () => {
    const html = `<a href="/corrigendum-1.pdf">Corrigendum Regarding Age Limit Clarification</a>`;
    const updates = exampleNoticeListParser.parse(html, context);
    expect(firstOf(updates).updateType).toBe("corrigendum");
  });

  it("extracts multiple distinct updates from a single page", () => {
    const html = `
      <a href="/notice/1.pdf">Recruitment Notification for Junior Assistant 2027</a>
      <a href="/notice/2.pdf">Corrigendum Regarding Application Deadline</a>
      <a href="/notice/3.pdf">Admit Card for Written Examination 2027</a>
    `;
    const updates = exampleNoticeListParser.parse(html, context);
    expect(updates).toHaveLength(3);
    expect(updates.map((u) => u.updateType)).toEqual(["new_notification", "corrigendum", "admit_card"]);
  });

  it("never assigns a publication date — a template has no real markup to read one from", () => {
    const html = `<a href="/notice/1.pdf">Recruitment Notification for Junior Assistant 2027</a>`;
    const updates = exampleNoticeListParser.parse(html, context);
    expect(firstOf(updates).publicationDate).toBeNull();
  });

  it("does not throw on malformed/empty HTML, and returns no updates", () => {
    expect(() => exampleNoticeListParser.parse("<html><body>not a notice list at all", context)).not.toThrow();
    expect(exampleNoticeListParser.parse("", context)).toEqual([]);
    expect(exampleNoticeListParser.parse("<div>random unrelated content</div>", context)).toEqual([]);
  });

  it("ignores links with too-short link text (likely navigation, not a notice)", () => {
    const html = `<a href="/home">Home</a> <a href="/notice/1.pdf">Recruitment Notification for Junior Assistant 2027</a>`;
    const updates = exampleNoticeListParser.parse(html, context);
    expect(updates).toHaveLength(1);
  });
});
