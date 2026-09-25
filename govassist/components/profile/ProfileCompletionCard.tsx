import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CircularProgress } from "@/components/ui/CircularProgress";

export function ProfileCompletionCard({ percent }: { percent: number }) {
  return (
    <Card className="border-caution-fg/20 bg-caution-bg p-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">Complete Your Profile</p>
          <p className="mt-1 text-sm text-ink-muted">Add your details for better recommendations.</p>
          <Link href="/profile" className="mt-2 inline-block text-sm font-semibold text-caution-fg underline">
            Complete Now
          </Link>
        </div>
        <CircularProgress percent={percent} color="stroke-caution-fg">
          <span className="text-[15px] font-semibold text-ink">{percent}%</span>
        </CircularProgress>
      </div>
    </Card>
  );
}
