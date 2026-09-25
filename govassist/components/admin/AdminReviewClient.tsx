"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { Database } from "@/lib/supabase/database.types";
import { approveDetectedUpdateAction, rejectDetectedUpdateAction } from "@/lib/actions/admin-review";

type DetectedUpdate = Database["public"]["Tables"]["detected_updates"]["Row"];

const classificationTone = {
  auto_publish: "positive",
  needs_review: "warning",
  reject: "negative",
} as const;

function UpdateCard({ update, onResolved }: { update: DetectedUpdate; onResolved: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  async function handleApprove() {
    setBusy(true);
    setError(null);
    const result = await approveDetectedUpdateAction(update.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onResolved(update.id);
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    const result = await rejectDetectedUpdateAction(update.id, notes || undefined);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onResolved(update.id);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{update.title}</p>
          <p className="text-sm text-ink-muted">
            {update.update_type.replace(/_/g, " ")} · detected {formatDate(update.detected_at)}
          </p>
        </div>
        <Badge tone={classificationTone[update.classification]}>{update.classification.replace("_", " ")}</Badge>
      </div>

      {update.extracted_fields.length > 0 && (
        <dl className="mt-3 space-y-1.5 border-t border-hairline pt-3">
          {update.extracted_fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between text-sm">
              <dt className="text-ink-muted">{f.label}</dt>
              <dd className="font-medium text-ink">
                {f.value} <span className="text-xs font-normal text-ink-faint">({f.confidence})</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 space-y-1 border-t border-hairline pt-3 text-sm">
        <p className="text-ink-muted">
          Source: <a href={update.official_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">{update.official_url}</a>
        </p>
        {update.document_url && (
          <p className="text-ink-muted">
            Document: <a href={update.document_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">{update.document_url}</a>
          </p>
        )}
        {update.publication_date && <p className="text-ink-muted">Published: {formatDate(update.publication_date)}</p>}
      </div>

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional, shown only in the audit log)"
        className="mt-3 h-9 w-full rounded border border-hairline bg-paper-raised px-3 text-sm text-ink"
      />

      {error && <p className="mt-2 text-sm text-ineligible-fg">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={handleApprove} isLoading={busy}>
          Approve & publish
        </Button>
        <Button size="sm" variant="danger" onClick={handleReject} isLoading={busy}>
          Reject
        </Button>
      </div>
    </Card>
  );
}

export function AdminReviewClient({ initialUpdates }: { initialUpdates: DetectedUpdate[] }) {
  const [updates, setUpdates] = useState(initialUpdates);

  function handleResolved(id: string) {
    setUpdates((list) => list.filter((u) => u.id !== id));
  }

  if (updates.length === 0) {
    return <EmptyState title="Nothing to review" description="No pending updates right now." />;
  }

  return (
    <div className="space-y-3">
      {updates.map((update) => (
        <UpdateCard key={update.id} update={update} onResolved={handleResolved} />
      ))}
    </div>
  );
}
