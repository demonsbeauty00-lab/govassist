import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, CardRowsSkeleton } from "@/components/ui/Skeleton";

export default function PaperDetailLoading() {
  return (
    <AppShell title="Paper details" showBack>
      <Skeleton className="h-6 w-2/3" />
      <div className="mt-4">
        <CardRowsSkeleton rows={4} />
      </div>
      <Skeleton className="mt-6 h-11 w-full rounded" />
    </AppShell>
  );
}
