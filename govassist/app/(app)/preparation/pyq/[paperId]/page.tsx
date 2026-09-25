import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ConfigErrorScreen } from "@/components/ConfigErrorScreen";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPaperDetailAction } from "@/lib/actions/pyq";
import { MISSING_SUPABASE_CONFIG_MESSAGE } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function PaperDetailsPage({ params }: { params: { paperId: string } }) {
  const result = await getPaperDetailAction(params.paperId);

  if (result.error === MISSING_SUPABASE_CONFIG_MESSAGE) {
    return <ConfigErrorScreen message={MISSING_SUPABASE_CONFIG_MESSAGE} />;
  }

  if (result.error || !result.paper) {
    return (
      <AppShell title="Paper details" showBack>
        <div className="mt-4">
          <EmptyState title="Paper not found" description="This paper may have been removed or isn't published yet." />
        </div>
      </AppShell>
    );
  }

  const paper = result.paper;

  return (
    <AppShell title={paper.examShortName} showBack>
      <div className="mt-1">
        <p className="text-sm text-ink-muted">
          {paper.year} · {paper.stage}
          {paper.shift ? ` · ${paper.shift}` : ""}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold text-ink">{paper.title}</h1>
        <div className="mt-2">
          <Badge tone="brand">{paper.examCategory}</Badge>
        </div>
      </div>

      <Card className="mt-4 space-y-2 p-4">
        <Row label="Questions" value={`${paper.totalQuestions}`} />
        <Row label="Duration" value={`${paper.durationMinutes} minutes`} />
        {paper.totalMarks && <Row label="Total marks" value={`${paper.totalMarks}`} />}
        <Row
          label="Marking"
          value={`+${paper.defaultMarkingScheme.correctMarks} correct${paper.defaultMarkingScheme.incorrectMarks > 0 ? `, -${paper.defaultMarkingScheme.incorrectMarks} incorrect` : ", no negative marking"}`}
        />
      </Card>

      {paper.sections.length > 0 && (
        <Card className="mt-3 p-4">
          <p className="text-sm font-semibold text-ink">Sections</p>
          <div className="mt-2 space-y-1.5">
            {paper.sections.map((s) => {
              const scheme = paper.sectionMarkingSchemes[s.id] ?? paper.defaultMarkingScheme;
              return (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{s.name}</span>
                  <span className="text-ink-muted">
                    {s.questionCount} qs · +{scheme.correctMarks}/-{scheme.incorrectMarks}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="mt-3 space-y-2 p-4 text-sm text-ink-muted">
        <p className="font-semibold text-ink">Instructions</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>This is a timed attempt — the timer starts as soon as you tap "Start mock test" and submits automatically when it reaches zero.</li>
          <li>Use "Save &amp; Next" to record an answer and move on, "Mark for review" to flag a question, and "Clear response" to remove your selection.</li>
          <li>You can navigate freely between questions using the question palette at any point before submitting.</li>
          <li>Once submitted, you'll see your score and a full answer review with explanations, per the official marking scheme above.</li>
        </ul>
        <p>
          Source:{" "}
          <a href={paper.officialSourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">
            {paper.officialSourceUrl}
          </a>
        </p>
      </Card>

      <Link href={`/preparation/pyq/${paper.id}/attempt`}>
        <Button fullWidth className="mt-6">
          Start mock test
        </Button>
      </Link>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
