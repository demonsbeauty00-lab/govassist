"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { uploadResponseSheetAction } from "@/lib/actions/answer-key";
import { formatDate } from "@/lib/utils";
import { Database } from "@/lib/supabase/database.types";

type UploadRow = Database["public"]["Tables"]["response_sheet_uploads"]["Row"];

export function ResponseSheetUploadClient({ paperId, initialUploads }: { paperId: string; initialUploads: UploadRow[] }) {
  const [uploads] = useState(initialUploads);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChosen(file: File) {
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadResponseSheetAction(paperId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Refresh the list rather than a full page reload — cheap, and this
      // action always returns a fresh success/needs_review row.
      window.location.reload();
    });
  }

  return (
    <div>
      <Card className="p-4">
        <p className="text-sm text-ink-muted">
          Upload your response sheet (PDF, JPG, or PNG, up to 10MB). Automatic answer extraction from uploaded files isn't
          available yet — every upload is saved for admin review, and you can enter your answers manually in the meantime
          for an instant calculation.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileChosen(file);
          }}
        />
        <Button size="sm" className="mt-3" onClick={() => inputRef.current?.click()} isLoading={pending}>
          Choose file
        </Button>
        {error && <p className="mt-2 text-sm text-ineligible-fg">{error}</p>}
      </Card>

      {uploads.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-ink">Your uploads</p>
          {uploads.map((u) => (
            <Card key={u.id} className="flex items-center justify-between p-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{u.file_name ?? "Response sheet"}</p>
                <p className="text-xs text-ink-muted">{formatDate(u.created_at)}</p>
              </div>
              <Badge tone={u.status === "processed" ? "positive" : u.status === "failed" ? "negative" : "warning"}>
                {u.status.replace("_", " ")}
              </Badge>
            </Card>
          ))}
        </div>
      )}

      <Link href={`/preparation/pyq/${paperId}/answer-key/manual-entry`}>
        <Button variant="secondary" fullWidth className="mt-4">
          Enter answers manually instead
        </Button>
      </Link>
    </div>
  );
}
