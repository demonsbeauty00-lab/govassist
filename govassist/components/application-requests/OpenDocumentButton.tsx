"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";

/** Opens a private document through a short-lived signed URL fetched by a
 *  server action that has already checked the caller's permission. */
export function OpenDocumentButton({
  documentId,
  label,
  getUrl,
}: {
  documentId: string;
  label: string;
  getUrl: (id: string) => Promise<{ url?: string; error?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-w-0">
      <Button
        size="sm"
        variant="secondary"
        isLoading={pending}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await getUrl(documentId);
            if (res.error || !res.url) setError(res.error ?? "Couldn't open this document.");
            else window.open(res.url, "_blank", "noopener,noreferrer");
          });
        }}
      >
        {pending ? "Opening…" : label}
      </Button>
      {error && <p className="mt-1 text-sm text-ineligible-fg" role="alert">{error}</p>}
    </div>
  );
}
