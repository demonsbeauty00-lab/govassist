import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, TileGridSkeleton, CardRowsSkeleton } from "@/components/ui/Skeleton";

export default function HomeLoading() {
  return (
    <AppShell variant="hamburger">
      <Skeleton className="mt-3 h-32 w-full rounded-xl" />
      <div className="mt-4">
        <TileGridSkeleton count={4} cols={4} />
      </div>
      <div className="mt-6 space-y-3">
        <CardRowsSkeleton rows={3} />
        <CardRowsSkeleton rows={2} />
      </div>
    </AppShell>
  );
}
