import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, ListSkeleton } from "@/components/ui/Skeleton";

export default function JobsLoading() {
  return (
    <AppShell title="Jobs">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <div className="mt-4">
        <ListSkeleton count={5} />
      </div>
    </AppShell>
  );
}
