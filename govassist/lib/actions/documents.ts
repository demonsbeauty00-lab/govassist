"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { DOCUMENT_TYPES, DocumentType, PROFILE_FIELD_ENTRIES, ProfileEditableField, EDUCATION_FIELD_MAP, DOCUMENT_TYPE_SLUGS } from "@/lib/document-types";
import { extractDocumentFields, ExtractedField } from "@/lib/ocr/extract";
import { Database } from "@/lib/supabase/database.types";

const BUCKET = "documents";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

// ---------------------------------------------------------------------------
// List — merges real rows with the fixed 8-type checklist so the UI always
// shows all 8 slots, even for types the user hasn't uploaded yet.
// ---------------------------------------------------------------------------
export async function getDocumentsAction() {
  const result = await requireUser();
  if (!result.ok) {
    return { configError: true as const, documents: [] as (DocumentRow | { document_type: DocumentType; status: "not_uploaded" })[] };
  }
  const { supabase, user } = result;

  const { data, error } = await supabase.from("documents").select("*").eq("user_id", user.id);
  if (error) {
    return { configError: false as const, error: error.message, documents: [] as DocumentRow[] };
  }

  const byType = new Map((data ?? []).map((d: DocumentRow) => [d.document_type, d]));
  const merged = DOCUMENT_TYPES.map(
    (type) => byType.get(type) ?? ({ document_type: type, status: "not_uploaded" as const })
  );

  return { configError: false as const, error: null, documents: merged };
}

export async function getDocumentAction(documentId: string) {
  const result = await requireUser();
  if (!result.ok) return { configError: true as const, document: null };
  const { supabase, user } = result;

  const { data } = await supabase.from("documents").select("*").eq("id", documentId).eq("user_id", user.id).maybeSingle();
  return { configError: false as const, document: data };
}

/** Looks a document up by type rather than id — the /documents/[type] route
 *  needs this because a not-yet-uploaded document has no id yet. */
export async function getDocumentByTypeAction(documentType: DocumentType) {
  const result = await requireUser();
  if (!result.ok) return { configError: true as const, document: null };
  const { supabase, user } = result;

  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", user.id)
    .eq("document_type", documentType)
    .maybeSingle();

  return { configError: false as const, document: data };
}

// ---------------------------------------------------------------------------
// Upload — stores the file privately, replaces any previous copy for that
// type (no unnecessary duplicate copies kept), then runs extraction.
// ---------------------------------------------------------------------------
export async function uploadDocumentAction(formData: FormData): Promise<{ error?: string; success?: boolean; documentId?: string }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const documentType = String(formData.get("document_type") ?? "");
  if (!DOCUMENT_TYPES.includes(documentType as DocumentType)) {
    return { error: "Unrecognised document type." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: "That file is too large — the limit is 10MB." };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { error: "Only PDF, JPG, and PNG files are supported." };
  }

  // Replace, don't accumulate: if this type already has a file, delete it
  // from Storage before uploading the new one — "do not store unnecessary
  // copies" applies to the actual bytes, not just the database row.
  const { data: existing } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("user_id", user.id)
    .eq("document_type", documentType)
    .maybeSingle();

  if (existing?.storage_path) {
    await supabase.storage.from(BUCKET).remove([existing.storage_path]);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const storagePath = `${user.id}/${DOCUMENT_TYPE_SLUGS[documentType as DocumentType]}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { data: row, error: upsertError } = await supabase
    .from("documents")
    .upsert(
      {
        user_id: user.id,
        document_type: documentType,
        status: "processing",
        storage_path: storagePath,
        file_name: file.name,
        source: "manual_upload",
        extracted_fields: [],
        uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,document_type" }
    )
    .select("id")
    .single();

  if (upsertError || !row) {
    // Roll back the upload if we couldn't record it — never leave an
    // orphaned file with no corresponding, RLS-governed database row.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { error: upsertError?.message ?? "Couldn't save the document record." };
  }

  // Run extraction. OCR can fail or be slow — a failure here still leaves a
  // valid, viewable document (status stays processing rather than silently
  // becoming "verified"), so nothing gets lost.
  try {
    const fields: ExtractedField[] = await extractDocumentFields(documentType as DocumentType);
    await supabase
      .from("documents")
      .update({
        // Nothing to review for Photo/Signature/Other (no fields at all) —
        // those go straight to verified. Everything else must be reviewed.
        status: fields.length > 0 ? "needs_review" : "verified",
        extracted_fields: fields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  } catch {
    // Leave status as "processing" — the document view can offer a retry
    // rather than the upload action silently failing partway through.
  }

  revalidatePath("/documents");
  revalidatePath(`/documents/${DOCUMENT_TYPE_SLUGS[documentType as DocumentType]}`);
  revalidatePath("/home");

  return { success: true, documentId: row.id };
}

// ---------------------------------------------------------------------------
// Private, time-limited viewing — never a public URL.
// ---------------------------------------------------------------------------
export async function getSignedDocumentUrlAction(documentId: string): Promise<{ url?: string; error?: string }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!doc?.storage_path) return { error: "File not found." };

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60 * 5); // 5 minutes
  if (error || !data) return { error: "Couldn't generate a link to this file." };

  return { url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// Editing extracted fields — every edit is itself the user's confirmation.
// ---------------------------------------------------------------------------
export async function updateExtractedFieldAction(
  documentId: string,
  fieldLabel: string,
  newValue: string
): Promise<{ error?: string; success?: boolean }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: doc } = await supabase
    .from("documents")
    .select("extracted_fields")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!doc) return { error: "Document not found." };

  const updatedFields = doc.extracted_fields.map((f: ExtractedField) =>
    f.label === fieldLabel ? { ...f, value: newValue, confidence: "high" as const, confirmed: true } : f
  );

  const { error } = await supabase
    .from("documents")
    .update({ extracted_fields: updatedFields, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/documents");
  return { success: true };
}

/** Confirms a field's OCR value as-is, without editing it. */
export async function confirmExtractedFieldAction(documentId: string, fieldLabel: string): Promise<{ error?: string; success?: boolean }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: doc } = await supabase
    .from("documents")
    .select("extracted_fields")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!doc) return { error: "Document not found." };

  const updatedFields = doc.extracted_fields.map((f: ExtractedField) => (f.label === fieldLabel ? { ...f, confirmed: true } : f));

  const { error } = await supabase
    .from("documents")
    .update({ extracted_fields: updatedFields, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/documents");
  return { success: true };
}

/** Marks the whole document reviewed — only once every field has been
 *  individually confirmed, so this can never silently wave through an
 *  unreviewed OCR guess. */
export async function confirmDocumentAction(documentId: string): Promise<{ error?: string; success?: boolean }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: doc } = await supabase
    .from("documents")
    .select("extracted_fields, status")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!doc) return { error: "Document not found." };

  const unconfirmed = doc.extracted_fields.filter((f: ExtractedField) => !f.confirmed);
  if (unconfirmed.length > 0) {
    return { error: `Review the remaining field${unconfirmed.length > 1 ? "s" : ""} before confirming: ${unconfirmed.map((f: ExtractedField) => f.label).join(", ")}.` };
  }

  const { error } = await supabase
    .from("documents")
    .update({ status: "verified", updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/documents");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Deletion — removes the actual file from Storage, then the row. Nothing
// left behind.
// ---------------------------------------------------------------------------
export async function deleteDocumentAction(documentId: string): Promise<{ error?: string; success?: boolean }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (doc?.storage_path) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    if (storageError) return { error: `Couldn't delete the file: ${storageError.message}` };
  }

  const { error } = await supabase.from("documents").delete().eq("id", documentId).eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/documents");
  revalidatePath("/home");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Apply to profile — only reachable once a document is fully reviewed
