import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { listPublishedPapersAction } from "@/lib/actions/pyq";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * The missing entry point this whole feature needed — Phase 7.5 built the
 * calculator but only linked to it from inside a paper's own detail page,
 * with no way to discover it from the main nav. This lists every
 * published paper (answer-key-recorded ones first) so a person can find
 * their exam and start calculating, whether or not GovAssist has an
 * official answer key on file for it yet — see the per-paper hub page's
 * own copy for that distinction.
 */
export default async function AnswerKeyLandingPage() {
  const result = await listPublishedPapersAction();

  if (result.error === MISSING_SUPABASE_CONFIG_MESSAGE) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  const papers = result.papers;

  return (
    <AppShell title="Answer key calculator" showBack>
      <p className="mt-1 text-sm text-ink-muted">
        Pick the exam paper you took to calculate your score — from the official answer key when GovAssist has one on
        file, or from the paper's own stored correct answers otherwise.
      </p>

      {result.error ? (
        <p className="mt-6 text-sm text-ineligible-fg">{result.error}</p>
      ) : papers.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No papers yet" description="Once a paper is published, you'll be able to calculate your score from here." />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {papers.map((paper) => (
            <Link key={paper.id} href={`/preparation/pyq/${paper.id}/answer-key`}>
              <Card interactive className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">{paper.examShortName}</p>
                    <p className="text-sm text-ink-muted">
                      {paper.year} · {paper.stage}
                      {paper.shift ? ` · ${paper.shift}` : ""}
                    </p>
                  </div>
                  <Badge tone="brand">{paper.examCategory}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
