import { describe, it, expect } from "vitest";
import { classifyUpdate } from "../classify";
import { ParsedUpdate } from "../types";

function makeUpdate(overrides: Partial<ParsedUpdate> = {}): ParsedUpdate {
  return {
    updateType: "admit_card",
    title: "SSC CGL 2026 Admit Card Released for Tier I Exam",
    documentUrl: "https://ssc.nic.in/admit-card.pdf",
    publicationDate: "2026-10-20",
    extractedFields: [{ label: "Date", value: "2026-10-20", confidence: "high" }],
    ...overrides,
  };
}

describe("classifyUpdate", () => {
  it("auto-publishes a high-confidence, dated update with a document reference", () => {
    expect(classifyUpdate(makeUpdate())).toBe("auto_publish");
  });

  it("never auto-publishes a brand new notification, however clean it parsed", () => {
    const update = makeUpdate({ updateType: "new_notification" });
    expect(classifyUpdate(update)).toBe("needs_review");
  });

  it("sends a date-sensitive update to needs_review when no publication date was determined", () => {
    const update = makeUpdate({ publicationDate: null });
    expect(classifyUpdate(update)).toBe("needs_review");
  });

  it("sends an update to needs_review when any extracted field is low or medium confidence", () => {
    const update = makeUpdate({
      extractedFields: [{ label: "Date", value: "2026-10-20", confidence: "medium" }],
    });
    expect(classifyUpdate(update)).toBe("needs_review");
  });

  it("does not require a publication date for update types that aren't date-sensitive", () => {
    const update = makeUpdate({
      updateType: "corrigendum",
      publicationDate: null,
      extractedFields: [],
    });
    expect(classifyUpdate(update)).toBe("auto_publish");
  });

  it("rejects an update with neither a usable title nor a document reference", () => {
    const update = makeUpdate({ title: "Click", documentUrl: null, publicationDate: null });
    expect(classifyUpdate(update)).toBe("reject");
  });

  it("does not reject a short title as long as a document reference exists", () => {
    const update = makeUpdate({ title: "Notice", documentUrl: "https://example.gov.in/n.pdf" });
    // Title is short but there's a real reference — not garbage, just
    // under-confident on the date-sensitive admit_card type without a date.
    expect(classifyUpdate({ ...update, publicationDate: null })).toBe("needs_review");
  });
});
