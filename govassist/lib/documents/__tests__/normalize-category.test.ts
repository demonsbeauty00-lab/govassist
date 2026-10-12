import { describe, it, expect } from "vitest";
import { normalizeCategoryValue } from "../normalize-category";

describe("normalizeCategoryValue", () => {
  it("recognizes exact enum spellings", () => {
    expect(normalizeCategoryValue("General")).toBe("General");
    expect(normalizeCategoryValue("OBC")).toBe("OBC");
    expect(normalizeCategoryValue("SC")).toBe("SC");
    expect(normalizeCategoryValue("ST")).toBe("ST");
    expect(normalizeCategoryValue("EWS")).toBe("EWS");
  });

  it("recognizes common real-world certificate wording", () => {
    expect(normalizeCategoryValue("O.B.C.")).toBe("OBC");
    expect(normalizeCategoryValue("Other Backward Class")).toBe("OBC");
    expect(normalizeCategoryValue("Scheduled Caste")).toBe("SC");
    expect(normalizeCategoryValue("Scheduled Tribe")).toBe("ST");
    expect(normalizeCategoryValue("Economically Weaker Section")).toBe("EWS");
    expect(normalizeCategoryValue("Unreserved")).toBe("General");
    expect(normalizeCategoryValue("UR")).toBe("General");
  });

  it("is case-insensitive", () => {
    expect(normalizeCategoryValue("obc")).toBe("OBC");
    expect(normalizeCategoryValue("general")).toBe("General");
  });

  it("never guesses on unrecognized or empty input", () => {
    expect(normalizeCategoryValue("")).toBeNull();
    expect(normalizeCategoryValue("   ")).toBeNull();
    expect(normalizeCategoryValue("XYZ123")).toBeNull();
    expect(normalizeCategoryValue("Minority")).toBeNull();
  });

  it("does not mismatch EWS as General despite containing no overlapping word, and OBC is not caught by a shorter unrelated pattern", () => {
    expect(normalizeCategoryValue("EWS Certificate")).toBe("EWS");
    expect(normalizeCategoryValue("OBC (Non-Creamy Layer)")).toBe("OBC");
  });

  it("recognizes dotted abbreviations only when the whole value is the abbreviation", () => {
    expect(normalizeCategoryValue("O.B.C.")).toBe("OBC");
    expect(normalizeCategoryValue("S.C.")).toBe("SC");
    expect(normalizeCategoryValue("S.T.")).toBe("ST");
    expect(normalizeCategoryValue("S.C")).toBe("SC");
    expect(normalizeCategoryValue("O. B. C.")).toBe("OBC");
    expect(normalizeCategoryValue("E.W.S.")).toBe("EWS");
    expect(normalizeCategoryValue("U.R.")).toBe("General");
  });

  it("does not turn dotted initials in names or other text into a category", () => {
    expect(normalizeCategoryValue("S.C. Verma")).toBeNull();
    expect(normalizeCategoryValue("S.T. Mohan")).toBeNull();
    expect(normalizeCategoryValue("Mr. S.C.")).toBeNull();
    expect(normalizeCategoryValue("A.B. Singh")).toBeNull();
    expect(normalizeCategoryValue("S.C.V.")).toBeNull();
  });

  it("recognizes OBC with the standard Non-Creamy Layer qualifier", () => {
    expect(normalizeCategoryValue("O.B.C. (Non-Creamy Layer)")).toBe("OBC");
    expect(normalizeCategoryValue("O.B.C. (NCL)")).toBe("OBC");
    expect(normalizeCategoryValue("o.b.c.(non creamy layer)")).toBe("OBC");
    expect(normalizeCategoryValue("Other Backward Class (Non-Creamy Layer)")).toBe("OBC");
  });

  it("does not let the qualifier rule match names, other categories, or other parentheses", () => {
    expect(normalizeCategoryValue("S.C. (Non-Creamy Layer)")).toBeNull();
    expect(normalizeCategoryValue("O.B.C. (Verma)")).toBeNull();
    expect(normalizeCategoryValue("O.B.C. Verma (Non-Creamy Layer)")).toBeNull();
    expect(normalizeCategoryValue("Mr. O.B.C. (Non-Creamy Layer)")).toBeNull();
    expect(normalizeCategoryValue("S.C. Verma")).toBeNull();
    expect(normalizeCategoryValue("S.T. Mohan")).toBeNull();
    expect(normalizeCategoryValue("Mr. S.C.")).toBeNull();
    expect(normalizeCategoryValue("A.B. Singh")).toBeNull();
    expect(normalizeCategoryValue("Minority")).toBeNull();
    expect(normalizeCategoryValue("XYZ123")).toBeNull();
  });
});
