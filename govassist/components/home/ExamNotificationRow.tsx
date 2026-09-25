import Link from "next/link";
import { NotificationStatusBadge } from "@/components/exams/NotificationStatusBadge";
import { SaveExamButton } from "@/components/exams/SaveExamButton";
import { computeNotificationStatus } from "@/lib/notifications/status";
import { formatDate } from "@/lib/utils";
import { ExamCycle } from "@/lib/types";

export function ExamNotificationRow({ exam, isSaved }: { exam: ExamCycle; isSaved: boolean }) {
  const status = computeNotificationStatus(exam);

  return (
    <div className="flex items-center gap-3 border-b border-hairline py-3 last:border-b-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
        {exam.shortName.charAt(0)}
      </span>
      <Link href={`/jobs/${exam.id}`} className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{exam.shortName}</p>
        <p className="truncate text-[13px] text-ink-muted">{exam.organization}</p>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <NotificationStatusBadge status={status} />
        <span className="text-[11px] text-ink-faint">Last date: {formatDate(exam.applicationWindow.endDate)}</span>
      </div>
      <SaveExamButton examSlug={exam.id} initiallySaved={isSaved} />
    </div>
  );
}
