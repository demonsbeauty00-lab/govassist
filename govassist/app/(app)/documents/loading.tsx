import { AppShell } from "@/components/layout/AppShell";
import { TileGridSkeleton } from "@/components/ui/Skeleton";

export default function DocumentsLoading() {
  return (
    <AppShell title="Documents">
      <div className="mt-4">
        <TileGridSkeleton count={8} cols={2} />
      </div>
    </AppShell>
  );
}
