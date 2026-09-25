import { InputHTMLAttributes, forwardRef, useId } from "react";
import { cx } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-ink">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cx(
            "h-11 w-full rounded border bg-paper-raised px-3.5 text-[15px] text-ink placeholder:text-ink-faint",
            error ? "border-ineligible-fg" : "border-hairline focus-visible:border-brand-600",
            className
          )}
          {...props}
        />
        {error ? (
          <p id={`${inputId}-error`} className="text-sm text-ineligible-fg">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-sm text-ink-faint">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
