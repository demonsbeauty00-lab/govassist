import { HTMLAttributes } from "react";
import { cx } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Colored left-edge strip used to encode status (eligible/caution/ineligible) at a glance. */
  stripColor?: string;
  interactive?: boolean;
}

export function Card({ stripColor, interactive, className, children, ...props }: CardProps) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded border border-hairline bg-paper-raised shadow-card",
        stripColor && "pl-4",
        interactive && "transition-shadow hover:shadow-raised active:shadow-card cursor-pointer",
        className
      )}
      {...props}
    >
      {stripColor && (
        <span
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: stripColor }}
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
}
