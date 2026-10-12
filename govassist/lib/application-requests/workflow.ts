// Small pure helpers that hold the decisions the server actions make, so
// the rules are unit-testable without a database.

export interface DocumentLike {
  id: string;
  storage_path: string;
  uploaded_by: "user" | "admin";
  kind: "supporting" | "confirmation";
}

/** The ONLY documents an applicant may delete themselves: files they
 *  uploaded. Admin-uploaded confirmation documents are part of the official
 *  record of the request and are never removable by the applicant. */
export function applicantDeletableDocuments<T extends DocumentLike>(docs: readonly T[]): T[] {
  return docs.filter((d) => d.uploaded_by === "user" && d.kind === "supporting");
}

export type ConditionalUpdateOutcome = "ok" | "conflict" | "error";

/** Interprets the result of `update(...).eq(status, expected).select("id")`.
 *  Zero affected rows means the guarded status no longer matched (someone
 *  else changed the request) — that is NOT success. */
export function interpretConditionalUpdate(
  rows: readonly unknown[] | null | undefined,
  error: unknown,
): ConditionalUpdateOutcome {
  if (error) return "error";
  if (!rows || rows.length === 0) return "conflict";
  return "ok";
}
