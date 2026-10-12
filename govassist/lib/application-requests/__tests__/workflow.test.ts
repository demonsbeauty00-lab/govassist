import { describe, it, expect } from "vitest";
import { applicantDeletableDocuments, interpretConditionalUpdate, type DocumentLike } from "../workflow";

const doc = (id: string, uploaded_by: "user" | "admin", kind: "supporting" | "confirmation"): DocumentLike =>
  ({ id, storage_path: `p/${id}`, uploaded_by, kind });

describe("applicantDeletableDocuments", () => {
  it("keeps only applicant-uploaded supporting files", () => {
    const out = applicantDeletableDocuments([
      doc("a", "user", "supporting"), doc("b", "admin", "confirmation"), doc("c", "user", "supporting"),
    ]);
    expect(out.map((d) => d.id)).toEqual(["a", "c"]);
  });
  it("never returns admin confirmation documents, even if mislabelled as supporting by the admin", () => {
    expect(applicantDeletableDocuments([doc("x", "admin", "supporting"), doc("y", "admin", "confirmation")])).toHaveLength(0);
  });
  it("handles an empty list", () => {
    expect(applicantDeletableDocuments([])).toEqual([]);
  });
});

describe("interpretConditionalUpdate", () => {
  it("is ok only when at least one row was updated and there is no error", () => {
    expect(interpretConditionalUpdate([{ id: "1" }], null)).toBe("ok");
  });
  it("treats zero affected rows as a conflict, not success", () => {
    expect(interpretConditionalUpdate([], null)).toBe("conflict");
    expect(interpretConditionalUpdate(null, null)).toBe("conflict");
    expect(interpretConditionalUpdate(undefined, null)).toBe("conflict");
  });
  it("treats a database error as an error even if rows are present", () => {
    expect(interpretConditionalUpdate([{ id: "1" }], new Error("boom"))).toBe("error");
    expect(interpretConditionalUpdate(null, { code: "X" })).toBe("error");
  });
});
