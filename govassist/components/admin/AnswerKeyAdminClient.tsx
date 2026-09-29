"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { submitAnswerKeyRevisionAction, listStaleAttemptsForPaperAction, notifyUsersOfAnswerKeyAction, StaleAttemptSummary } from "@/lib/actions/answer-key-admin";
import { Database } from "@/lib/supabase/database.types";

type ResponseSheetUploadRow = Database["public"]["Tables"]["response_sheet_uploads"]["Row"];

const EXAMPLE_ENTRIES = `[
  { "questionNumber": 1, "correctOptionLabel": "B" },
  { "questionNumber": 12, "statusFlag": "dropped" },
  { "questionNumber": 20, "statusFlag": "bonus_awarded" }
]`;

export function AnswerKeyAdminClient({ paperId, initialUploads }: { paperId: string; initialUploads: ResponseSheetUploadRow[] }) {
  const [documentUrl, setDocumentUrl] = useState("");
  const [status, setStatus] = useState<"provisional" | "revised" | "final">("provisional");
  const [publicationDate, setPublicationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entriesJson, setEntriesJson] = useState(EXAMPLE_ENTRIES);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [staleAttempts, setStaleAttempts] = useState<StaleAttemptSummary[] | null>(null);
  const [notifyBusy, setNotifyBusy] = useState(false);

  async function handleSubmitRevision() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await submitAnswerKeyRevisionAction({ paperId, documentUrl, status, publicationDate, rawEntriesJson: entriesJson });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.duplicate) {
      setMessage("This exact revision was already applied — nothing changed.");
    } else {
      setMessage(
        `Applied — ${result.changedCount} question(s) changed, now at version ${result.newVersion}. ${result.questionsUnmatched && result.questionsUnmatched.length > 0 ? `Unmatched question numbers: ${result.questionsUnmatched.join(", ")}.` : ""} ${result.staleAttemptCount} existing attempt(s) are now stale.`
      );
      const stale = await listStaleAttemptsForPaperAction(paperId);
      if (!stale.error) setStaleAttempts(stale.attempts);
    }
  }

  async function handleNotify() {
    setNotifyBusy(true);
    const result = await notifyUsersOfAnswerKeyAction(paperId);
    setNotifyBusy(false);
    if (!result.error) setMessage(`Notified ${result.notified} user(s).`);
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <p className="font-semibold text-ink">Submit an answer-key revision</p>
        <p className="mt-1 text-sm text-ink-muted">
          Matches entries by question number only (never by text similarity). Options and numerical answers you don't
          mention are left untouched.
        </p>

        <div className="mt-3 space-y-2.5">
          <input
            value={documentUrl}
            onChange={(e) => setDocumentUrl(e.target.value)}
            placeholder="Official answer-key document URL"
            className="h-10 w-full rounded border border-hairline bg-paper-raised px-3 text-sm text-ink"
          />
          <div className="flex gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-10 flex-1 rounded border border-hairline bg-paper-raised px-2 text-sm text-ink">
              <option value="provisional">Provisional</option>
              <option value="revised">Revised</option>
              <option value="final">Final</option>
            </select>
            <input
              type="date"
              value={publicationDate}
              onChange={(e) => setPublicationDate(e.target.value)}
              className="h-10 rounded border border-hairline bg-paper-raised px-2 text-sm text-ink"
            />
          </div>
          <textarea
            value={entriesJson}
            onChange={(e) => setEntriesJson(e.target.value)}
            rows={8}
            className="w-full rounded border border-hairline bg-paper-raised p-3 font-mono text-xs text-ink"
          />
        </div>

        {error && <p className="mt-2 text-sm text-ineligible-fg">{error}</p>}
        {message && <p className="mt-2 text-sm text-eligible-fg">{message}</p>}

        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={handleSubmitRevision} isLoading={busy}>
            Apply revision
          </Button>
          <Button size="sm" variant="secondary" onClick={handleNotify} isLoading={notifyBusy}>
            Notify affected users
          </Button>
        </div>
      </Card>

      {staleAttempts && (
        <Card className="p-4">
          <p className="font-semibold text-ink">Stale attempts ({staleAttempts.length})</p>
          <p className="mt-1 text-sm text-ink-muted">Scored against an older answer-key version. Each user can recalculate from their own result page.</p>
          <div className="mt-2 space-y-1.5">
            {staleAttempts.map((a) => (
              <div key={a.attemptId} className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">{a.submittedAt ? formatDate(a.submittedAt) : "—"}</span>
                <span className="text-ink">Score: {a.score}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <p className="font-semibold text-ink">Response sheet uploads awaiting review ({initialUploads.length})</p>
        {initialUploads.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">None right now.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {initialUploads.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">{u.file_name ?? "Response sheet"}</span>
                <Badge tone="warning">{u.status.replace("_", " ")}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
