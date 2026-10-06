import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, CardRowsSkeleton, ListSkeleton } from "@/components/ui/Skeleton";

export default function ResultLoading() {
  return (
    <AppShell title="Result" showBack>
      <Skeleton className="h-5 w-1/2" />
      <div className="mt-4 flex justify-center">
        <Skeleton className="h-28 w-28 rounded-full" />
      </div>
      <div className="mt-5">
        <CardRowsSkeleton rows={4} />
      </div>
      <div className="mt-6">
        <ListSkeleton count={4} />
      </div>
    </AppShell>
  );
}
