import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { DashboardExamItem, PersonalizedDashboard } from "@/lib/dashboard/personalized";

import { ReactNode } from "react";

type DateMode = "countdown" | "past";

function DateLabel({ item, mode }: { item: DashboardExamItem; mode: DateMode }) {
  if (!item.date) return null;
  if (mode === "past") return <span className="text-xs text-ink-faint">{formatDate(item.date)}</span>;
  const d = item.daysLeft;
  const text = d === null ? formatDate(item.date) : d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`;
  return (
    <span className="text-right text-xs text-ink-muted">
      <span className="block font-medium text-ink">{text}</span>
      {formatDate(item.date)}
    </span>
  );
}

function ExamRows({ items, mode }: { items: DashboardExamItem[]; mode: DateMode }) {
  return (
    <div className="divide-y divide-hairline">
      {items.map((item) => (
        <Link key={item.examId} href={`/jobs/${item.examId}`} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-ink">{item.shortName}</p>
            <p className="truncate text-xs text-ink-muted">{item.organization}</p>
            <div className="mt-1 flex gap-1">
              {item.reasons.includes("saved") && <Badge tone="brand">Saved</Badge>}
              {item.reasons.includes("eligible") && <Badge tone="positive">Matches your profile</Badge>}
            </div>
          </div>
          <DateLabel item={item} mode={mode} />
        </Link>
      ))}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
      <div className="mt-2">{children}</div>
    </Card>
  );
}

/**
 * Renders only the sections that have something in them — an empty section
 * is omitted, not shown as "0". If every section is empty, one honest empty
 * state replaces them all (see PersonalizedDashboard.isEmpty). Nothing here
 * is decorative data: every row is derived by lib/dashboard/personalized.ts
 * from an exam/paper/attempt that actually exists.
 */
export function PersonalizedSections({ data }: { data: PersonalizedDashboard }) {
  if (data.isEmpty) {
    return (
      <EmptyState
        title="Nothing personalized yet"
        description="Complete your profile and save exams you're interested in — deadlines, admit cards, answer keys, results and your mock progress will show up here."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.suitableExams.length > 0 && (
        <Section title="Exams that may suit you" hint="Potentially eligible per your profile — always verify on the official notification">
          <ExamRows items={data.suitableExams} mode="countdown" />
        </Section>
      )}
      {data.applicationsOpen.length > 0 && (
        <Section title="Applications open now">
          <ExamRows items={data.applicationsOpen} mode="countdown" />
        </Section>
      )}
      {data.upcomingDeadlines.length > 0 && (
        <Section title="Upcoming deadlines" hint="Next 30 days">
          <ExamRows items={data.upcomingDeadlines} mode="countdown" />
        </Section>
      )}
      {data.upcomingExams.length > 0 && (
        <Section title="Upcoming exams">
          <ExamRows items={data.upcomingExams} mode="countdown" />
        </Section>
      )}
      {data.admitCards.length > 0 && (
        <Section title="Admit cards available">
          <ExamRows items={data.admitCards} mode="past" />
        </Section>
      )}
      {(data.answerKeys.length > 0 || data.answerKeyPapers.length > 0) && (
        <Section title="Answer keys available">
          {data.answerKeys.length > 0 && <ExamRows items={data.answerKeys} mode="past" />}
          {data.answerKeyPapers.length > 0 && (
            <div className="divide-y divide-hairline">
              {data.answerKeyPapers.map((p) => (
                <Link key={p.paperId} href={`/preparation/pyq/${p.paperId}/answer-key`} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{p.title}</span>
                  <Badge tone="brand">{p.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Section>
      )}
      {data.results.length > 0 && (
        <Section title="Results available">
          <ExamRows items={data.results} mode="past" />
        </Section>
      )}
      {data.recentAttempts.length > 0 && (
        <Section title="Recent mock performance">
          <div className="divide-y divide-hairline">
            {data.recentAttempts.map((a) => (
              <Link key={a.attemptId} href={`/preparation/pyq/attempts/${a.attemptId}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink">{a.paperTitle}</p>
                  <p className="text-xs text-ink-faint">{formatDate(a.submittedAt)}</p>
                </div>
                <span className="font-display text-lg font-semibold text-brand-700">{a.percentage !== null ? `${a.percentage}%` : "—"}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
