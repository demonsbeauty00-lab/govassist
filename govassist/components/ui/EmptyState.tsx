import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded border border-dashed border-hairline px-6 py-10 text-center">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <div className="space-y-1">
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
