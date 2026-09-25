import { describe, it, expect } from "vitest";
import { hashDocument, hashQuestionContent } from "../hash";

describe("hashDocument", () => {
  it("is stable for identical content", () => {
    expect(hashDocument("Hello world")).toBe(hashDocument("Hello world"));
  });

  it("ignores incidental whitespace differences", () => {
    expect(hashDocument("Hello   world\n\n")).toBe(hashDocument("Hello world"));
  });

  it("differs for genuinely different content", () => {
    expect(hashDocument("Hello world")).not.toBe(hashDocument("Goodbye world"));
  });
});

describe("hashQuestionContent", () => {
  it("is stable regardless of option order", () => {
    const a = hashQuestionContent("What is 2+2?", ["3", "4", "5"]);
    const b = hashQuestionContent("What is 2+2?", ["5", "4", "3"]);
    expect(a).toBe(b);
  });

  it("differs for a different prompt with the same options", () => {
    const a = hashQuestionContent("What is 2+2?", ["3", "4", "5"]);
    const b = hashQuestionContent("What is 3+3?", ["3", "4", "5"]);
    expect(a).not.toBe(b);
  });
});
