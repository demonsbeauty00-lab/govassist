"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { Database } from "@/lib/supabase/database.types";
import {
  approvePaperAction,
  getPendingPaperQuestionsAction,
  rejectPaperAction,
  runManualIngestionAction,
} from "@/lib/actions/pyq-admin";

type PaperRow = Database["public"]["Tables"]["papers"]["Row"];
type QuestionRow = Database["public"]["Tables"]["questions"]["Row"] & {
  options: Database["public"]["Tables"]["question_options"]["Row"][];
};

function PaperCard({ paper, onResolved }: { paper: PaperRow; onResolved: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [questions, setQuestions] = useState<QuestionRow[] | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  async function loadQuestions() {
    if (questions) {
      setQuestions(null);
      return;
    }
    setLoadingQuestions(true);
    const result = await getPendingPaperQuestionsAction(paper.id);
    setLoadingQuestions(false);
    if (!result.error) setQuestions(result.questions as QuestionRow[]);
  }

  async function handleApprove() {
    setBusy(true);
    setError(null);
    const result = await approvePaperAction(paper.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onResolved(paper.id);
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    const result = await rejectPaperAction(paper.id, notes || undefined);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onResolved(paper.id);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{paper.title}</p>
          <p className="text-sm text-ink-muted">
            {paper.exam_short_name} · {paper.year} · {paper.stage} · {paper.total_questions} questions · created {formatDate(paper.created_at)}
          </p>
        </div>
        <Badge tone="warning">needs review</Badge>
      </div>

      {paper.extraction_confidence !== null && (
        <p className="mt-2 text-sm text-ink-muted">Extraction confidence: {Math.round(paper.extraction_confidence * 100)}%</p>
      )}

      <p className="mt-2 text-sm text-ink-muted">
        Source:{" "}
        <a href={paper.official_source_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">
          {paper.official_source_url}
        </a>
      </p>

      <button onClick={loadQuestions} className="mt-2 text-sm font-medium text-brand-600">
        {loadingQuestions ? "Loading…" : questions ? "Hide questions" : "Preview questions"}
      </button>

      {questions && (
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto border-t border-hairline pt-2">
          {questions.map((q) => (
            <div key={q.id} className="rounded bg-paper-sunk p-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-ink">
                  Q{q.question_number}. {q.prompt}
                </p>
                {q.extraction_confidence !== null && (
                  <span className="shrink-0 text-xs text-ink-faint">{Math.round((q.extraction_confidence ?? 0) * 100)}%</span>
                )}
              </div>
              {q.options.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-ink-muted">
                  {q.options.map((o) => (
                    <li key={o.id} className={o.is_correct ? "font-medium text-eligible-fg" : ""}>
                      {o.option_label}. {o.option_text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional, shown only in the audit log)"
        className="mt-3 h-9 w-full rounded border border-hairline bg-paper-raised px-3 text-sm text-ink"
      />

      {error && <p className="mt-2 text-sm text-ineligible-fg">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={handleApprove} isLoading={busy}>
          Approve &amp; publish
        </Button>
        <Button size="sm" variant="danger" onClick={handleReject} isLoading={busy}>
          Reject
        </Button>
      </div>
    </Card>
  );
}

function ManualIngestionForm() {
  const [documentUrl, setDocumentUrl] = useState("");
  const [organization, setOrganization] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await runManualIngestionAction({ documentUrl, organization, rawContent });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.duplicate) {
      setMessage("This document has already been ingested — no new paper was created.");
    } else if (result.classification === "reject") {
      setMessage("Ingestion ran, but the content didn't pass validation (too few usable questions / confidence too low) — nothing was created.");
    } else if (result.classification === "auto_publish") {
      setMessage("Paper ingested and published automatically — every question passed high-confidence validation.");
    } else {
      setMessage("Paper ingested and is now in the review list below.");
    }
    setRawContent("");
  }

  return (
    <Card className="p-4">
      <p className="font-semibold text-ink">Manual import</p>
      <p className="mt-1 text-sm text-ink-muted">
        Paste a verified paper's structured JSON transcript (see lib/pyq/ingestion/parsers/json-paper.parser.ts for
        the expected shape) plus the official document it came from. This goes through the exact same
        validation/classification/duplicate-detection pipeline a scheduled import would.
      </p>

      <div className="mt-3 space-y-2.5">
        <input
          value={documentUrl}
          onChange={(e) => setDocumentUrl(e.target.value)}
          placeholder="Official source document URL"
          className="h-10 w-full rounded border border-hairline bg-paper-raised px-3 text-sm text-ink"
        />
        <input
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          placeholder="Organization (e.g. Staff Selection Commission)"
          className="h-10 w-full rounded border border-hairline bg-paper-raised px-3 text-sm text-ink"
        />
        <textarea
          value={rawContent}
          onChange={(e) => setRawContent(e.target.value)}
          placeholder="Paste the paper's JSON transcript here"
          rows={8}
          className="w-full rounded border border-hairline bg-paper-raised p-3 font-mono text-xs text-ink"
        />
      </div>

      {error && <p className="mt-2 text-sm text-ineligible-fg">{error}</p>}
      {message && <p className="mt-2 text-sm text-eligible-fg">{message}</p>}

      <Button size="sm" className="mt-3" onClick={handleSubmit} isLoading={busy}>
        Run ingestion
      </Button>
    </Card>
  );
}

export function PyqAdminReviewClient({ initialPapers }: { initialPapers: PaperRow[] }) {
  const [papers, setPapers] = useState(initialPapers);

  function handleResolved(id: string) {
    setPapers((list) => list.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-6">
      <ManualIngestionForm />

      <div>
        <p className="mb-3 font-semibold text-ink">Pending papers</p>
        {papers.length === 0 ? (
          <EmptyState title="Nothing to review" description="No pending PYQ papers right now." />
        ) : (
          <div className="space-y-3">
            {papers.map((paper) => (
              <PaperCard key={paper.id} paper={paper} onResolved={handleResolved} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
