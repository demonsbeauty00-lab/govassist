import { DEMO_MODE } from "@/lib/mock-data";

/**
 * Renders only while DEMO_MODE is on (see lib/mock-data.ts). Phase 2 removes
 * this once screens read from real, verified exam/profile data instead of
 * the sample content used to build the UI.
 */
export function DemoBanner({ label = "Sample data — for preview only" }: { label?: string }) {
  if (!DEMO_MODE) return null;
  return (
    <div className="flex items-center gap-2 border-b border-accent-400/40 bg-accent-100 px-4 py-1.5 text-xs font-medium text-accent-600">
      <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden="true" />
      {label}
    </div>
  );
}