// (status = "verified"), so every value it writes has already been
// confirmed by the user field-by-field, not assumed from raw OCR output.
// ---------------------------------------------------------------------------
export async function applyExtractedFieldsToProfileAction(documentId: string): Promise<{ error?: string; success?: boolean; message?: string }> {
  const result = await requireUser();
  if (!result.ok) return { error: MISSING_SUPABASE_CONFIG_MESSAGE };
  const { supabase, user } = result;

  const { data: doc } = await supabase.from("documents").select("*").eq("id", documentId).eq("user_id", user.id).maybeSingle();
  if (!doc) return { error: "Document not found." };
  if (doc.status !== "verified") {
    return { error: "Review and confirm every field before applying it to your profile." };
  }

  const fieldMap = new Map<string, string>(doc.extracted_fields.map((f: ExtractedField) => [f.label, f.value]));

  const profileUpdate: Partial<Record<ProfileEditableField, string>> = {};
  for (const [label, profileField] of PROFILE_FIELD_ENTRIES as Array<[string, ProfileEditableField]>) {
    const value = fieldMap.get(label);
    if (value) profileUpdate[profileField] = value;
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update({ ...profileUpdate, updated_at: new Date().toISOString() } as Database["public"]["Tables"]["profiles"]["Update"])
      .eq("user_id", user.id);
    if (error) return { error: error.message };
  }

  const educationTemplate = EDUCATION_FIELD_MAP[doc.document_type as DocumentType];
  if (educationTemplate) {
    const { data: existingEducation } = await supabase
      .from("education")
      .select("id")
      .eq("user_id", user.id)
      .eq("qualification_level", educationTemplate.qualification_level)
      .maybeSingle();

    const educationRow = {
      user_id: user.id,
      qualification_level: educationTemplate.qualification_level,
      subject: fieldMap.get("Subject") ?? fieldMap.get("Stream") ?? null,
      board_or_university: fieldMap.get("University") ?? fieldMap.get("School") ?? null,
      passing_year: fieldMap.get("Passing year") ? Number(fieldMap.get("Passing year")) : null,
      source: "ocr" as const,
      updated_at: new Date().toISOString(),
    };

    if (existingEducation) {
      await supabase.from("education").update(educationRow).eq("id", existingEducation.id);
    } else {
      await supabase.from("education").insert(educationRow);
    }
  }

  revalidatePath("/profile");
  revalidatePath("/home");
  revalidatePath("/documents");

  return {
    success: true,
    message: "Your profile has been updated from your documents.",
  };
}
