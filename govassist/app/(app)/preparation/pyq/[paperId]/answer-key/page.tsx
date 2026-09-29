import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAnswerKeyInfoAction } from "@/lib/actions/answer-key";
import { getPaperDetailAction } from "@/lib/actions/pyq";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AnswerKeyHubPage({ params }: { params: { paperId: string } }) {
  const [infoRes, paperRes] = await Promise.all([getAnswerKeyInfoAction(params.paperId), getPaperDetailAction(params.paperId)]);

  if (infoRes.error === MISSING_SUPABASE_CONFIG_MESSAGE) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  if (infoRes.error || !paperRes.paper) {
    return (
      <AppShell title="Answer key" showBack>
        <div className="mt-4">
          <EmptyState title="Not available" description={infoRes.error ?? "This paper could not be found."} />
        </div>
      </AppShell>
    );
  }

  const info = infoRes.info;

  return (
    <AppShell title="Calculate your score" showBack>
      <h1 className="mt-1 text-lg font-semibold text-ink">{paperRes.paper.title}</h1>

      {info?.status ? (
        <Card className="mt-3 border-brand-300 bg-brand-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-700">Official answer key available</p>
            <Badge tone="brand">{info.status}</Badge>
          </div>
          {info.publishedAt && <p className="mt-1 text-xs text-ink-muted">Published {formatDate(info.publishedAt)}</p>}
          {info.sourceUrl && (
            <a href={info.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-brand-600 underline">
              View official source
            </a>
          )}
        </Card>
      ) : (
        <Card className="mt-3 p-4">
          <p className="text-sm text-ink-muted">
            No official answer key has been recorded for this paper yet. You can still calculate your score from this
            paper's own stored correct answers below.
          </p>
        </Card>
      )}

      <p className="mt-6 text-sm font-semibold text-ink">How would you like to calculate your score?</p>

      <div className="mt-3 space-y-3">
        <Link href={`/preparation/pyq/${params.paperId}/answer-key/manual-entry`}>
          <Card interactive className="p-4">
            <p className="text-[15px] font-semibold text-ink">Enter my answers manually</p>
            <p className="mt-1 text-sm text-ink-muted">Quick, works right now — pick the option you actually chose for each question.</p>
          </Card>
        </Link>

        <Link href={`/preparation/pyq/${params.paperId}/answer-key/upload`}>
          <Card interactive className="p-4">
            <p className="text-[15px] font-semibold text-ink">Upload my response sheet</p>
            <p className="mt-1 text-sm text-ink-muted">Save a PDF/photo for admin review — automatic extraction isn't available yet.</p>
          </Card>
        </Link>

        <Link href={`/preparation/pyq/${params.paperId}/attempt`}>
          <Card interactive className="p-4">
            <p className="text-[15px] font-semibold text-ink">Take it as a mock test instead</p>
            <p className="mt-1 text-sm text-ink-muted">Full timed interface with a question palette — same scoring either way.</p>
          </Card>
        </Link>
      </div>

      <Link href={`/preparation/pyq/${params.paperId}`}>
        <Button variant="secondary" fullWidth className="mt-6">
          Back to paper
        </Button>
      </Link>
    </AppShell>
  );
}
