"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { UploadIcon, LockIcon } from "@/components/ui/Icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExtractedFieldRow } from "./ExtractedFieldRow";
import { DocumentType } from "@/lib/document-types";
import { formatDate } from "@/lib/utils";
import { ExtractedField } from "@/lib/ocr/extract";
import { Database } from "@/lib/supabase/database.types";
import {
  uploadDocumentAction,
  getSignedDocumentUrlAction,
  updateExtractedFieldAction,
  confirmExtractedFieldAction,
  confirmDocumentAction,
  deleteDocumentAction,
  applyExtractedFieldsToProfileAction,
} from "@/lib/actions/documents";

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

const statusTone: Record<string, "positive" | "warning" | "neutral"> = {
  verified: "positive",
  needs_review: "warning",
  processing: "neutral",
};
const statusLabel: Record<string, string> = {
  verified: "Verified",
  needs_review: "Needs review",
  processing: "Processing",
};

export function DocumentDetailClient({ documentType, initialDocument }: { documentType: DocumentType; initialDocument: DocumentRow | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleFileChosen(file: File) {
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.set("document_type", documentType);
    formData.set("file", file);
    const result = await uploadDocumentAction(formData);
    setUploading(false);
    if (result.error) {
      setUploadError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleViewFile() {
    setViewing(true);
    const result = await getSignedDocumentUrlAction(initialDocument!.id);
    setViewing(false);
    if (result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    }
  }

  async function handleConfirmAll() {
    setConfirming(true);
    setConfirmError(null);
    const result = await confirmDocumentAction(initialDocument!.id);
    setConfirming(false);
    if (result.error) {
      setConfirmError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleApply() {
    setApplying(true);
    setApplyError(null);
    const result = await applyExtractedFieldsToProfileAction(initialDocument!.id);
    setApplying(false);
    if (result.error) {
      setApplyError(result.error);
      return;
    }
    setApplyMessage(result.message ?? null);
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteDocumentAction(initialDocument!.id);
    setDeleting(false);
    if (!result.error) {
      router.refresh();
    }
  }

  // -------------------------------------------------------------------
  // Nothing uploaded yet — show the upload prompt.
  // -------------------------------------------------------------------
  if (!initialDocument) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={<UploadIcon />}
          title="Nothing uploaded yet"
          description="PDF, JPG, or PNG, up to 10MB."
          action={
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileChosen(file);
                }}
              />
              <Button size="sm" onClick={() => fileInputRef.current?.click()} isLoading={uploading}>
                Upload file
              </Button>
            </div>
          }
        />
        {uploadError && <p className="mt-3 text-sm text-ineligible-fg">{uploadError}</p>}
      </div>
    );
  }

  const doc = initialDocument;
  const fields = doc.extracted_fields as ExtractedField[];
  const allConfirmed = fields.length > 0 && fields.every((f) => f.confirmed);

  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-center justify-between">
        <Badge tone={statusTone[doc.status] ?? "neutral"}>{statusLabel[doc.status] ?? doc.status}</Badge>
        {doc.source === "digilocker" && <span className="text-xs text-ink-faint">Fetched via DigiLocker</span>}
      </div>

      <Card className="p-4">
        <p className="text-sm font-medium text-ink">{doc.file_name}</p>
        {doc.uploaded_at && <p className="text-sm text-ink-faint">Uploaded {formatDate(doc.uploaded_at)}</p>}
        <Button size="sm" variant="secondary" className="mt-3" onClick={handleViewFile} isLoading={viewing}>
          View file
        </Button>
      </Card>

      {doc.status === "processing" && fields.length === 0 && (
        <Card className="p-4">
          <p className="text-sm text-ink-muted">
            We couldn't automatically read this document. You can still keep the file as-is, or
            replace it to try again.
          </p>
        </Card>
      )}

      {fields.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Extracted information</p>
          <p className="mt-1 text-sm text-ink-muted">
            Pulled automatically — OCR can make mistakes. Review each field below; edited or
            confirmed fields are marked accordingly.
          </p>
          <div className="mt-1">
            {fields.map((field) => (
              <ExtractedFieldRow
                key={field.label}
                field={field}
                onSave={async (value) => {
                  const result = await updateExtractedFieldAction(doc.id, field.label, value);
                  if (result.error) throw new Error(result.error);
                  router.refresh();
                }}
                onConfirm={async () => {
                  const result = await confirmExtractedFieldAction(doc.id, field.label);
                  if (result.error) throw new Error(result.error);
                  router.refresh();
                }}
              />
            ))}
          </div>

          {doc.status !== "verified" && (
            <>
              <Button className="mt-4" size="sm" onClick={handleConfirmAll} isLoading={confirming} disabled={!allConfirmed}>
                Confirm all reviewed
              </Button>
              {!allConfirmed && (
                <p className="mt-2 text-xs text-ink-faint">Review every field above ("Edit" or "Looks right") to continue.</p>
              )}
              {confirmError && <p className="mt-2 text-sm text-ineligible-fg">{confirmError}</p>}
            </>
          )}
        </Card>
      )}

      {doc.status === "verified" && !applyMessage && (
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink">Apply to your profile</p>
          <p className="mt-1 text-sm text-ink-muted">
            Copy the confirmed information above into your profile and education details.
          </p>
          <Button size="sm" className="mt-3" onClick={handleApply} isLoading={applying}>
            Apply to profile
          </Button>
          {applyError && <p className="mt-2 text-sm text-ineligible-fg">{applyError}</p>}
        </Card>
      )}

      {applyMessage && (
        <Card className="border-eligible-fg/30 bg-eligible-bg p-4">
          <p className="text-sm font-medium text-eligible-fg">{applyMessage}</p>
          <p className="mt-1 text-sm text-ink-muted">
            Please double check your profile — extracted information should always be reviewed,
            even after it's been applied.
          </p>
        </Card>
      )}

      <div className="flex gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileChosen(file);
          }}
        />
        <Button variant="secondary" fullWidth onClick={() => fileInputRef.current?.click()} isLoading={uploading}>
          Replace file
        </Button>
      </div>
      {uploadError && <p className="text-sm text-ineligible-fg">{uploadError}</p>}

      {!deleteConfirming ? (
        <Button variant="danger" fullWidth onClick={() => setDeleteConfirming(true)}>
          Delete document
        </Button>
      ) : (
        <Card className="border-ineligible-fg/30 bg-ineligible-bg p-4">
          <p className="text-sm font-medium text-ink">Delete this document?</p>
          <p className="mt-1 text-sm text-ink-muted">
            The file and its extracted information will be permanently removed. This can't be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="danger" onClick={handleDelete} isLoading={deleting}>
              Yes, delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeleteConfirming(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div className="flex items-start gap-2.5 text-sm text-ink-faint">
        <LockIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Only used to fill forms or verify eligibility when you give permission.</p>
      </div>
    </div>
  );
}
