import Link from "next/link";
import { ExamCycle } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function PreparationCard({ exam }: { exam: ExamCycle }) {
  return (
    <Card className="p-4">
      <p className="text-[15px] font-semibold text-ink">{exam.shortName}</p>
      <p className="text-sm text-ink-muted">{exam.examPattern[0]?.sections.length ?? 0} sections · {exam.examPattern.length} tier{exam.examPattern.length > 1 ? "s" : ""}</p>
      <div className="mt-3 flex gap-2">
        <Link href={`/preparation/mock-test/${exam.id}`} className="flex-1">
          <Button size="sm" fullWidth>Start mock test</Button>
        </Link>
        <Link href={`/jobs/${exam.id}`} className="flex-1">
          <Button size="sm" variant="secondary" fullWidth>Syllabus</Button>
        </Link>
      </div>
    </Card>
  );
}
