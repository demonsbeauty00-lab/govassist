// ---------------------------------------------------------------------------
// ⚠️ SIMULATED EXTRACTION — not a real OCR/vision call.
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
  /** Set true once the user has reviewed/confirmed or edited this specific
   *  field — never true immediately after extraction, regardless of the
   *  OCR confidence, per "never silently assume OCR information is correct." */
  confirmed: boolean;
}

/**
 * Returns plausible-looking sample values for each of a document type's
 * fields, with deliberately mixed confidence (never all "high") so the
 * review UI is meaningfully exercised rather than rubber-stamped. Every
 * field starts unconfirmed.
 */
export async function extractDocumentFields(documentType: DocumentType): Promise<ExtractedField[]> {
  const labels = FIELD_TEMPLATES[documentType];
  if (labels.length === 0) return []; // Photo / Signature / Other — nothing to read

  // Simulates the latency of a real OCR call so the "processing" status in
  // the UI is meaningful rather than instant.
  await new Promise((resolve) => setTimeout(resolve, 400));

  const sampleValues = SAMPLE_VALUES[documentType];

  return labels.map((label, i) => ({
    label,
    value: sampleValues[label] ?? "",
    // Rotates through confidence levels rather than marking everything
    // "high" — a real OCR pass never is, and the UI must be able to show
    // (and the user must review) fields at every confidence level.
    confidence: (["medium", "high", "low"] as const)[i % 3] ?? "medium",
    confirmed: false,
  }));
}

const SAMPLE_VALUES: Record<DocumentType, Record<string, string>> = {
  "10th Marksheet": {
    Name: "AADITYA KUMAR SHARMA",
    "Date of birth": "14-03-2001",
    "Roll number": "2016UP0417293",
    School: "Rashtriya Inter College",
    "Passing year": "2016",
    Marks: "82.4%",
  },
  "12th Marksheet": {
    Name: "AADITYA KUMAR SHARMA",
    "Passing year": "2018",
    Stream: "Science",
    Marks: "76.8%",
  },
  "Graduation Certificate": {
    Name: "Aaditya Kumar Sharma",
    Degree: "Bachelor of Arts",
    Subject: "Political Science",
    University: "Lucknow University",
    "Passing year": "2023",
  },
  "Category Certificate": {
    Name: "Aaditya Kumar Sharma",
    Category: "OBC",
    "Certificate number": "UP/OBC/2019/00417293",
    "Issue date": "19-07-2019",
  },
  "Domicile Certificate": {
    Name: "Aaditya Kumar Sharma",
    State: "Uttar Pradesh",
    "Issue date": "02-11-2020",
  },
  Photo: {},
  Signature: {},
  Other: {},
};
