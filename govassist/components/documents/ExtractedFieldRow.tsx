"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ExtractedField } from "@/lib/ocr/extract";

const confidenceTone: Record<ExtractedField["confidence"], "positive" | "warning" | "negative"> = {
  high: "positive",
  medium: "warning",
  low: "negative",
};

interface ExtractedFieldRowProps {
  field: ExtractedField;
  onSave: (newValue: string) => Promise<void>;
  onConfirm: () => Promise<void>;
}

export function ExtractedFieldRow({ field, onSave, onConfirm }: ExtractedFieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't confirm — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-hairline py-3 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">{field.label}</p>
        <div className="flex items-center gap-1.5">
          {field.confirmed ? (
            <Badge tone="positive">Confirmed</Badge>
          ) : (
            <Badge tone={confidenceTone[field.confidence]}>{field.confidence} confidence</Badge>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-1.5 flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-10 flex-1 rounded border border-hairline bg-paper-raised px-3 text-[15px] text-ink focus-visible:border-brand-600"
          />
          <Button size="sm" onClick={handleSave} isLoading={busy}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-[15px] font-medium text-ink">{field.value || "—"}</p>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={() => {
                setDraft(field.value);
                setError(null);
                setEditing(true);
              }}
              className="text-sm font-medium text-brand-600"
              disabled={busy}
            >
              Edit
            </button>
            {!field.confirmed && (
              <button onClick={handleConfirm} className="text-sm font-medium text-eligible-fg" disabled={busy}>
                Looks right
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-1.5 text-sm text-ineligible-fg">{error}</p>}
    </div>
  );
}
