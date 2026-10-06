import { CardRowsSkeleton } from "@/components/ui/Skeleton";

export default function AdminPyqReviewsLoading() {
  return (
    <div className="app-shell min-h-screen px-4 py-6">
      <div className="h-7 w-64 animate-pulse rounded bg-paper-sunk" />
      <div className="mt-6 space-y-3">
        <CardRowsSkeleton rows={3} />
        <CardRowsSkeleton rows={3} />
      </div>
    </div>
  );
}
