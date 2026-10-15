import { describe, it, expect } from "vitest";
import { detectStageType } from "../detect-type";
import { extractDateRange, extractExplicitDates } from "../dates";

describe("detectStageType", () => {
  const cases: [string, string][] = [
    ["Admit Card for Tier I Examination 2027", "admit_card"],
    ["Exam City Intimation Slip for CBT 2027", "exam_city_intimation"],
    ["Advance intimation regarding exam city", "exam_city_intimation"],
    ["Provisional Answer Key for Tier I", "answer_key"],
    ["Candidate Response Sheet - Tier I", "response_sheet"],
    ["Objection window opened for Tier I", "objection_window"],
    ["Final Result of Tier I Examination", "result"],
    ["Scorecard of candidates, Tier I", "scorecard"],
    ["Cut-off marks for Tier I", "cutoff"],
    ["Exam Date announced for Tier I", "exam_date"],
    ["Corrigendum to Admit Card notice", "corrigendum"],
  ];
  for (const [title, expected] of cases) {
    it(`"${title}" -> ${expected}`, () => {
      const d = detectStageType(title);
      expect(d.type).toBe(expected);
      expect(d.ambiguous).toBe(false);
    });
  }

  it("flags a title that names two stages as ambiguous", () => {
    const d = detectStageType("Answer Key and Result of Tier I");
    expect(d.ambiguous).toBe(true);
  });

  it("treats an answer key that also invites objections as ambiguous (needs a human)", () => {
    expect(detectStageType("Link to raise objections to the answer key").ambiguous).toBe(true);
  });

  it("returns new_notification (unmatched) for an unrelated title", () => {
    const d = detectStageType("Recruitment Notification for Junior Assistant");
    expect(d.matched).toBe(false);
    expect(d.type).toBe("new_notification");
  });
});

describe("explicit dates", () => {
  it("reads dd.mm.yyyy and long forms", () => {
    expect(extractExplicitDates("held on 12.03.2027")).toEqual(["2027-03-12"]);
    expect(extractExplicitDates("on 5th April 2027")).toEqual(["2027-04-05"]);
    expect(extractExplicitDates("April 5, 2027")).toEqual(["2027-04-05"]);
  });
  it("ignores impossible dates, partial dates and two-digit years", () => {
    expect(extractExplicitDates("on 31.02.2027")).toEqual([]);
    expect(extractExplicitDates("in March 2027")).toEqual([]);
    expect(extractExplicitDates("on 12.03.27")).toEqual([]);
  });
  it("reads one date as a single day and two joined dates as a range", () => {
    expect(extractDateRange("Exam on 12.03.2027")).toEqual({ start: "2027-03-12", end: null, ambiguous: false });
    expect(extractDateRange("Exam from 12.03.2027 to 15.03.2027")).toEqual({ start: "2027-03-12", end: "2027-03-15", ambiguous: false });
  });
  it("refuses to pick when dates are not a clear single date or range", () => {
    expect(extractDateRange("12.03.2027, 15.03.2027, 18.03.2027").ambiguous).toBe(true);
    expect(extractDateRange("No dates here")).toEqual({ start: null, end: null, ambiguous: false });
  });
});
