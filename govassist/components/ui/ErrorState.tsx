import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Couldn't load this",
  description = "Something went wrong on our end. Your data is safe — try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded border border-ineligible-fg/30 bg-ineligible-bg px-6 py-8 text-center"
    >
      <div className="space-y-1">
        <p className="font-medium text-ineligible-fg">{title}</p>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
