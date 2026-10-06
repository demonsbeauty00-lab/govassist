import { AppShell } from "@/components/layout/AppShell";
import { TileGridSkeleton, ListSkeleton } from "@/components/ui/Skeleton";

export default function PreparationLoading() {
  return (
    <AppShell title="Preparation">
      <TileGridSkeleton count={4} cols={2} />
      <div className="mt-4">
        <ListSkeleton count={3} />
      </div>
    </AppShell>
  );
}
