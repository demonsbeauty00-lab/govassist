import { describe, it, expect } from "vitest";
import { findUnsupportedScoring, MULTI_SELECT_UNSUPPORTED_MESSAGE } from "../supported";

const q = (question_type: string, question_status_flag = "normal") => ({ question_type, question_status_flag });

describe("findUnsupportedScoring", () => {
  it("passes single-answer and numerical papers", () => {
    expect(findUnsupportedScoring([q("mcq_single"), q("numerical")])).toBeNull();
  });
  it("holds back a paper with a live multiple-correct question", () => {
    expect(findUnsupportedScoring([q("mcq_single"), q("mcq_multiple")])).toBe(MULTI_SELECT_UNSUPPORTED_MESSAGE);
    expect(findUnsupportedScoring([q("mcq_multiple", "disputed")])).toBe(MULTI_SELECT_UNSUPPORTED_MESSAGE);
  });
  it("ignores multiple-correct questions that were dropped or given as bonus", () => {
    expect(findUnsupportedScoring([q("mcq_multiple", "dropped"), q("mcq_multiple", "bonus_awarded")])).toBeNull();
  });
});
