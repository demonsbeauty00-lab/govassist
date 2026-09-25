import { cx } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded bg-paper-sunk", className)} aria-hidden="true" />;
}

/** Skeleton shaped like an ExamCard — used on Jobs / My Exams while loading. */
export function ExamCardSkeleton() {
  return (
    <div className="rounded border border-hairline bg-paper-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-5 w-20 shrink-0" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 3, Item = ExamCardSkeleton }: { count?: number; Item?: React.ComponentType }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Item key={i} />
      ))}
    </div>
  );
}
