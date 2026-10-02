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
});
