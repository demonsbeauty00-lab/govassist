// ---------------------------------------------------------------------------
// Single source of truth for the 8 document types — must stay in sync with
// the `document_type` check constraint in supabase/migrations/0001_init.sql.
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
  "10th Marksheet",
  "12th Marksheet",
  "Graduation Certificate",
  "Category Certificate",
  "Domicile Certificate",
  "Photo",
  "Signature",
  "Other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** URL-safe slug for each type (e.g. "10th Marksheet" → "10th-marksheet"),
 *  used as the /documents/[type] route param so a not-yet-uploaded document
 *  (which has no id yet) still has a stable, linkable URL. */
export const DOCUMENT_TYPE_SLUGS: Record<DocumentType, string> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [t, slugify(t)])
) as Record<DocumentType, string>;

const SLUG_TO_TYPE: Record<string, DocumentType> = Object.fromEntries(
  DOCUMENT_TYPES.map((t) => [slugify(t), t])
) as Record<string, DocumentType>;

export function documentTypeFromSlug(slug: string): DocumentType | null {
  return SLUG_TO_TYPE[slug] ?? null;
}

/** The fields OCR attempts to extract for each document type, per the product spec.
 *  Photo/Signature/Other carry no structured fields — they're images/misc files,
 *  not certificates with data to read. */
export const FIELD_TEMPLATES: Record<DocumentType, string[]> = {
  "10th Marksheet": ["Name", "Date of birth", "Roll number", "School", "Passing year", "Marks"],
  "12th Marksheet": ["Name", "Passing year", "Stream", "Marks"],
  "Graduation Certificate": ["Name", "Degree", "Subject", "University", "Passing year"],
  "Category Certificate": ["Name", "Category", "Certificate number", "Issue date"],
  "Domicile Certificate": ["Name", "State", "Issue date"],
  Photo: [],
  Signature: [],
  Other: [],
};

/** The real profiles columns a document field can be applied to — kept as
 *  its own named type (rather than an inline union) so it can be reused
 *  everywhere a "profile field this pipeline is allowed to touch" needs to
 *  be expressed, including profileUpdate's type in
 *  applyExtractedFieldsToProfileAction (lib/actions/documents.ts). */
export type ProfileEditableField = "full_name" | "dob";

/** Maps a subset of extracted field labels to profile columns — used only
 *  when the user explicitly applies confirmed fields to their profile (see
 *  applyExtractedFieldsToProfileAction). Fields not listed here are still
 *  shown and editable, just not auto-mapped anywhere.
 *
 *  Typed as a plain (non-Partial) Record over the exact known label
 *  literals below, not `Partial<Record<string, ...>>` — this file defines
 *  a fixed, closed set of labels, so every value here is genuinely always
 *  present, never `| undefined`. That's what lets Object.entries() below
 *  infer profileField as exactly ProfileEditableField, a real, always-valid
 *  key — see the comment above PROFILE_FIELD_ENTRIES for why iteration
 *  uses that instead of Object.entries() directly. */
export const PROFILE_FIELD_MAP: Record<"Name" | "Date of birth", ProfileEditableField> = {
  Name: "full_name",
  "Date of birth": "dob",
};

/**
 * The same mapping as PROFILE_FIELD_MAP, as an explicitly-tupled array.
 * `Object.entries()`'s standard library typing widens an object's key type
 * to plain `string` and, for some object shapes, can fail to carry the
 * value type through cleanly — this sidesteps that entirely: no built-in
 * utility-type inference to rely on, just a literal array of
 * [label, field] tuples whose element type is stated up front. Iterate
 * this, not `Object.entries(PROFILE_FIELD_MAP)`, wherever code needs to
 * walk the mapping (see applyExtractedFieldsToProfileAction).
 */
export const PROFILE_FIELD_ENTRIES: readonly [label: string, field: ProfileEditableField][] = [
  ["Name", "full_name"],
  ["Date of birth", "dob"],
];

export const EDUCATION_FIELD_MAP: Record<DocumentType, { qualification_level: string } | null> = {
  "10th Marksheet": { qualification_level: "10th pass" },
  "12th Marksheet": { qualification_level: "12th pass" },
  "Graduation Certificate": { qualification_level: "Graduate" },
  "Category Certificate": null,
  "Domicile Certificate": null,
  Photo: null,
  Signature: null,
  Other: null,
};
