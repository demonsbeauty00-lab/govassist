import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * This route starts an attempt (startAttemptAction) before rendering —
 * see lib/actions/pyq.ts, now parallelized but still the single slowest
 * page load in the app (several question/option rows). Without this file
 * the screen was blank until every question loaded; this at least shows
 * the question-card shape immediately.
 */
export default function AttemptLoading() {
  return (
    <AppShell title="Mock test" showBack>
      <p className="mt-2 text-sm text-ink-muted">Preparing your test…</p>
      <div className="mt-4 rounded border border-hairline bg-paper-raised p-4">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="mt-3 h-5 w-full" />
        <Skeleton className="mt-1.5 h-5 w-5/6" />
        <div className="mt-5 space-y-2.5">
          <Skeleton className="h-11 w-full rounded" />
          <Skeleton className="h-11 w-full rounded" />
          <Skeleton className="h-11 w-full rounded" />
          <Skeleton className="h-11 w-full rounded" />
        </div>
      </div>
    </AppShell>
  );
}
