"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface ProfileFieldProps {
  label: string;
  value: string;
  onSave: (newValue: string) => Promise<void> | void;
  inputType?: "text" | "date";
}

export function ProfileField({ label, value, onSave, inputType = "text" }: ProfileFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5">
        <div>
          <p className="text-sm text-ink-muted">{label}</p>
          <p className="text-[15px] font-medium text-ink">{value || "—"}</p>
        </div>
        <button
          onClick={() => {
            setDraft(value);
            setError(null);
            setEditing(true);
          }}
          className="text-sm font-medium text-brand-600"
        >
          Edit
        </button>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-2.5">
      <p className="text-sm text-ink-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <input
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="h-10 flex-1 rounded border border-hairline bg-paper-raised px-3 text-[15px] text-ink focus-visible:border-brand-600"
        />
        <Button size="sm" onClick={handleSave} isLoading={saving}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
      {error && <p className="mt-1.5 text-sm text-ineligible-fg">{error}</p>}
    </div>
  );
}

export function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <div className="mt-1 divide-y divide-hairline">{children}</div>
    </Card>
  );
}
