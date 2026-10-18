// ---------------------------------------------------------------------------
// ⚠️ NO REAL OCR IS CONNECTED — this returns EMPTY fields, never invented values.
//
// Phase 16: this function used to return sample values (a made-up person's name,
// date of birth and ID number) with rotating confidence. Because users confirm
// extracted fields and those flow into the profile and the eligibility engine,
// a made-up date of birth could change someone's real eligibility result. It now
// returns the field labels with blank values and "low" confidence, so the user
// types in what their document actually says (manual entry with a review step).
//
// This environment has no OCR/vision provider key and no network access to
// verify one against, so wiring a real provider here isn't something I could
// build *and test*. What's real and load-bearing is everything around this
// function: the field shape (label/value/confidence/confirmed), the
// mandatory review step before anything touches a user's profile, and the
// document status lifecycle (processing → needs_review → verified). Swap
// only the body of extractDocumentFields() for a real provider call and
// nothing else in the app needs to change.
//
// To wire a real provider (e.g. Claude's vision API, Google Cloud Vision,
// AWS Textract):
//   1. Add the provider's key as OCR_PROVIDER_API_KEY (already scaffolded in
//      .env.example) or ANTHROPIC_API_KEY.
//   2. Fetch the file's bytes from Storage using the document's storage_path
//      (see lib/actions/documents.ts — the signed URL / admin download).
//   3. Send the image/PDF to the provider, prompted per DOCUMENT_TYPES'
//      field template (lib/document-types.ts), asking it to return
//      {label, value, confidence} for each field it can read, and to say so
//      honestly when it can't read a field rather than guessing.
//   4. Map the provider's confidence signal (or absence of one — some
//      providers don't give you one, in which case default to "low" rather
//      than inventing certainty) onto "high" | "medium" | "low".
//   5. Never skip the needs_review status or the confirm step that follows
//      it, regardless of how confident the provider claims to be — that
//      review gate is a product requirement, not a placeholder.
// ---------------------------------------------------------------------------

import { DocumentType, FIELD_TEMPLATES } from "@/lib/document-types";

export interface ExtractedField {
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
  /** Which uploaded document this field was read from — the brief asks
   *  for "source document" as one of every field's required attributes.
   *  Redundant with page context today (a field is only ever shown on its
   *  own document's detail page), but it's what makes that requirement
   *  literally true in the data itself, not just implied by where the
   *  field happens to be rendered — load-bearing the moment fields from
   *  multiple documents are ever shown together (e.g. a future combined
   *  profile-review view). */
  sourceDocumentType: DocumentType;
  /** Set true once the user has reviewed/confirmed or edited this specific
   *  field — never true immediately after extraction, regardless of the
   *  OCR confidence, per "never silently assume OCR information is correct." */
  confirmed: boolean;
}

/**
 * Returns one blank, unconfirmed, low-confidence field per label in the document
 * type's template. Nothing is read from the file. Swap this body for a real
 * provider call (see the steps above) and nothing else needs to change.
 */
export async function extractDocumentFields(documentType: DocumentType): Promise<ExtractedField[]> {
  const labels = FIELD_TEMPLATES[documentType];
  if (labels.length === 0) return []; // Photo / Signature / Other — nothing to read

  return labels.map((label) => ({
    label,
    value: "",
    confidence: "low" as const,
    sourceDocumentType: documentType,
    confirmed: false,
  }));
}
