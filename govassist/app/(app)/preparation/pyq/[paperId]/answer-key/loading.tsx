import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, CardRowsSkeleton } from "@/components/ui/Skeleton";

export default function AnswerKeyLoading() {
  return (
    <AppShell title="Calculate your score" showBack>
      <Skeleton className="h-6 w-2/3" />
      <div className="mt-4">
        <CardRowsSkeleton rows={3} />
      </div>
      <div className="mt-4 space-y-3">
        <Skeleton className="h-16 w-full rounded" />
        <Skeleton className="h-16 w-full rounded" />
        <Skeleton className="h-16 w-full rounded" />
      </div>
    </AppShell>
  );
}
