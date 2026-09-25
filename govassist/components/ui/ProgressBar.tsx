export function ProgressBar({ percent, colorClassName = "bg-accent-500" }: { percent: number; colorClassName?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-paper-sunk"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${colorClassName} transition-all`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
