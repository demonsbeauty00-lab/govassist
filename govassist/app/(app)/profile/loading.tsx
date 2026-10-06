import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, CardRowsSkeleton } from "@/components/ui/Skeleton";

export default function ProfileLoading() {
  return (
    <AppShell title="Profile">
      <div className="flex items-center gap-3">
        <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <CardRowsSkeleton rows={4} />
        <CardRowsSkeleton rows={3} />
      </div>
    </AppShell>
  );
}
