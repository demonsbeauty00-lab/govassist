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

/** A generic rounded card with a few lines — the shape of most detail
 *  cards across the app (profile section, paper stats, result summary). */
export function CardRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded border border-hairline bg-paper-raised p-4">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3.5 w-1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Icon-row shape — Document Vault cards, quick-action tiles. */
export function TileSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded border border-hairline bg-paper-raised p-4">
      <Skeleton className="h-10 w-10 shrink-0 rounded" />
      <Skeleton className="h-4 flex-1" />
    </div>
  );
}

export function TileGridSkeleton({ count = 4, cols = 2 }: { count?: number; cols?: 2 | 4 }) {
  return (
    <div className={cx("grid gap-3", cols === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2")} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <TileSkeleton key={i} />
      ))}
    </div>
  );
}
